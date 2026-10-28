// Integration (Linux only: real SIGKILL, /proc dead proof): a queue worker killed at a cut point of
// the claim or the commit leaves records that the next process recovers. Exactly one commit exists
// with the right trailers, every operation is completed with it, no path was in two batches, nothing
// was committed that is not recorded, and the working tree is clean afterwards. Two processes never
// both execute a batch of one checkout.
import { randomUUID } from 'node:crypto';
import { readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { onLinux } from '../support/platform';

import { listDocumentBatches } from '../../src/specs/documents/queue/batch-store';
import { runQueueOnce } from '../../src/specs/documents/queue/worker';
import {
  findDocumentChangeJournal,
  listDocumentChangeJournals,
} from '../../src/specs/documents/write/journal-store';
import { removeTrackedRoots } from '../support/documents-fixture';
import {
  commitCount,
  committedPaths,
  engineCommits,
  isolatedQueue,
  queueProject,
  queueRecords,
  queueSave,
  trailersOf,
  workingTreeClean,
  type QueueProject,
} from '../support/document-queue';
import {
  awaitProcessMarker,
  readProcessCheckpoint,
  reapVitestWorker,
  spawnVitestWorker,
  terminateCheckpointPid,
  type IndependentVitestWorker,
} from '../support/process-worker';
import { notesPath } from '../support/document-writes';

const workers: IndependentVitestWorker[] = [];
const signals: string[] = [];
afterEach(async () => {
  await Promise.all(signals.splice(0).map((path) => rm(path, { force: true })));
  await Promise.all(workers.splice(0).map((worker) => reapVitestWorker(worker)));
  await removeTrackedRoots();
});

function spawnQueueWorker(project: QueueProject, cut: string) {
  // Outside the checkout: the working tree is asserted clean.
  const signal = join(tmpdir(), 'queue-worker-' + randomUUID() + '.checkpoint');
  signals.push(signal);
  const worker = spawnVitestWorker(
    'test/fixtures/queue-worker.test.ts',
    {
      NEVO_QUEUE_WORKER: '1',
      NEVO_QUEUE_WORKER_HOME: project.root,
      NEVO_QUEUE_WORKER_SIGNAL: signal,
      NEVO_QUEUE_WORKER_CUT: cut,
    },
    60000,
  );
  workers.push(worker);
  return { signal, worker };
}

/** Three queued saves: two of one document, one of another. */
async function queueThree(project: QueueProject): Promise<string[]> {
  return [
    await queueSave(project, 1, 'first\n'),
    await queueSave(project, 2, 'other\n'),
    await queueSave(project, 1, 'second\n'),
  ];
}

/**
 * The invariants of gate 3 after recovery: every Engine commit is recorded by the journals it names
 * (nothing committed that was not recorded), no operation is in two commits (no path in two batches),
 * the working tree is clean and the queue's records are gone.
 */
async function expectRecovered(project: QueueProject, ids: readonly string[], commits: number) {
  const shas = engineCommits(project);
  expect(shas).toHaveLength(commits);
  const seen = new Set<string>();
  for (const sha of shas) {
    const trailers = trailersOf(project, sha);
    const named = [
      trailers['Nevo-Operation']!,
      ...(trailers['Nevo-Coalesced'] ?? '').split(',').filter((part) => part !== ''),
    ];
    for (const operationId of named) {
      expect(seen.has(operationId)).toBe(false);
      seen.add(operationId);
      const journal = await findDocumentChangeJournal(project.engine.context, operationId);
      expect(journal).toMatchObject({ stage: 'completed', outcome: 'committed', sha });
    }
  }
  expect([...seen].sort()).toEqual([...ids].sort());
  expect(workingTreeClean(project)).toBe(true);
  expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
  expect(await listDocumentChangeJournals(project.engine.context)).toEqual([]);
}

const CUTS = [
  { cut: 'after-claim', resumes: true },
  { cut: 'before-commit', resumes: true },
  { cut: 'after-commit', resumes: true },
  { cut: 'after-batch-recorded', resumes: false },
  { cut: 'after-members-completed', resumes: false },
  { cut: 'after-settled', resumes: false },
] as const;

describe.skipIf(!onLinux)('a queue worker killed with SIGKILL', () => {
  for (const { cut, resumes } of CUTS) {
    it(`at ${cut}: the next process finishes it with exactly one commit`, async () => {
      const project = await queueProject();
      const ids = await queueThree(project);
      const before = commitCount(project);
      const { signal, worker } = spawnQueueWorker(project, cut);
      await awaitProcessMarker(signal, worker, 45000, 30);
      const checkpoint = await readProcessCheckpoint(signal, cut);

      // While the worker lives its lease holds: no other process executes the checkout's batch.
      const blocked = await runQueueOnce(project.engine, isolatedQueue(), undefined, {
        flush: true,
      });
      expect(blocked).toEqual({ status: 'busy', reason: 'lease-held' });
      const batches = await listDocumentBatches(project.engine.context);
      expect(batches.length).toBe(1);
      expect(batches[0]).toMatchObject({ operationId: ids[0], memberIds: ids.slice(0, 3) });
      expect(commitCount(project)).toBe(
        cut === 'before-commit' || cut === 'after-claim' ? before : before + 1,
      );

      await terminateCheckpointPid(checkpoint.pid, worker);

      const recovered = await runQueueOnce(project.engine, isolatedQueue(), undefined, {
        flush: true,
      });
      if (resumes) {
        expect(recovered).toMatchObject({ status: 'committed', resumed: true, batchId: ids[0] });
      } else {
        // The batch was recorded as committed: the members follow the record, Git is not touched.
        expect(recovered.status).toBe('idle');
      }
      await expectRecovered(project, ids, 1);
      expect(commitCount(project)).toBe(before + 1);

      const [sha] = engineCommits(project);
      expect(trailersOf(project, sha!)).toMatchObject({
        'Nevo-Operation': ids[0],
        'Nevo-Kind': 'document-change',
        'Nevo-Spec': project.specId,
        'Nevo-Action': 'save',
        'Nevo-Documents': `${notesPath(1)},${notesPath(2)}`,
        'Nevo-Coalesced': ids.slice(1).join(','),
      });
      expect(committedPaths(project, sha!)).toEqual(
        [1, 2].map((index) => `specs/active/hand/${notesPath(index)}`),
      );
      expect(
        (await readFile(join(project.dir, notesPath(1)), 'utf8')) +
          (await readFile(join(project.dir, notesPath(2)), 'utf8')),
      ).toBe('second\nother\n');
    }, 120000);
  }

  it('two processes never both execute: a second worker is refused while the first lives, a third takes the dead one over', async () => {
    const project = await queueProject();
    const ids = await queueThree(project);
    const first = spawnQueueWorker(project, 'before-commit');
    await awaitProcessMarker(first.signal, first.worker, 45000, 30);
    const paused = await readProcessCheckpoint(first.signal, 'before-commit');

    // A second PROCESS (not a second call in this one) finds the lease held by a live executor.
    const second = spawnQueueWorker(project, '');
    await awaitProcessMarker(second.signal, second.worker, 45000, 30);
    const outcome = JSON.parse(await readFile(second.signal, 'utf8')) as {
      result: { status: string; reason?: string };
    };
    expect(outcome.result).toEqual({ status: 'busy', reason: 'lease-held' });
    expect(await second.worker.done).toMatchObject({ code: 0 });
    expect(engineCommits(project)).toEqual([]);

    await terminateCheckpointPid(paused.pid, first.worker);
    const third = spawnQueueWorker(project, '');
    await awaitProcessMarker(third.signal, third.worker, 45000, 30);
    const taken = JSON.parse(await readFile(third.signal, 'utf8')) as {
      result: { status: string; resumed?: boolean };
    };
    expect(taken.result).toMatchObject({ status: 'committed', resumed: true });
    expect(await third.worker.done).toMatchObject({ code: 0 });
    await expectRecovered(project, ids, 1);
  }, 180000);
});

describe.skipIf(!onLinux)('two threads of one process', () => {
  it('never both execute: a worker thread does not take over the lease of another thread of the same process', async () => {
    const project = await queueProject();
    const ids = await queueThree(project);
    const holder = join(tmpdir(), 'queue-holder-' + randomUUID() + '.checkpoint');
    const peer = join(tmpdir(), 'queue-peer-' + randomUUID() + '.checkpoint');
    signals.push(holder, peer);
    // Two fixtures as two worker threads of ONE Vitest process: same PID, start time and boot id.
    const worker = spawnVitestWorker(
      ['test/fixtures/queue-thread-holder.test.ts', 'test/fixtures/queue-thread-peer.test.ts'],
      {
        NEVO_QUEUE_HOLDER: '1',
        NEVO_QUEUE_HOLDER_HOME: project.root,
        NEVO_QUEUE_HOLDER_SIGNAL: holder,
        NEVO_QUEUE_HOLDER_CUT: 'before-commit',
        NEVO_QUEUE_PEER: '1',
        NEVO_QUEUE_PEER_HOME: project.root,
        NEVO_QUEUE_PEER_SIGNAL: peer,
        NEVO_QUEUE_PEER_CUT: '',
        NEVO_QUEUE_PEER_AFTER: holder,
      },
      60000,
      ['--pool=threads', '--maxWorkers=2'],
    );
    workers.push(worker);
    await awaitProcessMarker(holder, worker, 60000, 30);
    await awaitProcessMarker(peer, worker, 60000, 30);
    const held = JSON.parse(await readFile(holder, 'utf8')) as { pid: number; threadId: number };
    const second = JSON.parse(await readFile(peer, 'utf8')) as {
      pid: number;
      threadId: number;
      result: unknown;
    };
    expect(second.pid).toBe(held.pid);
    expect(second.threadId).not.toBe(held.threadId);
    expect(second.result).toEqual({ status: 'busy', reason: 'lease-held' });
    expect(engineCommits(project)).toEqual([]);

    await terminateCheckpointPid(held.pid, worker);
    const recovered = await runQueueOnce(project.engine, isolatedQueue(), undefined, {
      flush: true,
    });
    expect(recovered).toMatchObject({ status: 'committed', resumed: true });
    await expectRecovered(project, ids, 1);
  }, 180000);
});

// Integration (Linux only: real SIGKILL, /proc dead proof): the cut points of the document write and
// commit pipeline that the writer and queue suites do not reach with a real kill: inside the Project
// Home control lock (it is never stolen; the operator takeover clears it), during the replace of the
// lease, between the claims of the members of a batch, and inside `git commit` with a hung filter
// (the parent and the Git process group killed: an orphan `index.lock`). After each one the work is
// finished exactly once, no operation is in two commits and the tree is clean.
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { afterEach, describe, expect, it } from 'vitest';

import { onLinux } from '../support/platform';

import {
  ProjectControlLockError,
  inspectProjectControlLock,
  withProjectControlLock,
} from '../../src/project/control-lock';
import { applyDocumentChange } from '../../src/specs/documents/api';
import { listDocumentBatches } from '../../src/specs/documents/queue/batch-store';
import { readQueueLease } from '../../src/specs/documents/queue/lease';
import { runQueueOnce } from '../../src/specs/documents/queue/worker';
import { takeOverDocumentQueue } from '../../src/specs/documents/scheduler';
import { findDocumentChangeJournal } from '../../src/specs/documents/write/journal-store';
import { removeTrackedRoots } from '../support/documents-fixture';
import { expectPipelineInvariants, SaveModel } from '../support/document-invariants';
import {
  manualClock,
  commitCount,
  engineCommits,
  isolatedQueue,
  queueProject,
  queueSave,
  type QueueProject,
} from '../support/document-queue';
import { notesPath, notesRevision } from '../support/document-writes';
import {
  awaitProcessMarker,
  readProcessCheckpoint,
  reapVitestWorker,
  spawnVitestWorker,
  terminateCheckpointPid,
  type IndependentVitestWorker,
} from '../support/process-worker';
import { git } from '../support/git-project';

const workers: IndependentVitestWorker[] = [];
const scratch: string[] = [];
afterEach(async () => {
  await Promise.all(scratch.splice(0).map((path) => rm(path, { force: true, recursive: true })));
  await Promise.all(workers.splice(0).map((worker) => reapVitestWorker(worker)));
  await removeTrackedRoots();
});

function spawnQueueWorker(project: QueueProject, cut: string) {
  // Outside the checkout: the working tree is asserted clean.
  const signal = join(tmpdir(), 'cutpoint-worker-' + randomUUID() + '.checkpoint');
  scratch.push(signal);
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

/** Three saves of two documents, queued and acknowledged. */
async function queueThree(project: QueueProject, model: SaveModel): Promise<string[]> {
  const saves: [number, string][] = [
    [1, 'first\n'],
    [2, 'other\n'],
    [1, 'second\n'],
  ];
  const ids: string[] = [];
  for (const [index, content] of saves) {
    const id = await queueSave(project, index, content);
    model.acknowledge(id, notesPath(index), content);
    ids.push(id);
  }

  return ids;
}

/** The control lock is held, by `pid`, and nothing steals it: a second taker waits and gives up. */
async function expectLockStalled(project: QueueProject, pid: number): Promise<void> {
  expect(await inspectProjectControlLock(project.engine.context)).toMatchObject({
    status: 'held',
    pid,
  });
  const error = await withProjectControlLock(project.engine.context, () => Promise.resolve(), {
    waitMs: 150,
    retryMs: 25,
  }).then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(ProjectControlLockError);
  expect(error).toMatchObject({ code: 'CONTROL_LOCK_BUSY' });
  // Still there: nothing removed it by age, PID or timeout.
  expect(await inspectProjectControlLock(project.engine.context)).toMatchObject({
    status: 'held',
    pid,
  });
}

/** Waits until the process no longer exists, so that nothing it was doing can still be recorded. */
async function processGone(pid: number): Promise<void> {
  for (let tries = 0; tries < 400; tries += 1) {
    try {
      process.kill(pid, 0);
    } catch {
      return;
    }

    await sleep(10);
  }

  throw new Error('The killed process still exists: ' + pid);
}

/** Exactly one Engine commit names all the operations; no operation is anywhere else. */
async function expectOneCommit(project: QueueProject, ids: readonly string[], before: number) {
  expect(commitCount(project)).toBe(before + 1);
  const [sha] = engineCommits(project);
  expect(engineCommits(project)).toHaveLength(1);
  for (const id of ids) {
    expect(await findDocumentChangeJournal(project.engine.context, id)).toMatchObject({
      stage: 'completed',
      outcome: 'committed',
      sha,
    });
  }
}

describe.skipIf(!onLinux)('a queue worker killed between the claims of a batch', () => {
  for (const claimed of [1, 2, 3]) {
    it(`after member ${claimed} of 3 is claimed: the next process finishes the batch once`, async () => {
      const project = await queueProject();
      const model = new SaveModel();
      const ids = await queueThree(project, model);
      const before = commitCount(project);
      const { signal, worker } = spawnQueueWorker(project, `member-claimed-${claimed}`);
      await awaitProcessMarker(signal, worker, 45000, 30);
      const checkpoint = await readProcessCheckpoint(signal, `member-claimed-${claimed}`);
      await terminateCheckpointPid(checkpoint.pid, worker);

      // The batch record is already written: it refuses overlapping reservations, whatever k is.
      const batches = await listDocumentBatches(project.engine.context);
      expect(batches).toHaveLength(1);
      expect(batches[0]).toMatchObject({ state: 'committing', memberIds: ids });
      await expectPipelineInvariants(project, model, 'stopped');

      const recovered = await runQueueOnce(project.engine, isolatedQueue(), undefined, {
        flush: true,
      });
      expect(recovered).toMatchObject({ status: 'committed', resumed: true });
      await expectOneCommit(project, ids, before);
      await expectPipelineInvariants(project, model, 'drained');
    }, 120000);
  }
});

describe.skipIf(!onLinux)('a queue worker killed inside the control lock', () => {
  for (const cut of ['in-claim-after-lease', 'in-claim-after-record'] as const) {
    it(`at ${cut}: the lock stalls the project until the operator takeover clears it`, async () => {
      const project = await queueProject();
      const model = new SaveModel();
      const ids = await queueThree(project, model);
      const before = commitCount(project);
      const { signal, worker } = spawnQueueWorker(project, cut);
      await awaitProcessMarker(signal, worker, 45000, 30);
      const checkpoint = await readProcessCheckpoint(signal, cut);

      // A live holder is never overridden, not even on the operator's assertion.
      expect(await takeOverDocumentQueue(project.engine, { confirmExecutorStopped: true })).toEqual(
        {
          lock: { status: 'refused', reason: 'holder-alive' },
          writes: [],
          manualCommits: [],
          passes: [],
        },
      );
      await terminateCheckpointPid(checkpoint.pid, worker);

      // The holder is dead and the lock stays: documented stall of document operations and Create.
      await expectLockStalled(project, checkpoint.pid);
      expect(
        await takeOverDocumentQueue(project.engine, { confirmExecutorStopped: false }),
      ).toEqual({
        lock: { status: 'refused', reason: 'assertion-missing' },
        writes: [],
        manualCommits: [],
        passes: [],
      });
      expect(engineCommits(project)).toEqual([]);
      expect(await inspectProjectControlLock(project.engine.context)).toMatchObject({
        status: 'held',
        pid: checkpoint.pid,
      });

      const taken = await takeOverDocumentQueue(project.engine, {
        confirmExecutorStopped: true,
        queue: isolatedQueue(),
      });
      expect(taken.lock).toMatchObject({ status: 'cleared', holder: { pid: checkpoint.pid } });
      expect(taken.passes[0]?.results[0]).toMatchObject({ status: 'committed' });
      expect(await inspectProjectControlLock(project.engine.context)).toEqual({ status: 'free' });
      await expectOneCommit(project, ids, before);
      await expectPipelineInvariants(project, model, 'drained');
    }, 120000);
  }

  it('during the replace of the lease: the record names the new executor, the lease the old one, and the takeover finishes it', async () => {
    const project = await queueProject();
    const model = new SaveModel();
    const ids = await queueThree(project, model);
    const before = commitCount(project);

    const first = spawnQueueWorker(project, 'before-commit');
    await awaitProcessMarker(first.signal, first.worker, 45000, 30);
    const executor = await readProcessCheckpoint(first.signal, 'before-commit');
    await terminateCheckpointPid(executor.pid, first.worker);

    // The second process proves the first dead and starts to take the batch over; it stops after the
    // batch record was replaced and before the lease was.
    const second = spawnQueueWorker(project, 'in-resume-after-record');
    await awaitProcessMarker(second.signal, second.worker, 45000, 30);
    const resumer = await readProcessCheckpoint(second.signal, 'in-resume-after-record');
    expect(resumer.pid).not.toBe(executor.pid);
    await terminateCheckpointPid(resumer.pid, second.worker);

    const [batch] = await listDocumentBatches(project.engine.context);
    expect(batch?.executor?.pid).toBe(resumer.pid);
    const lease = await readQueueLease(project.engine.context, project.workspaceId);
    expect(lease?.executor.pid).toBe(executor.pid);
    await expectLockStalled(project, resumer.pid);
    await expectPipelineInvariants(project, model, 'stopped');

    const taken = await takeOverDocumentQueue(project.engine, {
      confirmExecutorStopped: true,
      queue: isolatedQueue(),
    });
    expect(taken.lock.status).toBe('cleared');
    expect(taken.passes[0]?.results[0]).toMatchObject({ status: 'committed', resumed: true });
    await expectOneCommit(project, ids, before);
    await expectPipelineInvariants(project, model, 'drained');
  }, 180000);
});

describe.skipIf(!onLinux)('a commit killed inside git with a hung filter', () => {
  /**
   * A clean filter that hangs while the flag exists and Git holds `index.lock`: that is, inside the
   * mutation. It records the process group it runs in so that the test can kill Git itself, as a
   * machine failure or an OOM kill of the whole group would.
   */
  async function hungFilter(project: QueueProject) {
    const gitDir = join(project.root, '.git');
    const flag = join(gitDir, 'hang-flag');
    const groupFile = join(gitDir, 'filter.group');
    const script = join(gitDir, 'hang-clean.sh');
    await writeFile(
      script,
      [
        `if [ -e "${flag}" ] && [ -e "${gitDir}/index.lock" ]; then`,
        `  ps -o pgid= -p $$ | tr -d ' ' > "${groupFile}.tmp"; mv "${groupFile}.tmp" "${groupFile}"`,
        '  sleep 600 & wait',
        'fi',
        'cat',
        '',
      ].join('\n'),
    );
    git(project.root, 'config', 'filter.hang.clean', `sh "${script}"`);
    await writeFile(join(project.dir, '.gitattributes'), '*.md filter=hang\n');
    git(project.root, 'add', '--', 'specs');
    git(
      project.root,
      '-c',
      'user.name=T',
      '-c',
      'user.email=t@example.invalid',
      'commit',
      '-qm',
      'filter',
    );

    return { flag, groupFile };
  }

  it('leaves an orphan index.lock; the retry waits for the blocker and commits once it is gone', async () => {
    const project = await queueProject();
    const filter = await hungFilter(project);
    const model = new SaveModel();
    const ids = await queueThree(project, model);
    const before = commitCount(project);
    await writeFile(filter.flag, '');

    const { signal, worker } = spawnQueueWorker(project, 'announce-before-commit');
    await awaitProcessMarker(filter.groupFile, worker, 60000, 30);
    const runner = await readProcessCheckpoint(signal, 'announced');
    const group = Number((await readFile(filter.groupFile, 'utf8')).trim());
    expect(Number.isSafeInteger(group) && group > 1).toBe(true);
    // The test process is not in that group (the port runs Git in a group of its own).
    expect(group).not.toBe(
      Number(
        execFileSync('ps', ['-o', 'pgid=', '-p', String(process.pid)], { encoding: 'utf8' }).trim(),
      ),
    );
    // The runner first (it would record the failure of Git), then the group of Git and its filter.
    process.kill(runner.pid, 'SIGKILL');
    await processGone(runner.pid);
    process.kill(-group, 'SIGKILL');
    await worker.done;
    await rm(signal, { force: true });
    // The blocker is the orphan lock from here on; a filter that still hung would stall every Git read.
    await rm(filter.flag);

    expect(
      await readFile(join(project.root, '.git', 'index.lock'), 'utf8').then(
        () => true,
        () => false,
      ),
    ).toBe(true);
    expect(commitCount(project)).toBe(before);
    await expectPipelineInvariants(project, model, 'stopped');

    // A blocker that passes by itself is waited for: nothing is committed, nothing is lost.
    const blocked = await runQueueOnce(project.engine, isolatedQueue(), undefined, { flush: true });
    expect(blocked.status).not.toBe('committed');
    expect(commitCount(project)).toBe(before);

    await rm(join(project.root, '.git', 'index.lock'));
    // The attempt that met the lock is recorded as a transient blocker with a backoff; once the
    // blocker is gone and the backoff is over, the next pass commits.
    expect(blocked).toMatchObject({
      status: 'failed',
      outcome: 'requeued',
      reason: 'index-locked',
    });
    const later = manualClock();
    later.wallAt(Date.now() + 10 * 60_000);
    await runQueueOnce(project.engine, isolatedQueue({ clock: later }), undefined, { flush: true });
    await expectOneCommit(project, ids, before);
    await expectPipelineInvariants(project, model, 'drained');
  }, 180000);
});

describe.skipIf(!onLinux)('a writer killed inside the control lock', () => {
  it('before its journal is published: nothing is journaled and the same id writes after the takeover', async () => {
    const project = await queueProject();
    const operationId = randomUUID();
    const signal = join(tmpdir(), 'cutpoint-writer-' + randomUUID() + '.checkpoint');
    scratch.push(signal);
    const worker = spawnVitestWorker(
      'test/fixtures/crash-document-worker.test.ts',
      {
        NEVO_DOCUMENT_CRASH_WORKER: '1',
        NEVO_DOCUMENT_CRASH_HOME: project.root,
        NEVO_DOCUMENT_CRASH_SIGNAL: signal,
        NEVO_DOCUMENT_CRASH_CUT: 'before-reservation-publish',
        NEVO_DOCUMENT_CRASH_MODE: 'write',
        NEVO_DOCUMENT_CRASH_LAST_INDEX: '0',
        NEVO_DOCUMENT_CRASH_REQUEST: JSON.stringify({
          action: 'save',
          documentId: 'notes-1',
          content: 'never journaled\n',
          expectedRevision: notesRevision(1),
        }),
        NEVO_DOCUMENT_CRASH_SPEC: project.specId,
        NEVO_DOCUMENT_CRASH_OPERATION: operationId,
      },
      60000,
    );
    workers.push(worker);
    await awaitProcessMarker(signal, worker, 45000, 30);
    const checkpoint = await readProcessCheckpoint(signal, 'before-reservation-publish');
    await terminateCheckpointPid(checkpoint.pid, worker);

    expect(await findDocumentChangeJournal(project.engine.context, operationId)).toBeUndefined();
    expect(await readFile(join(project.dir, notesPath(1)), 'utf8')).toBe('notes 1\n');
    await expectLockStalled(project, checkpoint.pid);

    const taken = await takeOverDocumentQueue(project.engine, { confirmExecutorStopped: true });
    expect(taken.lock.status).toBe('cleared');

    const result = await applyDocumentChange(project.engine, project.specId, operationId, {
      action: 'save',
      documentId: 'notes-1',
      content: 'never journaled\n',
      expectedRevision: notesRevision(1),
    });
    expect(result).toMatchObject({ stage: 'queued' });
    expect(await readFile(join(project.dir, notesPath(1)), 'utf8')).toBe('never journaled\n');
  }, 120000);
});

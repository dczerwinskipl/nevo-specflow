// Integration (real project, real Git): the scheduler of the document commit queue on fake timers,
// the shutdown flush, the startup pass after a crash, and the operator takeover. Nothing here waits
// for wall-clock time: the scheduler's timers and the queue's clocks are the test's.
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { onLinux } from '../support/platform';

import { projectControlLockPath } from '../../src/project/control-lock';
import type { DocumentChangeRequest } from '../../src/specs/documents/changes/plan/request';
import { runQueueOnce } from '../../src/specs/documents/queue/worker';
import { QueueInterrupted } from '../../src/specs/documents/queue/types';
import { SettleLedger } from '../../src/specs/documents/queue/settle-ledger';
import {
  createDocumentQueueScheduler,
  takeOverDocumentQueue,
  type SchedulerOptions,
} from '../../src/specs/documents/scheduler';
import {
  findDocumentChangeJournal,
  listDocumentChangeJournals,
} from '../../src/specs/documents/write/journal-store';
import { removeTrackedRoots } from '../support/documents-fixture';
import { notesRevision } from '../support/document-writes';
import {
  commitCount,
  engineCommits,
  queueProject,
  queueRecords,
  queueSave,
  trailersOf,
  workingTreeClean,
  type QueueProject,
} from '../support/document-queue';
import { FakeTime } from '../support/fake-time';
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
afterEach(async () => {
  await Promise.all(workers.splice(0).map((worker) => reapVitestWorker(worker)));
  await removeTrackedRoots();
});

interface Fixture {
  readonly project: QueueProject;
  readonly time: FakeTime;
  readonly scheduler: ReturnType<typeof createDocumentQueueScheduler>;
}

async function fixture(options: Partial<SchedulerOptions> = {}): Promise<Fixture> {
  const project = await queueProject();

  return { project, ...scheduleFor(project, options) };
}

function scheduleFor(project: QueueProject, options: Partial<SchedulerOptions> = {}) {
  const time = new FakeTime();
  const scheduler = createDocumentQueueScheduler(project.engine, {
    clock: time,
    timers: time,
    queue: { ledger: new SettleLedger(), clock: time },
    ...options,
  });

  return { time, scheduler };
}

/**
 * Every operation ended `completed` with one commit, every Engine commit is the commit of at least
 * one of them (nothing was committed that is not recorded) and the tree is clean.
 */
async function expectEachCommittedOnce(project: QueueProject, ids: readonly string[]) {
  const recorded = new Set<string>();
  for (const operationId of ids) {
    const journal = await findDocumentChangeJournal(project.engine.context, operationId);
    expect(journal).toMatchObject({ stage: 'completed', outcome: 'committed' });
    recorded.add(journal!.sha!);
  }

  expect(new Set(engineCommits(project))).toEqual(recorded);
  expect(engineCommits(project)).toHaveLength(recorded.size);
  for (const sha of recorded) {
    const batchId = trailersOf(project, sha)['Nevo-Operation']!;
    expect(ids).toContain(batchId);
  }

  expect(workingTreeClean(project)).toBe(true);
}

describe('timers and wake-ups', () => {
  it('commits a burst of saves as one commit once the settle period passed', async () => {
    const { project, time, scheduler } = await fixture();
    await scheduler.start();
    const ids = [
      await queueSave(project, 1, 'one\n'),
      await queueSave(project, 1, 'two\n'),
      await queueSave(project, 2, 'other\n'),
    ];
    await scheduler.wake();
    const before = commitCount(project);

    time.advance(299);
    await scheduler.whenIdle();
    expect(commitCount(project)).toBe(before);

    time.advance(1);
    await scheduler.whenIdle();
    expect(commitCount(project)).toBe(before + 1);
    await expectEachCommittedOnce(project, ids);
    await scheduler.stop();
  });

  it('after a restart inside the settle window the new scheduler waits the settle again, then commits', async () => {
    const first = await fixture();
    await first.scheduler.start();
    const ids = [await queueSave(first.project, 1, 'before the restart\n')];
    await first.scheduler.stop();
    expect(engineCommits(first.project)).toEqual([]);

    const { time, scheduler } = scheduleFor(first.project);
    // The operation has been in the queue 100 ms when the new scheduler first looks at it.
    const queued = await findDocumentChangeJournal(first.project.engine.context, ids[0]!);
    time.pinWall(Date.parse(queued!.queuedAt!) + 100);
    await scheduler.start();
    time.advance(0);
    await scheduler.whenIdle();
    // The queue reports what is left of the settle; nothing is committed yet.
    expect(engineCommits(first.project)).toEqual([]);
    expect(time.dueIn().filter((due) => due < 1000)).toEqual([200]);
    const wait = 200;

    time.advance(wait);
    await scheduler.whenIdle();
    await expectEachCommittedOnce(first.project, ids);
    await scheduler.stop();
  });

  it('wakes on a finished write by itself (the in-process notice)', async () => {
    const { project, time, scheduler } = await fixture();
    await scheduler.start();
    await queueSave(project, 1, 'noticed\n');
    // The notice arms the timer asynchronously; the first look at the timers waits for it.
    for (let tries = 0; time.dueIn().length < 2 && tries < 5000; tries += 1) {
      await new Promise((resolve) => setImmediate(resolve));
    }

    expect(time.dueIn().some((due) => due <= 300)).toBe(true);
    await scheduler.stop();
  });

  it('keeps one commit per burst while writers and passes interleave', async () => {
    const { project, time, scheduler } = await fixture();
    await scheduler.start();
    const ids: string[] = [];
    // Different documents in parallel, several versions each, with passes in between.
    for (let round = 1; round <= 3; round += 1) {
      const batch = await Promise.all(
        [1, 2, 3, 4].map((index) => queueSave(project, index, `round ${round} of ${index}\n`)),
      );
      ids.push(...batch);
      await scheduler.wake();
      time.advance(150);
      await scheduler.whenIdle();
    }

    time.advance(1000);
    await scheduler.whenIdle();
    await scheduler.stop({ flush: true });
    await expectEachCommittedOnce(project, ids);
    expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
  });

  it('serves a pass and an explicit run of the same process one at a time', async () => {
    const { project, time, scheduler } = await fixture();
    await scheduler.start();
    await queueSave(project, 1, 'raced\n');
    await scheduler.wake();
    time.advance(300);
    const direct = await runQueueOnce(
      project.engine,
      { ledger: new SettleLedger(), clock: time },
      undefined,
      { flush: true },
    );
    await scheduler.whenIdle();
    expect(['busy', 'committed']).toContain(direct.status);
    expect(engineCommits(project)).toHaveLength(1);
    await scheduler.stop();
  });
});

describe('shutdown flush', () => {
  it('commits what is queued at once, without waiting for the settle period', async () => {
    const { project, scheduler } = await fixture();
    await scheduler.start();
    const ids = [await queueSave(project, 1, 'last words\n'), await queueSave(project, 2, 'bye\n')];

    const outcome = await scheduler.stop({ flush: true, deadlineMs: 10_000 });
    expect(outcome).toEqual({ complete: true, timedOut: false, remaining: 0 });
    await expectEachCommittedOnce(project, ids);
  });

  it('leaves the journals queued when the deadline passes, and the next scheduler finishes them', async () => {
    const hold: { open?: () => void } = {};
    const gate = new Promise<void>((resolve) => {
      hold.open = resolve;
    });
    let reached: () => void = () => undefined;
    const atCommit = new Promise<void>((resolve) => {
      reached = resolve;
    });
    let finished: () => void = () => undefined;
    const done = new Promise<void>((resolve) => {
      finished = resolve;
    });
    const project = await queueProject();
    const time = new FakeTime();
    const scheduler = createDocumentQueueScheduler(project.engine, {
      clock: time,
      timers: time,
      queue: {
        ledger: new SettleLedger(),
        clock: time,
        hooks: {
          beforeCommit: async () => {
            reached();
            await gate;
          },
          afterSettled: () => {
            finished();

            return Promise.resolve();
          },
        },
      },
    });
    await scheduler.start();
    const ids = [await queueSave(project, 1, 'unfinished\n')];

    const stopping = scheduler.stop({ flush: true, deadlineMs: 10_000 });
    await atCommit;
    time.advance(10_000);
    expect(await stopping).toEqual({ complete: false, timedOut: true, remaining: 1 });
    const journal = await findDocumentChangeJournal(project.engine.context, ids[0]!);
    expect(journal?.stage).toBe('committing');

    // The process would exit now; the hung commit is let go here only so the test can end.
    hold.open?.();
    await done;
    await expectEachCommittedOnce(project, ids);
  });

  it('is a no-op for a project with nothing queued', async () => {
    const { scheduler } = await fixture();
    await scheduler.start();
    expect(await scheduler.stop({ flush: true })).toEqual({
      complete: true,
      timedOut: false,
      remaining: 0,
    });
  });
});

describe.skipIf(!onLinux)('after a crash (SIGKILL, /proc dead proof)', () => {
  it('the startup pass rolls an interrupted write forward and commits it', async () => {
    const project = await queueProject();
    const signal = join(tmpdir(), 'scheduler-writer-' + randomUUID() + '.checkpoint');
    const request: DocumentChangeRequest = {
      action: 'rename',
      target: { kind: 'document', documentId: 'notes-1' },
      name: 'renamed.md',
      expectedRevision: notesRevision(1),
    };
    const operationId = randomUUID();
    const worker = spawnVitestWorker(
      'test/fixtures/crash-document-worker.test.ts',
      {
        NEVO_DOCUMENT_CRASH_WORKER: '1',
        NEVO_DOCUMENT_CRASH_HOME: project.root,
        NEVO_DOCUMENT_CRASH_SIGNAL: signal,
        NEVO_DOCUMENT_CRASH_CUT: 'mid-files',
        NEVO_DOCUMENT_CRASH_MODE: 'write',
        NEVO_DOCUMENT_CRASH_LAST_INDEX: '2',
        NEVO_DOCUMENT_CRASH_REQUEST: JSON.stringify(request),
        NEVO_DOCUMENT_CRASH_SPEC: project.specId,
        NEVO_DOCUMENT_CRASH_OPERATION: operationId,
      },
      60000,
    );
    workers.push(worker);
    await awaitProcessMarker(signal, worker, 45000, 30);
    const checkpoint = await readProcessCheckpoint(signal, 'mid-files');
    await terminateCheckpointPid(checkpoint.pid, worker);
    expect((await findDocumentChangeJournal(project.engine.context, operationId))?.stage).toBe(
      'files-writing',
    );

    const { time, scheduler } = scheduleFor(project);
    await scheduler.start();
    expect((await findDocumentChangeJournal(project.engine.context, operationId))?.stage).toBe(
      'queued',
    );
    time.advance(0);
    await scheduler.whenIdle();
    time.advance(500);
    await scheduler.whenIdle();
    await expectEachCommittedOnce(project, [operationId]);
    await scheduler.stop();
  }, 120000);

  it('the startup pass resumes a batch whose executor was killed before the commit', async () => {
    const project = await queueProject();
    const ids = [await queueSave(project, 1, 'first\n'), await queueSave(project, 2, 'other\n')];
    const signal = join(tmpdir(), 'scheduler-queue-' + randomUUID() + '.checkpoint');
    const worker = spawnVitestWorker(
      'test/fixtures/queue-worker.test.ts',
      {
        NEVO_QUEUE_WORKER: '1',
        NEVO_QUEUE_WORKER_HOME: project.root,
        NEVO_QUEUE_WORKER_SIGNAL: signal,
        NEVO_QUEUE_WORKER_CUT: 'before-commit',
      },
      60000,
    );
    workers.push(worker);
    await awaitProcessMarker(signal, worker, 45000, 30);
    const checkpoint = await readProcessCheckpoint(signal, 'before-commit');
    expect(engineCommits(project)).toEqual([]);
    await terminateCheckpointPid(checkpoint.pid, worker);

    const { time, scheduler } = scheduleFor(project);
    await scheduler.start();
    time.advance(0);
    await scheduler.whenIdle();
    await expectEachCommittedOnce(project, ids);
    expect(engineCommits(project)).toHaveLength(1);
    expect(await listDocumentChangeJournals(project.engine.context)).toEqual([]);
    await scheduler.stop();
  }, 120000);

  it('the operator takeover leaves a live executor alone and takes a dead one over', async () => {
    const project = await queueProject();
    const ids = [await queueSave(project, 1, 'first\n')];
    const signal = join(tmpdir(), 'scheduler-takeover-' + randomUUID() + '.checkpoint');
    const worker = spawnVitestWorker(
      'test/fixtures/queue-worker.test.ts',
      {
        NEVO_QUEUE_WORKER: '1',
        NEVO_QUEUE_WORKER_HOME: project.root,
        NEVO_QUEUE_WORKER_SIGNAL: signal,
        NEVO_QUEUE_WORKER_CUT: 'before-commit',
      },
      60000,
    );
    workers.push(worker);
    await awaitProcessMarker(signal, worker, 45000, 30);
    const checkpoint = await readProcessCheckpoint(signal, 'before-commit');

    const refused = await takeOverDocumentQueue(project.engine, {
      confirmExecutorStopped: true,
      queue: { ledger: new SettleLedger() },
    });
    expect(refused.passes).toEqual([
      { workspaceId: project.workspaceId, results: [{ status: 'busy', reason: 'lease-held' }] },
    ]);
    expect(engineCommits(project)).toEqual([]);

    await terminateCheckpointPid(checkpoint.pid, worker);
    const taken = await takeOverDocumentQueue(project.engine, {
      confirmExecutorStopped: true,
      queue: { ledger: new SettleLedger() },
    });
    expect(taken.passes[0]?.results[0]).toMatchObject({ status: 'committed', resumed: true });
    await expectEachCommittedOnce(project, ids);
  }, 120000);
});

describe('operator takeover', () => {
  it('does nothing without the assertion', async () => {
    const project = await queueProject();
    await queueSave(project, 1, 'waiting\n');
    const result = await takeOverDocumentQueue(project.engine, { confirmExecutorStopped: false });
    expect(result).toEqual({
      lock: { status: 'refused', reason: 'assertion-missing' },
      writes: [],
      manualCommits: [],
      passes: [],
    });
    expect(engineCommits(project)).toEqual([]);
  });

  it('takes over the lease of an executor that cannot be proven dead, on the assertion only', async () => {
    const project = await queueProject();
    const ids = [await queueSave(project, 1, 'left behind\n')];
    // A run that stopped inside the claim, recorded as another host's process.
    const foreign = { pid: 424242, hostId: 'some-other-host', platform: 'elsewhere', threadId: 0 };
    await expect(
      runQueueOnce(
        project.engine,
        {
          ledger: new SettleLedger(),
          executor: foreign,
          hooks: {
            afterClaim: () => Promise.reject(new QueueInterrupted('after the claim')),
          },
        },
        undefined,
        { flush: true },
      ),
    ).rejects.toBeInstanceOf(QueueInterrupted);
    expect((await queueRecords(project)).lease).toBe(true);

    // Without the assertion the executor is unknown: the lease is held.
    expect(
      await runQueueOnce(project.engine, { ledger: new SettleLedger() }, undefined, {
        flush: true,
      }),
    ).toEqual({ status: 'busy', reason: 'lease-held' });

    const taken = await takeOverDocumentQueue(project.engine, {
      confirmExecutorStopped: true,
      queue: { ledger: new SettleLedger() },
    });
    expect(taken.lock).toEqual({ status: 'free' });
    expect(taken.passes[0]?.results[0]).toMatchObject({ status: 'committed', resumed: true });
    await expectEachCommittedOnce(project, ids);
  });

  it('clears a control lock left by a holder that is gone and then drains the queue', async () => {
    const project = await queueProject();
    const ids = [await queueSave(project, 1, 'behind a stale lock\n')];
    const path = projectControlLockPath(project.engine.context);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        projectId: project.engine.context.project.projectId,
        token: randomUUID(),
        pid: 2_000_000_000,
        createdAt: new Date().toISOString(),
      }) + '\n',
    );

    const taken = await takeOverDocumentQueue(project.engine, {
      confirmExecutorStopped: true,
      lock: { probe: () => 'dead' },
      queue: { ledger: new SettleLedger() },
    });
    expect(taken.lock.status).toBe('cleared');
    expect(taken.passes[0]?.results[0]).toMatchObject({ status: 'committed' });
    await expectEachCommittedOnce(project, ids);
  });

  it('refuses to touch the control lock of a live holder and drains nothing', async () => {
    const project = await queueProject();
    await queueSave(project, 1, 'waiting\n');
    const path = projectControlLockPath(project.engine.context);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(
      path,
      JSON.stringify({
        version: 1,
        projectId: project.engine.context.project.projectId,
        token: randomUUID(),
        pid: 2_000_000_000,
        createdAt: new Date().toISOString(),
      }) + '\n',
    );
    const taken = await takeOverDocumentQueue(project.engine, {
      confirmExecutorStopped: true,
      lock: { probe: () => 'alive' },
    });
    expect(taken).toEqual({
      lock: { status: 'refused', reason: 'holder-alive' },
      writes: [],
      manualCommits: [],
      passes: [],
    });
    expect(git(project.root, 'status', '--porcelain')).not.toBe('');
  });
});

// Integration (real project, real Git; no process is killed): a simulation of the whole write and
// commit state machine with a stop at EVERY journal write of a run that saves, queues, commits and
// settles. After the stop the process is "dead": every later record write fails until the test
// recovers, exactly as in a process that was killed. Then, before anything recovers it, the
// invariants of any instant hold (see `expectPipelineInvariants`); then the client repeats the saves
// that were not acknowledged with their operation ids, the queue drains, and the end state is the
// same as without the stop: one commit, every operation completed, a clean tree.
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { sha256Hex } from '../src/hash';
import { applyDocumentChange } from '../src/specs/documents/api';
import { QueueInterrupted } from '../src/specs/documents/queue/types';
import { drainQueue, runQueueOnce } from '../src/specs/documents/queue/worker';
import { CloseOperationError, reserveCloseOperation } from '../src/testing';
import { removeTrackedRoots } from './support/documents-fixture';
import { expectPipelineInvariants, SaveModel } from './support/document-invariants';
import {
  clockAfterBackoff,
  commitCount,
  engineCommits,
  isolatedQueue,
  queueProject,
  type QueueProject,
} from './support/document-queue';
import { GIT_ON, notesPath, notesText } from './support/document-writes';
import { commitStaged, git } from './support/git-project';

const control = vi.hoisted(
  (): {
    armed: boolean;
    count: number;
    failAt: number;
    dead: boolean;
    mode: 'record' | 'rename';
  } => ({
    armed: false,
    count: 0,
    failAt: 0,
    dead: false,
    /** What is counted: whole record publishes (journals, batches, leases) or every rename of any durable file. */
    mode: 'record',
  }),
);

/** The next durable step of the run; the process is dead from the chosen one on. */
function durableStep(kind: 'record' | 'rename'): void {
  if (!control.armed) return;
  if (control.mode === kind) {
    control.count += 1;
    if (control.count === control.failAt) control.dead = true;
  }
  if (control.dead) throw new QueueInterrupted('a durable step');
}

vi.mock('../src/project/fs/atomic-json', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/project/fs/atomic-json')>();
  return {
    ...original,
    writeJsonAtomically: async (...args: Parameters<typeof original.writeJsonAtomically>) => {
      durableStep('record');
      return original.writeJsonAtomically(...args);
    },
  };
});

vi.mock('../src/project/fs/windows-safe-fs', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/project/fs/windows-safe-fs')>();
  return {
    ...original,
    renameWindowsSafe: (...args: Parameters<typeof original.renameWindowsSafe>) => {
      durableStep('rename');
      return original.renameWindowsSafe(...args);
    },
  };
});

afterEach(async () => {
  control.armed = false;
  control.dead = false;
  control.mode = 'record';
  await removeTrackedRoots();
});

const FLUSH = { flush: true } as const;

/** The saves of the run: the same document twice, and a second one, in this order. */
const SAVES = [
  { index: 1, content: 'one\n' },
  { index: 2, content: 'two\n' },
  { index: 1, content: 'three\n' },
] as const;

interface Run {
  readonly project: QueueProject;
  readonly model: SaveModel;
  readonly ids: readonly string[];
}

/** The body of save `n`: the revision it expects is that of the previous save of the same document. */
function saveBody(n: number) {
  const save = SAVES[n]!;
  const previous = SAVES.slice(0, n)
    .filter((earlier) => earlier.index === save.index)
    .at(-1);
  return {
    action: 'save' as const,
    documentId: `notes-${save.index}`,
    content: save.content,
    expectedRevision: sha256Hex(previous?.content ?? notesText(save.index)),
  };
}

async function saveAll(run: Run, acknowledged: Set<number>): Promise<void> {
  for (const [n, save] of SAVES.entries()) {
    if (acknowledged.has(n)) continue;
    const path = notesPath(save.index);
    run.model.attempt(path, save.content);
    await applyDocumentChange(run.project.engine, run.project.specId, run.ids[n]!, saveBody(n));
    run.model.acknowledge(run.ids[n]!, path, save.content);
    acknowledged.add(n);
  }
}

async function recoverQueue(project: QueueProject): Promise<void> {
  for (let pass = 0; pass < 3; pass += 1) {
    await drainQueue(
      project.engine,
      isolatedQueue({ clock: clockAfterBackoff() }),
      undefined,
      FLUSH,
    );
  }
}

/** Runs the pipeline once; `failAt` > 0 kills it before that record write. Returns the writes counted. */
async function runPipeline(
  mode: 'record' | 'rename',
  failAt: number,
  act: (run: Run, acknowledged: Set<number>) => Promise<unknown>,
  finish: (run: Run, acknowledged: Set<number>) => Promise<void>,
  project: () => Promise<QueueProject> = queueProject,
): Promise<number> {
  const run: Run = {
    project: await project(),
    model: new SaveModel(),
    ids: SAVES.map(() => randomUUID()),
  };
  const acknowledged = new Set<number>();
  control.mode = mode;
  control.count = 0;
  control.failAt = failAt;
  control.dead = false;
  control.armed = true;
  let stopped = false;
  try {
    await act(run, acknowledged);
  } catch (error) {
    // A stop inside a save surfaces as the writer's own error; a stop in the queue as the interruption.
    if (!control.dead) throw error;
    stopped = true;
  }
  control.armed = false;
  control.dead = false;
  const writes = control.count;
  if (failAt > 0) expect(stopped, `no stop before write ${failAt}`).toBe(true);

  // The process is gone: whatever it left is consistent at this very instant.
  await expectPipelineInvariants(run.project, run.model, 'stopped');

  // Its client repeats what it never saw acknowledged, then the queue recovers and drains.
  await finish(run, acknowledged);
  await recoverQueue(run.project);

  await expectPipelineInvariants(run.project, run.model, 'drained');
  expect(engineCommits(run.project)).toHaveLength(1);
  for (const [n] of SAVES.entries()) {
    expect(run.model.acknowledged.has(run.ids[n]!), `save ${n} was never acknowledged`).toBe(true);
  }
  await removeTrackedRoots();
  return writes;
}

describe('a stop before every durable step of save, queue and settle', () => {
  const act = async (run: Run, acknowledged: Set<number>) => {
    await saveAll(run, acknowledged);
    await runQueueOnce(run.project.engine, isolatedQueue(), undefined, FLUSH);
  };
  const finish = (run: Run, acknowledged: Set<number>) => saveAll(run, acknowledged);

  for (const [mode, label, least] of [
    ['record', 'record write (journal, batch, lease)', 10],
    ['rename', 'rename (record, payload, path list, document file)', 30],
  ] as const) {
    it(`leaves the invariants true at a stop before every ${label} and the same end state after recovery`, async () => {
      const total = await runPipeline(mode, 0, act, finish);
      expect(total).toBeGreaterThan(least);
      for (let failAt = 1; failAt <= total; failAt += 1) {
        try {
          await runPipeline(mode, failAt, act, finish);
        } catch (error) {
          throw new Error(`${mode}: stopped before step ${failAt} of ${total}`, { cause: error });
        }
      }
    }, 900_000);
  }
});

/** A project whose Close can be admitted: the integration target is pinned to the branch it is on. */
async function closeProject(): Promise<QueueProject> {
  const project = await queueProject();
  const branch = git(project.root, 'symbolic-ref', '--short', 'HEAD');
  await writeFile(
    join(project.root, '.nevo/config.yaml'),
    GIT_ON + '  integrationTargetBranch: ' + branch + '\n',
  );
  git(project.root, 'add', '.nevo/config.yaml');
  commitStaged(project.root, 'pin the integration target');
  return project;
}

describe('a stop before every record write of the Close hook', () => {
  it('flushes the queue first; a repeated Close with its id is admitted once nothing is pending', async () => {
    const closeId = randomUUID();
    const request = () => ({
      kind: 'specification-close' as const,
      operationId: closeId,
      specId: '',
    });
    const act = async (run: Run, acknowledged: Set<number>) => {
      await saveAll(run, acknowledged);
      await reserveCloseOperation(
        run.project.engine,
        { ...request(), specId: run.project.specId },
        { flush: { queue: isolatedQueue() } },
      );
    };
    const finish = async (run: Run, acknowledged: Set<number>) => {
      await saveAll(run, acknowledged);
      // The Close the client repeats: the flush drains whatever the stop left, then it is admitted.
      const again = await reserveCloseOperation(
        run.project.engine,
        { ...request(), specId: run.project.specId },
        { flush: { queue: isolatedQueue({ clock: clockAfterBackoff() }) } },
      ).catch((error: unknown) => error);
      // Either admitted, or refused only because a commit is still being recovered: never half-done.
      if (again instanceof CloseOperationError) {
        expect(['CLOSE_CONFLICT', 'CLOSE_PREFLIGHT']).toContain(again.code);
      } else {
        expect(again).toMatchObject({ journal: { stage: 'reserved' } });
      }
    };
    const closing = (failAt: number) => runClose(failAt, act, finish, closeProject);

    const total = await closing(0);
    expect(total).toBeGreaterThan(10);
    for (let failAt = 1; failAt <= total; failAt += 1) {
      try {
        await closing(failAt);
      } catch (error) {
        throw new Error(`Close: stopped before write ${failAt} of ${total}`, { cause: error });
      }
    }
  }, 900_000);
});

/**
 * Like `runPipeline`, but the Close reservation holds the claims of the checkout when it is admitted,
 * so the "drained" end state is judged on the commits and the document records alone.
 */
async function runClose(
  failAt: number,
  act: (run: Run, acknowledged: Set<number>) => Promise<unknown>,
  finish: (run: Run, acknowledged: Set<number>) => Promise<void>,
  project: () => Promise<QueueProject>,
): Promise<number> {
  const run: Run = {
    project: await project(),
    model: new SaveModel(),
    ids: SAVES.map(() => randomUUID()),
  };
  const acknowledged = new Set<number>();
  const before = commitCount(run.project);
  control.mode = 'record';
  control.count = 0;
  control.failAt = failAt;
  control.dead = false;
  control.armed = true;
  let stopped = false;
  try {
    await act(run, acknowledged);
  } catch (error) {
    if (!control.dead) throw error;
    stopped = true;
  }
  control.armed = false;
  control.dead = false;
  const writes = control.count;
  if (failAt > 0) expect(stopped).toBe(true);
  await expectPipelineInvariants(run.project, run.model, 'stopped', { claimHeldByClose: true });

  await finish(run, acknowledged);
  await recoverQueue(run.project);

  // Everything acknowledged is committed exactly once; the Close left no document change pending.
  expect(engineCommits(run.project)).toHaveLength(1);
  expect(commitCount(run.project)).toBe(before + 1);
  expect(git(run.project.root, 'status', '--porcelain', '--', 'specs')).toBe('');
  await removeTrackedRoots();
  return writes;
}

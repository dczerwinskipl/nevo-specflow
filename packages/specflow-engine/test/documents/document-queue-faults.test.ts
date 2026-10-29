// Integration (real project, real Git): fault injection at EVERY journal write of the queue's
// transitions. Each scenario runs once to count the atomic record writes of its action, then once
// more for every write, stopped (as a killed process is) just before that write; whatever is left on
// disk is then recovered by the ordinary calls, and the end state must be the same as without the
// stop: every operation in its final state, exactly the expected commits, no record of the queue
// left, nothing committed that is not recorded.
import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { GitCapabilityError } from '../../src/git/errors';
import { sha256Hex } from '../../src/hash';
import { applyDocumentChange } from '../../src/specs/documents/api';
import {
  abandonDocumentCommit,
  recoverDocumentOperation,
  retryDocumentCommit,
} from '../../src/specs/documents/queue/actions';
import { listDocumentBatches } from '../../src/specs/documents/queue/batch-store';
import { QueueInterrupted } from '../../src/specs/documents/queue/types';
import { drainQueue, runQueueOnce } from '../../src/specs/documents/queue/worker';
import { findDocumentChangeJournal } from '../../src/specs/documents/write/journal-store';
import { openVersionControl } from '../../src/version-control';
import { removeTrackedRoots } from '../support/documents-fixture';
import { expectPipelineInvariants } from '../support/document-invariants';
import {
  clockAfterBackoff,
  editNotesByHand,
  engineCommits,
  isolatedQueue,
  queueProject,
  queueRecords,
  queueSave,
  workingTreeClean,
  type QueueProject,
} from '../support/document-queue';
import {
  checkoutClaimFree,
  ledgerOf,
  ledgerPaths,
  notesRevision,
  setLocalAutoCommit,
} from '../support/document-writes';
import { git } from '../support/git-project';

const control = vi.hoisted(() => ({ armed: false, count: 0, failAt: 0 }));

vi.mock('../../src/project/fs/atomic-json', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../src/project/fs/atomic-json')>();

  return {
    ...original,
    writeJsonAtomically: async (...args: Parameters<typeof original.writeJsonAtomically>) => {
      if (control.armed) {
        control.count += 1;
        if (control.count === control.failAt) {
          throw new QueueInterrupted('a journal write');
        }
      }

      return original.writeJsonAtomically(...args);
    },
  };
});

afterEach(async () => {
  control.armed = false;
  await removeTrackedRoots();
});

const FLUSH = { flush: true } as const;
const HUMAN = ['-c', 'user.name=Human', '-c', 'user.email=human@example.invalid'] as const;

/** Quiet the queue after a stop: the same calls a scheduler makes, on a clock past every backoff. */
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

interface Scenario<T> {
  readonly name: string;
  /** Builds the state the action starts from. Unarmed: nothing here is counted or stopped. */
  setup(project: QueueProject): Promise<T>;
  /** The transition under test. Armed. */
  act(project: QueueProject, state: T): Promise<unknown>;
  /** Runs after the action, stopped or not, before the queue is recovered (the blocker goes away). */
  afterAct?(project: QueueProject, state: T): Promise<void>;
  /** Anything beyond the plain queue passes that finishes an interrupted action (an idempotent call). */
  finish?(project: QueueProject, state: T): Promise<void>;
  /** The end state, the same with or without a stop. */
  expectFinal(project: QueueProject, state: T): Promise<void>;
}

async function runScenario<T>(scenario: Scenario<T>, failAt: number): Promise<number> {
  const project = await queueProject();
  const state = await scenario.setup(project);
  control.count = 0;
  control.failAt = failAt;
  control.armed = true;
  let stopped = false;
  try {
    await scenario.act(project, state);
  } catch (error) {
    if (!(error instanceof QueueInterrupted)) {
      throw error;
    }

    stopped = true;
  }

  control.armed = false;
  // Whatever the stop left, the invariants of any instant hold before anything recovers it.
  await expectPipelineInvariants(project, undefined, 'stopped');
  await scenario.afterAct?.(project, state);
  const writes = control.count;
  if (failAt > 0) {
    expect(stopped).toBe(true);
  }

  await recoverQueue(project);
  await scenario.finish?.(project, state);
  await recoverQueue(project);
  await scenario.expectFinal(project, state);
  await removeTrackedRoots();

  return writes;
}

/** Runs the scenario to count the writes, then stopped before each of them. */
async function everyWrite<T>(scenario: Scenario<T>): Promise<void> {
  const total = await runScenario(scenario, 0);
  expect(total).toBeGreaterThan(0);
  for (let failAt = 1; failAt <= total; failAt += 1) {
    try {
      await runScenario(scenario, failAt);
    } catch (error) {
      throw new Error(`${scenario.name}: stopped before write ${failAt} of ${total}`, {
        cause: error,
      });
    }
  }
}

const stageOf = async (project: QueueProject, id: string) =>
  (await findDocumentChangeJournal(project.engine.context, id))?.stage;

async function expectNoQueueRecords(project: QueueProject): Promise<void> {
  expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
}

/** The save of `notes-1` that the manual-mode scenario repeats under one operation id. */
const manualSave = () => ({
  action: 'save' as const,
  documentId: 'notes-1',
  content: 'manual save',
  expectedRevision: notesRevision(1),
});

/** A failed operation: its path was edited by someone else before the commit. */
async function failedOperation(project: QueueProject): Promise<string> {
  const id = await queueSave(project, 1, 'mine\n');
  await editNotesByHand(project, 1, 'a human typed this\n');
  await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
  expect(await stageOf(project, id)).toBe('commit-failed');

  return id;
}

const uncertain = (): GitCapabilityError =>
  new GitCapabilityError('GIT_OPERATION_UNCERTAIN', 'uncertain', 'mutation-timeout');

/** An operation whose commit needs recovery: uncertain, and a human commit moved HEAD meanwhile. */
async function recoveryOperation(project: QueueProject): Promise<string> {
  const id = await queueSave(project, 1, 'one\n');
  const real = openVersionControl(project.engine).commits;
  await runQueueOnce(
    project.engine,
    isolatedQueue({
      commits: {
        ...real,
        commit: () => {
          git(project.root, ...HUMAN, 'commit', '--allow-empty', '-qm', 'human');

          return Promise.reject(uncertain());
        },
      },
    }),
    undefined,
    FLUSH,
  );
  expect(await stageOf(project, id)).toBe('recovery-required');

  return id;
}

describe('stopped before every write of a transition', () => {
  it('a new save dissolves a failed batch and the pair is committed', async () => {
    await everyWrite<{ first: string; later: string }>({
      name: 'dissolve',
      setup: async (project) => {
        const first = await failedOperation(project);
        const later = randomUUID();
        await applyDocumentChange(project.engine, project.specId, later, {
          action: 'save',
          documentId: 'notes-1',
          content: 'a newer save\n',
          expectedRevision: sha256Hex('a human typed this\n'),
        });

        return { first, later };
      },
      act: (project) => runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH),
      expectFinal: async (project, { first, later }) => {
        expect(engineCommits(project)).toHaveLength(1);
        for (const id of [first, later]) {
          expect((await findDocumentChangeJournal(project.engine.context, id))?.outcome).toBe(
            'committed',
          );
        }

        expect(workingTreeClean(project)).toBe(true);
        await expectNoQueueRecords(project);
      },
    });
  }, 900_000);

  it('a batch with one foreign path is split and the rest is committed', async () => {
    await everyWrite<{ a: string; b: string; c: string }>({
      name: 'split',
      setup: async (project) => {
        const a = await queueSave(project, 1, 'one\n');
        const b = await queueSave(project, 2, 'two\n');
        const c = await queueSave(project, 3, 'three\n');
        await editNotesByHand(project, 2, 'a human typed this\n');

        return { a, b, c };
      },
      act: (project) =>
        drainQueue(project.engine, isolatedQueue({ clock: clockAfterBackoff() }), undefined, FLUSH),
      expectFinal: async (project, { a, b, c }) => {
        expect(engineCommits(project)).toHaveLength(1);
        for (const id of [a, c]) {
          expect(await stageOf(project, id)).toBe('completed');
        }

        expect(await stageOf(project, b)).toBe('commit-failed');
        const batches = await listDocumentBatches(project.engine.context);
        expect(batches.map((batch) => [batch.operationId, batch.state])).toEqual([[b, 'failed']]);
        expect((await queueRecords(project)).lease).toBe(false);
      },
    });
  }, 900_000);

  it('a split whose failed part holds the first member keeps the ids apart', async () => {
    await everyWrite<{ a: string; b: string; c: string }>({
      name: 'split-first',
      setup: async (project) => {
        const a = await queueSave(project, 1, 'one\n');
        const b = await queueSave(project, 2, 'two\n');
        const c = await queueSave(project, 3, 'three\n');
        await editNotesByHand(project, 1, 'a human typed this\n');

        return { a, b, c };
      },
      act: (project) =>
        drainQueue(project.engine, isolatedQueue({ clock: clockAfterBackoff() }), undefined, FLUSH),
      expectFinal: async (project, { a, b, c }) => {
        expect(engineCommits(project)).toHaveLength(1);
        for (const id of [b, c]) {
          expect(await stageOf(project, id)).toBe('completed');
        }

        expect(await stageOf(project, a)).toBe('commit-failed');
        const batches = await listDocumentBatches(project.engine.context);
        expect(batches.map((batch) => [batch.operationId, batch.state])).toEqual([[a, 'failed']]);
      },
    });
  }, 900_000);

  it('abandon records the paths in the ledger, completes uncommitted and keeps the files', async () => {
    await everyWrite<{ id: string }>({
      name: 'abandon',
      setup: async (project) => ({ id: await failedOperation(project) }),
      act: (project, { id }) => abandonDocumentCommit(project.engine, id),
      finish: async (project, { id }) => {
        if ((await stageOf(project, id)) === 'commit-failed') {
          await abandonDocumentCommit(project.engine, id);
        }
      },
      expectFinal: async (project, { id }) => {
        expect(await stageOf(project, id)).toBe('completed');
        expect(await ledgerPaths(project)).toEqual(['specs/active/hand/notes-1.md']);
        expect(git(project.root, 'status', '--porcelain')).toContain('notes-1.md');
        await expectNoQueueRecords(project);
      },
    });
  }, 900_000);

  it('a save with auto-commit off keeps the ledger ahead of its journal, whichever write stops it', async () => {
    await everyWrite<{ id: string }>({
      name: 'manual save',
      setup: async (project) => {
        await setLocalAutoCommit(project, false);

        return { id: randomUUID() };
      },
      act: async (project, { id }) => {
        try {
          await applyDocumentChange(project.engine, project.specId, id, manualSave());
        } catch (error) {
          // The writer reports a stopped record write as a failed write; the process is "dead" here.
          if (control.failAt > 0 && control.count >= control.failAt) {
            throw new QueueInterrupted('a journal write');
          }

          throw error;
        }
      },
      finish: async (project, { id }) => {
        // What the stop left is finished by the same operation id, exactly as a retrying client does.
        await applyDocumentChange(project.engine, project.specId, id, manualSave());
      },
      expectFinal: async (project, { id }) => {
        expect(await findDocumentChangeJournal(project.engine.context, id)).toMatchObject({
          stage: 'completed',
          outcome: 'uncommitted',
          reason: 'auto-commit-off',
        });
        const entries = (await ledgerOf(project))?.entries ?? [];
        expect(entries).toHaveLength(1);
        expect(entries[0]).toMatchObject({
          path: 'specs/active/hand/notes-1.md',
          operationIds: [id],
          operationCount: 1,
        });
        expect(engineCommits(project)).toEqual([]);
        expect(await checkoutClaimFree(project)).toBe(true);
        await expectNoQueueRecords(project);
      },
    });
  }, 900_000);

  it('retry queues the batch again and it is committed', async () => {
    await everyWrite<{ id: string }>({
      name: 'retry',
      setup: async (project) => {
        const id = await failedOperation(project);
        await editNotesByHand(project, 1, 'mine\n');

        return { id };
      },
      act: (project, { id }) => retryDocumentCommit(project.engine, id),
      finish: async (project, { id }) => {
        if ((await stageOf(project, id)) === 'commit-failed') {
          await retryDocumentCommit(project.engine, id);
        }
      },
      expectFinal: async (project, { id }) => {
        expect(await stageOf(project, id)).toBe('completed');
        expect(engineCommits(project)).toHaveLength(1);
        await expectNoQueueRecords(project);
      },
    });
  }, 900_000);

  it('a transient failure is recorded and the commit is made once the blocker is gone', async () => {
    await everyWrite<{ id: string; lock: string }>({
      name: 'transient',
      setup: async (project) => {
        const id = await queueSave(project, 1, 'later\n');
        const lock = join(project.root, '.git', 'index.lock');
        await writeFile(lock, '');

        return { id, lock };
      },
      act: (project) => runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH),
      afterAct: async (_project, { lock }) => {
        await rm(lock, { force: true });
      },
      expectFinal: async (project, { id }) => {
        expect(await stageOf(project, id)).toBe('completed');
        expect(engineCommits(project)).toHaveLength(1);
        await expectNoQueueRecords(project);
      },
    });
  }, 900_000);

  it('a permanent failure is recorded as a failed batch', async () => {
    await everyWrite<{ id: string }>({
      name: 'permanent',
      setup: async (project) => {
        const id = await queueSave(project, 1, 'mine\n');
        await editNotesByHand(project, 1, 'a human typed this\n');

        return { id };
      },
      act: (project) => runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH),
      expectFinal: async (project, { id }) => {
        expect(await stageOf(project, id)).toBe('commit-failed');
        const batches = await listDocumentBatches(project.engine.context);
        expect(batches.map((batch) => batch.state)).toEqual(['failed']);
        expect(engineCommits(project)).toEqual([]);
      },
    });
  }, 900_000);

  it('recover --resume queues the batch again and it is committed', async () => {
    await everyWrite<{ id: string }>({
      name: 'recover-resume',
      setup: async (project) => ({ id: await recoveryOperation(project) }),
      act: (project, { id }) => recoverDocumentOperation(project.engine, id, 'resume'),
      finish: async (project, { id }) => {
        if ((await stageOf(project, id)) === 'recovery-required') {
          await recoverDocumentOperation(project.engine, id, 'resume');
        }
      },
      expectFinal: async (project, { id }) => {
        expect(await stageOf(project, id)).toBe('completed');
        expect(engineCommits(project)).toHaveLength(1);
        await expectNoQueueRecords(project);
      },
    });
  }, 900_000);

  it('recover --adopt completes the batch with the hand commit', async () => {
    await everyWrite<{ id: string; hand: string }>({
      name: 'recover-adopt',
      setup: async (project) => {
        const id = await recoveryOperation(project);
        git(project.root, 'add', 'specs/active/hand/notes-1.md');
        git(project.root, ...HUMAN, 'commit', '-qm', 'by hand');

        return { id, hand: git(project.root, 'rev-parse', 'HEAD') };
      },
      act: (project, { id }) => recoverDocumentOperation(project.engine, id, 'adopt'),
      finish: async (project, { id }) => {
        if ((await stageOf(project, id)) === 'recovery-required') {
          await recoverDocumentOperation(project.engine, id, 'adopt');
        }
      },
      expectFinal: async (project, { id, hand }) => {
        expect(await findDocumentChangeJournal(project.engine.context, id)).toMatchObject({
          stage: 'completed',
          sha: hand,
        });
        expect(engineCommits(project)).toEqual([]);
        await expectNoQueueRecords(project);
      },
    });
  }, 900_000);
});

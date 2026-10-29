// Integration (real project, real Git): a manual commit that is stopped at every point of its life
// converges when the same operation id comes back, makes exactly one commit, and one whose outcome
// Git cannot prove waits for the operator, who resumes, adopts or abandons it (ADR 0018 decision 8).
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SLOW_GIT_TEST_TIMEOUT_MS } from '../support/platform';

import { GitCapabilityError } from '../../src/git/errors';
import { DocumentError } from '../../src/specs/document-rules/errors';
import {
  listDocumentOperationRows,
  readDocumentOperationStatus,
} from '../../src/specs/documents/reading';
import {
  abandonDocumentCommit,
  retryDocumentCommit,
} from '../../src/specs/documents/queue/actions';
import { reserveCloseOperation } from '../../src/testing';
import { takeOverDocumentQueue } from '../../src/specs/documents/scheduler';
import { recoverOperation, resolveLedgerOperation } from '../../src/specs/documents/manual-commit';
import {
  ManualCommitInterrupted,
  MANUAL_COMMIT_STUCK_MS,
  listManualCommitRows,
  listManualCommitJournals,
  type ManualCommitHooks,
} from '../../src/specs/manual-commit';
import { createGitCommitPort } from '../../src/version-control/commits/git-adapter';
import type { CommitPort, EngineCommitRequest } from '../../src/version-control/commits/port';
import { failure, removeTrackedRoots } from '../support/documents-fixture';
import {
  GIT_ON,
  checkoutClaimFree,
  ledgerOf,
  ledgerPaths,
  notesPath,
} from '../support/document-writes';
import {
  editNotesByHand,
  isolatedQueue,
  queueRecords,
  workingTreeClean,
  type QueueProject,
} from '../support/document-queue';
import { commitStaged, git } from '../support/git-project';
import {
  commitUncommitted,
  headCount,
  journalOf,
  manualCommits,
  manualModeProject,
  recover,
  saveUncommitted,
  specPath,
} from '../support/manual-commit';

vi.setConfig({ testTimeout: SLOW_GIT_TEST_TIMEOUT_MS });

afterEach(removeTrackedRoots);

const HUMAN = ['-c', 'user.name=Human', '-c', 'user.email=human@example.invalid'] as const;

async function refusal(promise: Promise<unknown>) {
  const error = await failure(promise);
  expect(error).toBeInstanceOf(DocumentError);
  const { code, details } = error as DocumentError;

  return { code, details };
}

const stop = (point: string): (() => Promise<never>) => {
  return () => Promise.reject(new ManualCommitInterrupted(point));
};

/** The commit port of the project with `commit` replaced; everything else is the real thing. */
function portWith(
  project: QueueProject,
  commit: (
    real: CommitPort,
    request: EngineCommitRequest,
  ) => Promise<{ sha: string; parentHead: string }>,
): CommitPort {
  const real = createGitCommitPort(project.engine);

  return { ...real, commit: (request) => commit(real, request) };
}

const uncertain = (reason = 'not-terminated'): GitCapabilityError =>
  new GitCapabilityError('GIT_OPERATION_UNCERTAIN', 'The outcome is not known.', reason);

describe('a manual commit stopped at every point', () => {
  interface Cut {
    readonly hook: keyof ManualCommitHooks;
    /** What the checkout looks like at the stop. */
    readonly atStop: (project: QueueProject, operationId: string, before: number) => Promise<void>;
  }

  const cuts: Cut[] = [
    {
      // reserved, the lease is not taken
      hook: 'afterReserved',
      atStop: async (project, id, before) => {
        expect((await journalOf(project, id))?.stage).toBe('reserved');
        expect((await queueRecords(project)).lease).toBe(false);
        expect(headCount(project)).toBe(before);
      },
    },
    {
      // the lease is taken, the journal still says reserved
      hook: 'inClaimAfterLease',
      atStop: async (project, id, before) => {
        expect((await journalOf(project, id))?.stage).toBe('reserved');
        expect((await queueRecords(project)).lease).toBe(true);
        expect(headCount(project)).toBe(before);
      },
    },
    {
      hook: 'afterClaim',
      atStop: async (project, id, before) => {
        expect(await journalOf(project, id)).toMatchObject({ stage: 'committing' });
        expect((await journalOf(project, id))?.commitStartedAt).toBeUndefined();
        expect(headCount(project)).toBe(before);
      },
    },
    {
      hook: 'beforeCommit',
      atStop: async (project, id, before) => {
        expect((await journalOf(project, id))?.stage).toBe('committing');
        expect(headCount(project)).toBe(before);
      },
    },
    {
      // the commit exists, nothing is recorded or pruned
      hook: 'afterCommit',
      atStop: async (project, id, before) => {
        expect(await journalOf(project, id)).toMatchObject({ stage: 'committing' });
        expect((await journalOf(project, id))?.commitStartedAt).toBeDefined();
        expect(headCount(project)).toBe(before + 1);
        expect(await ledgerPaths(project)).toEqual([specPath(1), specPath(2)]);
      },
    },
    {
      hook: 'afterVerify',
      atStop: async (project, _id, before) => {
        expect(headCount(project)).toBe(before + 1);
        expect(await ledgerPaths(project)).toEqual([specPath(1), specPath(2)]);
      },
    },
    {
      // the ledger is pruned, the journal is not completed
      hook: 'afterLedgerPruned',
      atStop: async (project, id, before) => {
        expect(headCount(project)).toBe(before + 1);
        expect(await ledgerPaths(project)).toEqual([]);
        expect((await journalOf(project, id))?.stage).toBe('committing');
      },
    },
    {
      // completed, still in the active directory, the lease not released
      hook: 'afterCompleted',
      atStop: async (project, id, before) => {
        expect(await journalOf(project, id)).toMatchObject({ stage: 'completed' });
        expect(headCount(project)).toBe(before + 1);
        expect((await queueRecords(project)).lease).toBe(true);
      },
    },
  ];

  it.each(cuts.map((cut) => [cut.hook, cut] as const))(
    'after %s the same operation id finishes it once',
    async (_name, cut) => {
      const project = await manualModeProject();
      await saveUncommitted(project, 1, 'one\n');
      await saveUncommitted(project, 2, 'two\n');
      const before = headCount(project);
      const operationId = randomUUID();

      const error = await failure(
        commitUncommitted(
          project,
          { operationId, message: 'Stopped on purpose' },
          { deps: { hooks: { [cut.hook]: stop(cut.hook) } } },
        ),
      );
      expect(error).toBeInstanceOf(ManualCommitInterrupted);
      await cut.atStop(project, operationId, before);

      const result = await commitUncommitted(project, {
        operationId,
        message: 'Stopped on purpose',
      });

      expect(result.commit.state).toBe('committed');
      expect(result.paths).toEqual([specPath(1), specPath(2)]);
      // Exactly one commit, whatever the cut was; nothing doubled, nothing left over.
      expect(headCount(project)).toBe(before + 1);
      expect(manualCommits(project)).toHaveLength(1);
      expect(git(project.root, 'log', '-1', '--format=%H')).toBe(result.commit.sha);
      expect(await ledgerPaths(project)).toEqual([]);
      expect(workingTreeClean(project)).toBe(true);
      expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
      expect(await checkoutClaimFree(project)).toBe(true);
      expect(await listManualCommitJournals(project.engine.context)).toEqual([]);
      expect(await journalOf(project, operationId)).toMatchObject({
        stage: 'completed',
        outcome: 'committed',
        sha: result.commit.sha,
      });
    },
  );

  it('holds its paths until it ended: a save of one of them is refused, and the replay still commits once', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'one\n');
    const operationId = randomUUID();
    await failure(
      commitUncommitted(
        project,
        { operationId },
        { deps: { hooks: { afterCommit: stop('afterCommit') } } },
      ),
    );
    const before = headCount(project);

    expect(await refusal(saveUncommitted(project, 1, 'one, edited later\n'))).toMatchObject({
      code: 'SPEC_BUSY',
      details: { cause: 'commit-in-progress' },
    });
    const result = await commitUncommitted(project, { operationId });

    expect(headCount(project)).toBe(before);
    expect(result.commit.state).toBe('committed');
    expect(manualCommits(project)).toHaveLength(1);
    // The path is free again.
    await saveUncommitted(project, 1, 'one, edited later\n');
    expect(await ledgerPaths(project)).toEqual([specPath(1)]);
  });
});

describe('a manual commit whose outcome Git cannot prove', () => {
  /** A project and a manual commit that ends in `recovery-required` because Git answered "uncertain". */
  async function stuck() {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'one\n');
    await saveUncommitted(project, 2, 'two\n');
    const operationId = randomUUID();
    const before = headCount(project);
    const refused = await refusal(
      commitUncommitted(
        project,
        { operationId, message: 'Unprovable' },
        {
          deps: {
            commits: portWith(project, () => Promise.reject(uncertain())),
          },
        },
      ),
    );
    expect(refused.code).toBe('MANUAL_COMMIT_RECOVERY_REQUIRED');

    return { project, operationId, before };
  }

  it('waits for the operator with its claim, its ledger entries and its paths held', async () => {
    const { project, operationId, before } = await stuck();

    expect(await journalOf(project, operationId)).toMatchObject({
      stage: 'recovery-required',
      reason: 'uncertain',
      blockedBy: 'not-terminated',
    });
    expect(headCount(project)).toBe(before);
    expect(await ledgerPaths(project)).toEqual([specPath(1), specPath(2)]);
    expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
    // The checkout is held: Close cannot run, a write of the paths and a second commit are refused.
    expect(await checkoutClaimFree(project)).toBe(false);
    expect(await refusal(saveUncommitted(project, 1, 'racing\n'))).toMatchObject({
      code: 'SPEC_BUSY',
      details: { cause: 'recovery-required' },
    });
    expect(await refusal(commitUncommitted(project))).toMatchObject({
      code: 'SPEC_BUSY',
      details: { cause: 'recovery-required' },
    });
    // The same operation id says why.
    expect(
      await refusal(commitUncommitted(project, { operationId, message: 'Unprovable' })),
    ).toMatchObject({
      code: 'MANUAL_COMMIT_RECOVERY_REQUIRED',
    });
  });

  it('is read as a document operation and listed, with the action only the operator has', async () => {
    const { project, operationId } = await stuck();

    expect(
      await readDocumentOperationStatus(project.engine, operationId, { specId: project.specId }),
    ).toMatchObject({
      action: 'manual-commit',
      stage: 'recovery-required',
      commit: { state: 'failed', reason: 'uncertain', recoveryRequired: true },
      actions: {
        retry: { available: false },
        abandon: { available: false },
        recover: { available: true },
      },
    });
    expect(await listManualCommitRows(project.engine.context)).toEqual([
      expect.objectContaining({
        operationId,
        kind: 'manual-commit',
        state: 'recovery-required',
        code: 'MANUAL_COMMIT_RECOVERY_REQUIRED',
        documentCount: 2,
        subject: { specId: project.specId },
      }),
    ]);
    // The document-change list is the document queue's alone.
    expect(await listDocumentOperationRows(project.engine)).toEqual([]);
    // A manual commit is not a document commit: retry and abandon of the queue do not apply.
    for (const action of [retryDocumentCommit, abandonDocumentCommit]) {
      expect(await refusal(action(project.engine, operationId))).toMatchObject({
        code: 'DOCUMENT_OPERATION_STATE_INVALID',
      });
    }
  });

  it('keeps Close out of a checkout it holds', async () => {
    const { project } = await stuck();
    const branch = git(project.root, 'symbolic-ref', '--short', 'HEAD');
    await writeFile(
      join(project.root, '.nevo/config.yaml'),
      GIT_ON + '  integrationTargetBranch: ' + branch + '\n',
    );
    git(project.root, 'add', '.nevo/config.yaml');
    commitStaged(project.root, 'pin the integration target');

    expect(
      await refusal(
        reserveCloseOperation(
          project.engine,
          { kind: 'specification-close', operationId: randomUUID(), specId: project.specId },
          { flush: { queue: isolatedQueue() } },
        ),
      ),
    ).toMatchObject({ code: 'DOCUMENT_COMMITS_PENDING', details: { cause: 'commit-failed' } });
  });

  it('--resume looks the commit up and, finding none, makes it once', async () => {
    const { project, operationId, before } = await stuck();

    const result = await recover(project, operationId, 'resume');

    expect(result.commit.state).toBe('committed');
    expect(headCount(project)).toBe(before + 1);
    expect(manualCommits(project)).toEqual([result.commit.sha]);
    expect(await ledgerPaths(project)).toEqual([]);
    expect(await checkoutClaimFree(project)).toBe(true);
    // A repeat finds it where it ended up.
    expect(await recover(project, operationId, 'resume')).toMatchObject({
      replayed: true,
      commit: result.commit,
    });
  });

  it('--resume finds the commit that was made when only the answer was lost', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'one\n');
    const operationId = randomUUID();
    const before = headCount(project);

    // The commit is made, then the port reports an unknown outcome: the evidence settles it.
    const result = await commitUncommitted(
      project,
      { operationId },
      {
        deps: {
          commits: portWith(project, async (real, request) => {
            await real.commit(request);

            throw uncertain('commit-interrupted');
          }),
        },
      },
    );

    expect(result.commit.state).toBe('committed');
    expect(headCount(project)).toBe(before + 1);
    expect(await ledgerPaths(project)).toEqual([]);
    expect((await journalOf(project, operationId))?.stage).toBe('completed');
  });

  it('--adopt completes with the commit a person made of the same content', async () => {
    const { project, operationId, before } = await stuck();
    git(project.root, 'add', specPath(1), specPath(2));
    git(project.root, ...HUMAN, 'commit', '-qm', 'I committed it myself');
    const mine = git(project.root, 'rev-parse', 'HEAD');

    const result = await recover(project, operationId, 'adopt');

    expect(result.commit).toMatchObject({ state: 'committed', sha: mine });
    expect(headCount(project)).toBe(before + 1);
    expect(manualCommits(project)).toEqual([]);
    expect(await ledgerPaths(project)).toEqual([]);
    expect(await checkoutClaimFree(project)).toBe(true);
  });

  it('--adopt refuses while the content is not in HEAD, and stays recoverable', async () => {
    const { project, operationId } = await stuck();

    expect(await refusal(recover(project, operationId, 'adopt'))).toMatchObject({
      code: 'MANUAL_COMMIT_RECOVERY_REQUIRED',
      details: { cause: 'recovery-unresolved' },
    });
    expect((await journalOf(project, operationId))?.stage).toBe('recovery-required');
    expect(await ledgerPaths(project)).toEqual([specPath(1), specPath(2)]);
  });

  it('--abandon ends it without a commit and leaves the ledger exactly as it was', async () => {
    const { project, operationId, before } = await stuck();

    const result = await recover(project, operationId, 'abandon');

    expect(result.commit).toMatchObject({ state: 'failed', reason: 'abandoned' });
    expect(headCount(project)).toBe(before);
    expect(await ledgerPaths(project)).toEqual([specPath(1), specPath(2)]);
    expect(await checkoutClaimFree(project)).toBe(true);
    expect(await journalOf(project, operationId)).toMatchObject({
      stage: 'failed',
      reason: 'abandoned',
    });
    // The paths are free again: a new manual commit takes them.
    const next = await commitUncommitted(project, { message: 'Take them again' });
    expect(next.paths).toEqual([specPath(1), specPath(2)]);
    // A repeat of the abandon finds it where it ended up; adopt of an ended one is not possible.
    expect(await recover(project, operationId, 'abandon')).toMatchObject({ replayed: true });
    expect(await refusal(recover(project, operationId, 'adopt'))).toMatchObject({
      code: 'DOCUMENT_OPERATION_STATE_INVALID',
    });
  });

  it('stays unresolved when a commit that carries its trailer holds something else', async () => {
    const { project, operationId } = await stuck();
    // A commit by the Engine identity names this operation but changes a file that is not in it.
    await writeFile(join(project.dir, 'unrelated.md'), 'not a ledger path\n');
    git(project.root, 'add', join(project.dir, 'unrelated.md'));
    git(
      project.root,
      '-c',
      'user.name=Nevo SpecFlow Engine',
      '-c',
      'user.email=engine@nevo.invalid',
      'commit',
      '-qm',
      'lookalike\n\nNevo-Operation: ' + operationId,
    );
    const before = headCount(project);

    expect(await refusal(recover(project, operationId, 'resume'))).toMatchObject({
      code: 'MANUAL_COMMIT_RECOVERY_REQUIRED',
    });

    expect(headCount(project)).toBe(before);
    expect(await journalOf(project, operationId)).toMatchObject({
      stage: 'recovery-required',
      blockedBy: 'foreign-commit',
    });
    expect(await ledgerPaths(project)).toEqual([specPath(1), specPath(2)]);
  });

  it('stays unresolved when history was rewritten after the commit was started', async () => {
    const { project, operationId } = await stuck();
    git(project.root, ...HUMAN, 'commit', '--amend', '-qm', 'rewritten', '--allow-empty');

    expect(await refusal(recover(project, operationId, 'resume'))).toMatchObject({
      code: 'MANUAL_COMMIT_RECOVERY_REQUIRED',
    });
    expect(await journalOf(project, operationId)).toMatchObject({
      stage: 'recovery-required',
      reason: 'history-changed',
    });
  });
});

describe('a refusal at execution', () => {
  it('ends the journal failed, releases everything and replays the same refusal', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'one\n');
    const operationId = randomUUID();
    const before = headCount(project);

    // The branch is protected between the admission and the execution.
    const refused = await refusal(
      commitUncommitted(
        project,
        { operationId },
        {
          deps: {
            hooks: {
              afterClaim: async () => {
                await writeFile(
                  join(project.root, '.nevo/config.yaml'),
                  GIT_ON + '  commits:\n    protectedBranches:\n      - feature/work\n',
                );
              },
            },
          },
        },
      ),
    );

    expect(refused).toMatchObject({ code: 'BRANCH_PROTECTED' });
    expect(headCount(project)).toBe(before);
    expect(await journalOf(project, operationId)).toMatchObject({
      stage: 'failed',
      reason: 'branch-protected',
    });
    expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
    expect(await checkoutClaimFree(project)).toBe(true);
    expect(await ledgerPaths(project)).toEqual([specPath(1)]);
    // The refusal is stored: the same operation id answers it again, even after the config is fixed.
    await writeFile(join(project.root, '.nevo/config.yaml'), GIT_ON);
    expect(await refusal(commitUncommitted(project, { operationId }))).toMatchObject({
      code: 'BRANCH_PROTECTED',
    });
    // A new operation id is evaluated afresh.
    expect((await commitUncommitted(project)).paths).toEqual([specPath(1)]);
  });

  it('refuses a path edited between the admission and the execution', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'one\n');
    const before = headCount(project);

    const refused = await refusal(
      commitUncommitted(
        project,
        {},
        {
          deps: {
            hooks: {
              afterClaim: async () => {
                await writeFile(join(project.dir, notesPath(1)), 'edited meanwhile\n');
              },
            },
          },
        },
      ),
    );

    expect(refused.code).toBe('MANUAL_COMMIT_CONFLICT');
    expect(headCount(project)).toBe(before);
    expect(await ledgerPaths(project)).toEqual([specPath(1)]);
  });
});

describe('resolving the ledger entries of an operation', () => {
  it('drops an entry whose file a person has taken over, and keeps the Engine content that is uncommitted', async () => {
    const project = await manualModeProject();
    const taken = await saveUncommitted(project, 1, 'engine content\n');
    const kept = await saveUncommitted(project, 2, 'engine content two\n');
    await editNotesByHand(project, 1, 'a person typed this\n');

    expect(await resolveLedgerOperation(project.engine, taken)).toEqual({
      resolved: [specPath(1)],
      stillUncommitted: [],
    });
    expect(await ledgerPaths(project)).toEqual([specPath(2)]);

    expect(await resolveLedgerOperation(project.engine, kept)).toEqual({
      resolved: [],
      stillUncommitted: [specPath(2)],
    });
    expect(await ledgerPaths(project)).toEqual([specPath(2)]);
    // The conflict is gone with the entry: what is left commits.
    expect((await commitUncommitted(project)).paths).toEqual([specPath(2)]);
  });

  it('drops an entry that HEAD holds already and an operation that does not exist is refused', async () => {
    const project = await manualModeProject();
    const id = await saveUncommitted(project, 1, 'one\n');
    git(project.root, 'add', specPath(1));
    git(project.root, ...HUMAN, 'commit', '-qm', 'by hand');

    expect(await resolveLedgerOperation(project.engine, id)).toEqual({
      resolved: [specPath(1)],
      stillUncommitted: [],
    });
    expect(await ledgerOf(project)).toBeUndefined();
    expect(await refusal(resolveLedgerOperation(project.engine, randomUUID()))).toMatchObject({
      code: 'DOCUMENT_OPERATION_NOT_FOUND',
    });
  });
});

describe('recover of any operation', () => {
  it('recovers a manual commit through the one entry of the operator', async () => {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'one\n');
    const operationId = randomUUID();
    await failure(
      commitUncommitted(
        project,
        { operationId },
        { deps: { commits: portWith(project, () => Promise.reject(uncertain())) } },
      ),
    );

    const outcome = await recoverOperation(project.engine, operationId, 'resume');

    expect(outcome.kind).toBe('manual-commit');
    expect(outcome.kind === 'manual-commit' && outcome.result.commit.state).toBe('committed');
  });

  it('hands any other operation to the document queue', async () => {
    const project = await manualModeProject();
    const id = await saveUncommitted(project, 1, 'one\n');

    expect(await refusal(recoverOperation(project.engine, id, 'resume'))).toMatchObject({
      code: 'DOCUMENT_OPERATION_STATE_INVALID',
    });
    expect(await refusal(recoverOperation(project.engine, randomUUID(), 'resume'))).toMatchObject({
      code: 'DOCUMENT_OPERATION_NOT_FOUND',
    });
  });
});

describe('a manual commit that stopped while holding the checkout', () => {
  /** A save is uncommitted; its commit is cut after the reservation, as a killed CLI leaves it. */
  async function stoppedAfterReservation() {
    const project = await manualModeProject();
    await saveUncommitted(project, 1, 'one\n');
    const operationId = randomUUID();
    const error = await failure(
      commitUncommitted(
        project,
        { operationId, message: 'Stopped' },
        { deps: { hooks: { afterReserved: stop('afterReserved') } } },
      ),
    );
    expect(error).toBeInstanceOf(ManualCommitInterrupted);

    return { project, operationId };
  }

  it('is listed once nothing has moved for the stuck window, and names itself to the next commit', async () => {
    const { project, operationId } = await stoppedAfterReservation();

    // Just stopped: it may still be running, so it is not a row yet.
    expect(await listManualCommitRows(project.engine.context)).toEqual([]);
    const later = { nowMs: () => Date.now() + MANUAL_COMMIT_STUCK_MS + 1 };
    expect(await listManualCommitRows(project.engine.context, later)).toMatchObject([
      { operationId, code: 'OPERATION_INTERRUPTED', state: 'recovery-required' },
    ]);
    expect(await listDocumentOperationRows(project.engine)).toEqual([]);

    // The person who lost the operation id learns it from the busy answer.
    expect(await refusal(commitUncommitted(project, { message: 'Again' }))).toMatchObject({
      code: 'SPEC_BUSY',
      details: { cause: 'commit-in-progress', operationId },
    });
  });

  it('is resumed by the operator takeover and by nothing weaker', async () => {
    const { project, operationId } = await stoppedAfterReservation();
    const before = headCount(project);

    const result = await takeOverDocumentQueue(project.engine, { confirmExecutorStopped: true });

    expect(result.manualCommits).toEqual([{ operationId, outcome: 'resumed' }]);
    expect(headCount(project)).toBe(before + 1);
    expect(await ledgerPaths(project)).toEqual([]);
    expect(await journalOf(project, operationId)).toMatchObject({ stage: 'completed' });
  });
});

// Integration (real project, real Git): what the queue does when a commit cannot be made. The backoff
// and its cap, permanent failures and their dissolution by a new save, split-and-retry, retry,
// abandon and recover, the evidence that resolves an uncertain outcome, rewritten history, a project
// whose Git was turned off, a checkout that is gone, and a queue that dead operations do not fill.
import { randomUUID } from 'node:crypto';
import { rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SLOW_GIT_TEST_TIMEOUT_MS, symlinksAvailable } from '../support/platform';

import { GitCapabilityError } from '../../src/git/errors';
import { sha256Hex } from '../../src/hash';
import { applyDocumentChange } from '../../src/specs/documents/api';
import { buildJournal } from '../../src/specs/documents/changes/test-support';
import { DOCUMENT_CHANGE_JOURNAL_KIND } from '../../src/specs/documents/changes/journal/kind';
import {
  abandonDocumentCommit,
  recoverDocumentOperation,
  retryDocumentCommit,
} from '../../src/specs/documents/queue/actions';
import { backoffMs } from '../../src/specs/documents/queue/backoff';
import { listDocumentBatches } from '../../src/specs/documents/queue/batch-store';
import { QueueInterrupted, type QueueHooks } from '../../src/specs/documents/queue/types';
import { drainQueue, runQueueOnce } from '../../src/specs/documents/queue/worker';
import { publishJournal, withJournalLock } from '../../src/specs/durable';
import { pruneUncommitted } from '../../src/specs/uncommitted';
import { openVersionControl } from '../../src/version-control';
import type { CommitPort } from '../../src/version-control/commits/port';
import { findDocumentChangeJournal } from '../../src/specs/documents/write/journal-store';
import { failure, removeTrackedRoots, GIT_OFF } from '../support/documents-fixture';
import {
  checkoutClaimFree,
  ledgerOf,
  ledgerPaths,
  notesPath,
  notesText,
} from '../support/document-writes';
import {
  clockAfterBackoff,
  commitCount,
  committedPaths,
  currentNotes,
  editNotesByHand,
  engineCommits,
  isolatedQueue,
  manualClock,
  queueProject,
  queueRecords,
  queueSave,
  trailersOf,
  workingTreeClean,
  type QueueProject,
} from '../support/document-queue';
import { git } from '../support/git-project';

// Real Git on a slow runner: the seconds of Linux are minutes there.
vi.setConfig({ testTimeout: SLOW_GIT_TEST_TIMEOUT_MS });

afterEach(removeTrackedRoots);

const FLUSH = { flush: true } as const;
const HUMAN = ['-c', 'user.name=Human', '-c', 'user.email=human@example.invalid'] as const;
const specPath = (index: number): string => `specs/active/hand/${notesPath(index)}`;

function stage(project: QueueProject, id: string) {
  return findDocumentChangeJournal(project.engine.context, id);
}

/** Runs the queue to quiet on a clock past every backoff. */
function settleQueue(project: QueueProject, deps = {}) {
  return drainQueue(
    project.engine,
    isolatedQueue({ clock: clockAfterBackoff(), ...deps }),
    undefined,
    FLUSH,
  );
}

function humanCommit(project: QueueProject, ...args: string[]): void {
  git(project.root, ...HUMAN, 'commit', '-q', ...args);
}

/** A port whose commit does `before` and then fails the way `error` says. */
function failingPort(
  project: QueueProject,
  error: () => unknown,
  before: (real: CommitPort) => Promise<void> | void = () => undefined,
): CommitPort {
  const real = openVersionControl(project.engine).commits;
  return {
    ...real,
    commit: async () => {
      await before(real);
      throw error();
    },
  };
}

const uncertain = (): GitCapabilityError =>
  new GitCapabilityError('GIT_OPERATION_UNCERTAIN', 'uncertain', 'mutation-timeout');

describe('transient failures wait and give up', () => {
  it('waits 1 s, 2 s, 4 s, ... doubling to 60 s, and keeps waiting at 60 s past the tenth attempt', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'later\n');
    await writeFile(join(project.root, '.git', 'index.lock'), '');
    let at = Date.now() + 1000;
    for (let attempt = 1; attempt <= 9; attempt += 1) {
      const clock = manualClock();
      clock.wallAt(at);
      const result = await runQueueOnce(project.engine, isolatedQueue({ clock }), undefined, FLUSH);
      expect(result).toMatchObject({
        status: 'failed',
        outcome: 'requeued',
        reason: 'index-locked',
      });
      expect(await stage(project, id)).toMatchObject({
        stage: 'queued',
        attempts: attempt,
        nextAttemptAt: new Date(at + backoffMs(attempt)).toISOString(),
      });
      if (attempt === 1) {
        // Before the time is up the queue reports how long to wait and does not touch Git.
        const early = await runQueueOnce(
          project.engine,
          isolatedQueue({ clock }),
          undefined,
          FLUSH,
        );
        expect(early).toEqual({ status: 'idle', reason: 'backoff', waitMs: 1000 });
      }
      at += 120_000;
    }
    const clock = manualClock();
    clock.wallAt(at);
    // Far past the old limit of ten attempts the operation still waits, at the 60 s cap.
    for (let attempt = 10; attempt <= 14; attempt += 1) {
      const later = manualClock();
      later.wallAt(at);
      expect(
        await runQueueOnce(project.engine, isolatedQueue({ clock: later }), undefined, FLUSH),
      ).toMatchObject({ status: 'failed', outcome: 'requeued', reason: 'index-locked' });
      expect(await stage(project, id)).toMatchObject({
        stage: 'queued',
        reason: 'index-locked',
        attempts: 10,
        nextAttemptAt: new Date(at + 60_000).toISOString(),
      });
      at += 120_000;
    }
    expect(engineCommits(project)).toEqual([]);

    // The blocker goes away: the commit lands exactly once.
    await rm(join(project.root, '.git', 'index.lock'));
    const done = manualClock();
    done.wallAt(at);
    const results = await drainQueue(
      project.engine,
      isolatedQueue({ clock: done }),
      undefined,
      FLUSH,
    );
    expect(results.find((entry) => entry.status === 'committed')).toMatchObject({
      operationIds: [id],
    });
    expect(engineCommits(project)).toHaveLength(1);
    expect(workingTreeClean(project)).toBe(true);
  });

  it('keeps a queued commit while the Git program is missing and commits it once it is back', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'wait for git\n');
    const real = openVersionControl(project.engine).commits;
    let missing = true;
    const port = new Proxy(real, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver) as unknown;
        if (typeof value !== 'function') return value;
        return (...args: unknown[]) => {
          if (missing) {
            throw new GitCapabilityError(
              'GIT_UNAVAILABLE',
              'Git is not available.',
              'executable-unavailable',
            );
          }
          return (value as (...parameters: unknown[]) => unknown).apply(target, args);
        };
      },
    });
    let at = Date.now() + 1000;
    for (let round = 0; round < 12; round += 1) {
      const clock = manualClock();
      clock.wallAt(at);
      await runQueueOnce(
        project.engine,
        isolatedQueue({ clock, commits: port }),
        undefined,
        FLUSH,
      ).catch(() => undefined);
      expect(await stage(project, id)).toMatchObject({ stage: 'queued' });
      at += 120_000;
    }
    expect(engineCommits(project)).toEqual([]);

    missing = false;
    const clock = manualClock();
    clock.wallAt(at);
    const results = await drainQueue(
      project.engine,
      isolatedQueue({ clock, commits: port }),
      undefined,
      FLUSH,
    );
    expect(results.find((entry) => entry.status === 'committed')).toMatchObject({
      operationIds: [id],
    });
    expect(engineCommits(project)).toHaveLength(1);
  });

  it('lets a person abandon an operation that waits for Git: the files stay and the ledger holds the path', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'give up\n');
    await writeFile(join(project.root, '.git', 'index.lock'), '');
    await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
    expect(await stage(project, id)).toMatchObject({ stage: 'queued', reason: 'index-locked' });

    // A retry of a waiting operation is a repeat: it is on its way already.
    expect((await retryDocumentCommit(project.engine, id)).map((entry) => entry.stage)).toEqual([
      'queued',
    ]);
    const abandoned = await abandonDocumentCommit(project.engine, id);
    expect(abandoned.map((entry) => [entry.stage, entry.outcome, entry.reason])).toEqual([
      ['completed', 'uncommitted', 'abandoned'],
    ]);
    expect(await ledgerPaths(project)).toEqual([specPath(1)]);
    expect(await checkoutClaimFree(project)).toBe(true);
  });

  it('keeps the files and commits once the blocker is gone', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'later\n');
    const lock = join(project.root, '.git', 'index.lock');
    await writeFile(lock, '');
    await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
    await rm(lock);
    const results = await settleQueue(project);
    expect(results[0]).toMatchObject({ status: 'committed', operationIds: [id] });
    expect(workingTreeClean(project)).toBe(true);
  });
});

describe('permanent failures', () => {
  it('fails on a branch that changed, and a new save on the right branch dissolves the batch', async () => {
    const project = await queueProject();
    const first = await queueSave(project, 1, 'before the switch\n');
    git(project.root, 'checkout', '-q', '-b', 'somewhere-else');
    expect(await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH)).toMatchObject({
      status: 'failed',
      outcome: 'failed',
      reason: 'branch-changed',
    });
    expect((await queueRecords(project)).batches).toBe(1);

    git(project.root, 'checkout', '-q', 'feature/work');
    const second = await queueSave(project, 1, 'after the switch back\n');
    const results = await settleQueue(project);
    expect(results[0]).toMatchObject({ status: 'committed', operationIds: [first, second] });
    expect(await stage(project, first)).toMatchObject({ stage: 'completed', outcome: 'committed' });
    expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
  });

  it('does not let a failed batch hold up other paths of the same Specification', async () => {
    const project = await queueProject();
    await queueSave(project, 1, 'will fail\n');
    await editNotesByHand(project, 1, 'a human typed this\n');
    expect(await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH)).toMatchObject({
      status: 'failed',
      reason: 'content-changed',
    });
    const other = await queueSave(project, 2, 'goes through\n');
    const results = await settleQueue(project);
    expect(results[0]).toMatchObject({ status: 'committed', operationIds: [other] });
  });

  it.skipIf(!symlinksAvailable)(
    'never commits a symbolic link swapped in for a queued document with the same content',
    async () => {
      const project = await queueProject();
      await queueSave(project, 1, 'will be swapped\n');
      // The path now is a link to a file that holds exactly the planned bytes.
      await writeFile(join(project.root, 'same-content.md'), 'will be swapped\n');
      await rm(join(project.dir, notesPath(1)));
      await symlink(join(project.root, 'same-content.md'), join(project.dir, notesPath(1)));
      const before = commitCount(project);

      expect(await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH)).toMatchObject({
        status: 'failed',
        reason: 'content-changed',
      });

      expect(commitCount(project)).toBe(before);
      expect(git(project.root, 'ls-tree', 'HEAD', '--', specPath(1))).not.toContain('120000');
    },
  );

  it('lets dead operations wait without filling the queue of 200', async () => {
    const project = await queueProject();
    const context = project.engine.context;
    const fabricate = async (
      stageName: 'commit-failed' | 'queued',
      count: number,
      base: number,
    ) => {
      await withJournalLock(context, DOCUMENT_CHANGE_JOURNAL_KIND, async () => {
        for (let index = 0; index < count; index += 1) {
          const n = base + index;
          await publishJournal(
            context,
            DOCUMENT_CHANGE_JOURNAL_KIND,
            buildJournal(stageName, {
              projectId: context.project.projectId,
              operationId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
              specId: project.specId,
              workspaceId: project.workspaceId,
              workspaceRoot: project.root,
              sequence: n,
              batchId:
                stageName === 'queued'
                  ? undefined
                  : `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
            }),
          );
        }
      });
    };
    await fabricate('commit-failed', 205, 1000);
    await queueSave(project, 1, 'still accepted\n');

    await fabricate('queued', 199, 2000);
    const refused = await failure(
      applyDocumentChange(project.engine, project.specId, randomUUID(), {
        action: 'save',
        documentId: 'notes-2',
        content: 'one too many\n',
        expectedRevision: sha256Hex(notesText(2)),
      }),
    );
    expect(refused).toMatchObject({ code: 'SPEC_BUSY', details: { cause: 'queue-full' } });
  });
});

describe('split-and-retry', () => {
  it('commits the unaffected paths and leaves the failed path as a new failed batch', async () => {
    const project = await queueProject();
    const a = await queueSave(project, 1, 'one\n');
    const b = await queueSave(project, 2, 'two\n');
    const c = await queueSave(project, 3, 'three\n');
    await editNotesByHand(project, 2, 'a human typed this\n');

    const results = await settleQueue(project);
    expect(results[0]).toMatchObject({
      status: 'failed',
      outcome: 'split',
      reason: 'content-changed',
    });
    const committed = results.find((entry) => entry.status === 'committed');
    expect(committed).toMatchObject({ operationIds: [a, c], batchId: a });
    if (committed?.status !== 'committed') return;
    expect(committedPaths(project, committed.sha)).toEqual([specPath(1), specPath(3)]);
    expect(trailersOf(project, committed.sha)['Nevo-Coalesced']).toBe(c);

    expect(await stage(project, b)).toMatchObject({
      stage: 'commit-failed',
      reason: 'content-changed',
    });
    const batches = await listDocumentBatches(project.engine.context);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ operationId: b, state: 'failed', memberIds: [b] });
    expect(git(project.root, 'status', '--porcelain')).toContain(notesPath(2));
    expect(engineCommits(project)).toHaveLength(1);
  });

  it('gives the failed part its own id when the failed path belongs to the first member', async () => {
    const project = await queueProject();
    const a = await queueSave(project, 1, 'one\n');
    const b = await queueSave(project, 2, 'two\n');
    const c = await queueSave(project, 1, 'one again\n');
    await editNotesByHand(project, 1, 'a human typed this\n');

    const results = await settleQueue(project);
    // a and c share notes-1: both fail together; b is committed alone under its own id.
    expect(results[0]).toMatchObject({ status: 'failed', outcome: 'split' });
    expect(results.find((entry) => entry.status === 'committed')).toMatchObject({
      operationIds: [b],
      batchId: b,
    });
    const batches = await listDocumentBatches(project.engine.context);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ operationId: a, state: 'failed', memberIds: [a, c] });
    for (const id of [a, c]) expect((await stage(project, id))?.stage).toBe('commit-failed');
  });

  it('splits off a new document whose path became ignored', async () => {
    const project = await queueProject();
    const a = await queueSave(project, 1, 'one\n');
    const b = randomUUID();
    await applyDocumentChange(project.engine, project.specId, b, {
      action: 'create',
      documents: [{ path: 'extra.md', content: 'extra\n' }],
      folders: [],
    });
    await writeFile(
      join(project.root, '.gitignore'),
      `.nevo/local/\n${specPath(0).replace(notesPath(0), 'extra.md')}\n`,
    );

    const results = await settleQueue(project);
    expect(results[0]).toMatchObject({
      status: 'failed',
      outcome: 'split',
      reason: 'path-ignored',
    });
    expect(results.find((entry) => entry.status === 'committed')).toMatchObject({
      operationIds: [a],
    });
    expect(await stage(project, b)).toMatchObject({
      stage: 'commit-failed',
      reason: 'path-ignored',
    });
    expect(committedPaths(project, engineCommits(project)[0]!)).toEqual([specPath(1)]);
  });
});

describe('retry and abandon', () => {
  async function failedOperation(project: QueueProject): Promise<string> {
    const id = await queueSave(project, 1, 'mine\n');
    await editNotesByHand(project, 1, 'a human typed this\n');
    await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
    expect((await stage(project, id))?.stage).toBe('commit-failed');
    return id;
  }

  it('retries a failed commit: the batch dissolves, the counter resets and the next pass commits', async () => {
    const project = await queueProject();
    const id = await failedOperation(project);
    // The human put the bytes back (or the foreign edit was reverted): the retry now succeeds.
    await editNotesByHand(project, 1, currentNotes(project, 1));
    const retried = await retryDocumentCommit(project.engine, id);
    expect(
      retried.map((journal) => [journal.operationId, journal.stage, journal.attempts]),
    ).toEqual([[id, 'queued', 0]]);
    expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
    const results = await settleQueue(project);
    expect(results[0]).toMatchObject({ status: 'committed', operationIds: [id] });
  });

  it('refuses to retry an abandoned operation or an unknown one', async () => {
    const project = await queueProject();
    const id = await failedOperation(project);
    await abandonDocumentCommit(project.engine, id);
    expect(await failure(retryDocumentCommit(project.engine, id))).toMatchObject({
      code: 'DOCUMENT_OPERATION_STATE_INVALID',
    });
    expect(await failure(retryDocumentCommit(project.engine, randomUUID()))).toMatchObject({
      code: 'DOCUMENT_OPERATION_NOT_FOUND',
    });
  });

  it('abandons a failed commit: the files stay, the ledger holds the path, the claim is released, a later commit prunes it', async () => {
    const project = await queueProject();
    const id = await failedOperation(project);
    const abandoned = await abandonDocumentCommit(project.engine, id);
    expect(abandoned.map((journal) => [journal.stage, journal.outcome, journal.reason])).toEqual([
      ['completed', 'uncommitted', 'abandoned'],
    ]);
    expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
    expect(git(project.root, 'status', '--porcelain')).toContain(notesPath(1));
    // The ledger, not a claim, is the marker: the checkout is free and the path is recorded.
    expect(await checkoutClaimFree(project)).toBe(true);
    expect(await ledgerPaths(project)).toEqual([specPath(1)]);
    expect((await ledgerOf(project))?.entries[0]).toMatchObject({
      operationIds: [id],
      reason: 'abandoned',
      postSha256: sha256Hex('mine\n'),
    });
    expect(await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH)).toMatchObject({
      status: 'idle',
    });

    // A later save of the same document that commits ends the marker with that commit.
    const later = randomUUID();
    await applyDocumentChange(project.engine, project.specId, later, {
      action: 'save',
      documentId: 'notes-1',
      content: 'saved over it\n',
      expectedRevision: sha256Hex('a human typed this\n'),
    });
    const results = await settleQueue(project);
    expect(results[0]).toMatchObject({ status: 'committed', operationIds: [later] });
    expect(await stage(project, id)).toMatchObject({ stage: 'completed', outcome: 'uncommitted' });
    // The commit that holds the path ended its ledger entry.
    expect(await ledgerPaths(project)).toEqual([]);
    expect(await checkoutClaimFree(project)).toBe(true);
  });

  it('prunes the entry when a hand commit holds the path', async () => {
    const project = await queueProject();
    const id = await failedOperation(project);
    await abandonDocumentCommit(project.engine, id);
    expect(await ledgerPaths(project)).toEqual([specPath(1)]);
    expect(await pruneUncommitted(project.engine)).toEqual({ removed: 0, remaining: 1 });
    git(project.root, 'add', specPath(1));
    humanCommit(project, '-m', 'by hand');
    expect(await pruneUncommitted(project.engine)).toEqual({ removed: 1, remaining: 0 });
    expect(await ledgerOf(project)).toBeUndefined();
  });

  it('repeats an abandon with the same answer', async () => {
    const project = await queueProject();
    const id = await failedOperation(project);
    const first = await abandonDocumentCommit(project.engine, id);
    const again = await abandonDocumentCommit(project.engine, id);
    expect(again).toEqual(first);
    expect((await ledgerOf(project))?.entries[0]?.operationCount).toBe(1);
  });

  it('abandons every operation of the batch together', async () => {
    const project = await queueProject();
    const a = await queueSave(project, 1, 'one\n');
    const b = await queueSave(project, 1, 'one again\n');
    await editNotesByHand(project, 1, 'a human typed this\n');
    await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
    const abandoned = await abandonDocumentCommit(project.engine, b);
    expect(
      abandoned.map((journal) => [journal.operationId, journal.stage, journal.outcome]),
    ).toEqual([
      [a, 'completed', 'uncommitted'],
      [b, 'completed', 'uncommitted'],
    ]);
    expect((await ledgerOf(project))?.entries).toHaveLength(1);
    expect((await ledgerOf(project))?.entries[0]).toMatchObject({
      operationIds: [a, b],
      operationCount: 2,
      postSha256: sha256Hex('one again\n'),
    });
  });
});

describe('an uncertain outcome', () => {
  it('is retried when the evidence is decisive that nothing was committed', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'one\n');
    const result = await runQueueOnce(
      project.engine,
      isolatedQueue({ commits: failingPort(project, uncertain) }),
      undefined,
      FLUSH,
    );
    expect(result).toMatchObject({ status: 'failed', outcome: 'requeued', reason: 'git-timeout' });
    expect(await stage(project, id)).toMatchObject({
      stage: 'queued',
      attempts: 1,
      blockedBy: 'uncertain',
    });
    expect((await settleQueue(project))[0]).toMatchObject({ status: 'committed' });
  });

  it('completes the batch when the commit exists and is the whole batch', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'one\n');
    const real = openVersionControl(project.engine).commits;
    const port: CommitPort = {
      ...real,
      commit: async (request) => {
        await real.commit(request);
        throw uncertain();
      },
    };
    const result = await runQueueOnce(
      project.engine,
      isolatedQueue({ commits: port }),
      undefined,
      FLUSH,
    );
    expect(result).toMatchObject({ status: 'committed', operationIds: [id] });
    expect(engineCommits(project)).toHaveLength(1);
    expect(await stage(project, id)).toMatchObject({ stage: 'completed', outcome: 'committed' });
  });

  it('needs recovery when the evidence is not decisive, and does not hold up other paths', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'one\n');
    const port = failingPort(project, uncertain, () =>
      humanCommit(project, '--allow-empty', '-m', 'human'),
    );
    expect(
      await runQueueOnce(project.engine, isolatedQueue({ commits: port }), undefined, FLUSH),
    ).toMatchObject({ status: 'failed', outcome: 'recovery-required' });
    expect(await stage(project, id)).toMatchObject({
      stage: 'recovery-required',
      recoveryPhase: 'commit',
    });

    const other = await queueSave(project, 2, 'other path\n');
    const results = await settleQueue(project);
    expect(results[0]).toMatchObject({ status: 'committed', operationIds: [other] });
    expect((await stage(project, id))?.stage).toBe('recovery-required');
  });
});

describe('recover', () => {
  async function needsRecovery(project: QueueProject): Promise<string> {
    const id = await queueSave(project, 1, 'one\n');
    const port = failingPort(project, uncertain, () =>
      humanCommit(project, '--allow-empty', '-m', 'human'),
    );
    await runQueueOnce(project.engine, isolatedQueue({ commits: port }), undefined, FLUSH);
    expect((await stage(project, id))?.stage).toBe('recovery-required');
    return id;
  }

  it('--resume queues the batch again when nothing of it was committed', async () => {
    const project = await queueProject();
    const id = await needsRecovery(project);
    const resumed = await recoverDocumentOperation(project.engine, id, 'resume');
    expect(resumed.map((journal) => journal.stage)).toEqual(['queued']);
    expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
    expect((await settleQueue(project))[0]).toMatchObject({
      status: 'committed',
      operationIds: [id],
    });
  });

  it('--adopt accepts a hand commit that holds every path, and commits nothing itself', async () => {
    const project = await queueProject();
    const id = await needsRecovery(project);
    git(project.root, 'add', specPath(1));
    humanCommit(project, '-m', 'by hand');
    const hand = git(project.root, 'rev-parse', 'HEAD');
    const adopted = await recoverDocumentOperation(project.engine, id, 'adopt');
    expect(adopted).toHaveLength(1);
    expect(await stage(project, id)).toMatchObject({
      stage: 'completed',
      outcome: 'committed',
      sha: hand,
    });
    expect(engineCommits(project)).toEqual([]);
    expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
  });

  it('--adopt refuses while the repository does not hold the batch', async () => {
    const project = await queueProject();
    const id = await needsRecovery(project);
    expect(await failure(recoverDocumentOperation(project.engine, id, 'adopt'))).toMatchObject({
      code: 'DOCUMENT_RECOVERY_REQUIRED',
      details: { cause: 'recovery-unresolved' },
    });
    expect((await stage(project, id))?.stage).toBe('recovery-required');
  });

  it('--resume does not take a forged trailer for the batch', async () => {
    const project = await queueProject();
    const a = await queueSave(project, 1, 'one\n');
    await queueSave(project, 2, 'two\n');
    await expect(
      runQueueOnce(
        project.engine,
        isolatedQueue({ hooks: { afterClaim: () => Promise.reject(new QueueInterrupted()) } }),
        undefined,
        FLUSH,
      ),
    ).rejects.toBeInstanceOf(QueueInterrupted);
    git(project.root, 'add', specPath(1));
    git(
      project.root,
      '-c',
      'user.name=Forger',
      '-c',
      'user.email=engine@nevo.invalid',
      'commit',
      '-q',
      '-m',
      'forged',
      '-m',
      `Nevo-Operation: ${a}\nNevo-Kind: document-change`,
    );
    expect(await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH)).toMatchObject({
      status: 'failed',
      outcome: 'recovery-required',
    });
    for (const mode of ['resume', 'adopt'] as const) {
      expect(await failure(recoverDocumentOperation(project.engine, a, mode))).toMatchObject({
        details: { cause: 'recovery-unresolved' },
      });
    }
    const abandoned = await recoverDocumentOperation(project.engine, a, 'abandon');
    expect(abandoned.map((journal) => [journal.stage, journal.outcome])).toEqual([
      ['completed', 'uncommitted'],
      ['completed', 'uncommitted'],
    ]);
  });

  it('does not abandon an operation that has settled', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'one\n');
    await drainQueue(project.engine, isolatedQueue(), undefined, FLUSH);
    expect(await failure(abandonDocumentCommit(project.engine, id))).toMatchObject({
      code: 'DOCUMENT_OPERATION_STATE_INVALID',
    });
    expect(
      await failure(abandonDocumentCommit(project.engine, '00000000-0000-4000-8000-000000000000')),
    ).toMatchObject({ code: 'DOCUMENT_OPERATION_NOT_FOUND' });
  });

  it('only recovers an operation that needs it', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'one\n');
    expect(await failure(recoverDocumentOperation(project.engine, id, 'adopt'))).toMatchObject({
      code: 'DOCUMENT_OPERATION_STATE_INVALID',
    });
  });
});

describe('rewritten history', () => {
  it('reads the parent again when it was rewritten before any commit was started', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'one\n');
    await expect(
      runQueueOnce(
        project.engine,
        isolatedQueue({ hooks: { afterClaim: () => Promise.reject(new QueueInterrupted()) } }),
        undefined,
        FLUSH,
      ),
    ).rejects.toBeInstanceOf(QueueInterrupted);
    humanCommit(project, '--amend', '--allow-empty', '-m', 'amended after the claim');
    const amended = git(project.root, 'rev-parse', 'HEAD');

    const result = await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
    expect(result).toMatchObject({ status: 'committed', resumed: true, operationIds: [id] });
    if (result.status !== 'committed') return;
    expect(git(project.root, 'rev-parse', `${result.sha}^`)).toBe(amended);
  });

  it('needs recovery when it was rewritten after the commit was started, and resume queues it again', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'one\n');
    await expect(
      runQueueOnce(
        project.engine,
        isolatedQueue({ hooks: { afterCommit: () => Promise.reject(new QueueInterrupted()) } }),
        undefined,
        FLUSH,
      ),
    ).rejects.toBeInstanceOf(QueueInterrupted);
    // Both the Engine commit and its parent are taken away; the working tree keeps the content.
    git(project.root, 'reset', '-q', '--mixed', 'HEAD~2');

    const result = await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
    expect(result).toMatchObject({
      status: 'failed',
      outcome: 'recovery-required',
      reason: 'history-changed',
    });
    expect(await stage(project, id)).toMatchObject({ stage: 'recovery-required' });

    await recoverDocumentOperation(project.engine, id, 'resume');
    const results = await settleQueue(project);
    expect(results[0]).toMatchObject({ status: 'committed', operationIds: [id] });
  });
});

describe('a checkout that cannot take commits', () => {
  it('completes what is queued as not-applicable when Git is turned off, and keeps the files', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'one\n');
    await writeFile(join(project.root, '.nevo', 'config.yaml'), GIT_OFF);
    const result = await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
    expect(result).toEqual({ status: 'unavailable', reason: 'git-disabled', operationIds: [id] });
    expect(await stage(project, id)).toMatchObject({
      stage: 'completed',
      outcome: 'not-applicable',
      reason: 'git-disabled',
    });
    expect(engineCommits(project)).toEqual([]);
    expect(await checkoutClaimFree(project)).toBe(true);
    // Deliberately off is not an outage: nothing is retained for a later commit.
    expect(await ledgerOf(project)).toBeUndefined();
  });

  it('completes a claimed batch as not-applicable when Git was turned off after the claim', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'one\n');
    await expect(
      runQueueOnce(
        project.engine,
        isolatedQueue({ hooks: { afterClaim: () => Promise.reject(new QueueInterrupted()) } }),
        undefined,
        FLUSH,
      ),
    ).rejects.toBeInstanceOf(QueueInterrupted);
    await writeFile(join(project.root, '.nevo', 'config.yaml'), GIT_OFF);
    const result = await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
    expect(result).toMatchObject({ status: 'not-applicable', operationIds: [id] });
    expect(await stage(project, id)).toMatchObject({ stage: 'completed', reason: 'git-disabled' });
    expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
  });

  it('fails the queued operations as workspace-missing when the checkout is gone; abandon is allowed', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'one\n');
    const gone = { workspaceId: project.workspaceId, root: join(project.root, 'removed-checkout') };
    const result = await runQueueOnce(project.engine, isolatedQueue(), gone, FLUSH);
    expect(result).toEqual({
      status: 'unavailable',
      reason: 'workspace-missing',
      operationIds: [id],
    });
    expect(await stage(project, id)).toMatchObject({
      stage: 'commit-failed',
      reason: 'workspace-missing',
    });
    const abandoned = await abandonDocumentCommit(project.engine, id);
    expect(abandoned.map((journal) => [journal.stage, journal.outcome])).toEqual([
      ['completed', 'uncommitted'],
    ]);
    expect(await ledgerPaths(project)).toEqual([specPath(1)]);
  });

  it('fails a claimed batch as workspace-missing and can retry it once the checkout is back', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'one\n');
    await expect(
      runQueueOnce(
        project.engine,
        isolatedQueue({ hooks: { afterClaim: () => Promise.reject(new QueueInterrupted()) } }),
        undefined,
        FLUSH,
      ),
    ).rejects.toBeInstanceOf(QueueInterrupted);
    const gone = { workspaceId: project.workspaceId, root: join(project.root, 'removed-checkout') };
    expect(await runQueueOnce(project.engine, isolatedQueue(), gone, FLUSH)).toMatchObject({
      status: 'failed',
      outcome: 'failed',
      reason: 'workspace-missing',
    });
    await retryDocumentCommit(project.engine, id);
    expect((await settleQueue(project))[0]).toMatchObject({
      status: 'committed',
      operationIds: [id],
    });
  });
});

describe('the operator assertion', () => {
  it('takes over a lease that cannot be proven dead and resumes its batch', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'one\n');
    const hooks: QueueHooks = { afterClaim: () => Promise.reject(new QueueInterrupted()) };
    await expect(
      runQueueOnce(
        project.engine,
        isolatedQueue({ executor: { pid: 4242, hostId: 'some-other-host' }, hooks }),
        undefined,
        FLUSH,
      ),
    ).rejects.toBeInstanceOf(QueueInterrupted);
    expect(await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH)).toEqual({
      status: 'busy',
      reason: 'lease-held',
    });
    const resumed = await runQueueOnce(project.engine, isolatedQueue(), undefined, {
      ...FLUSH,
      confirmExecutorStopped: true,
    });
    expect(resumed).toMatchObject({ status: 'committed', resumed: true, operationIds: [id] });
  });
});

describe('a failure after the commit landed', () => {
  async function expectOneRecordedCommit(project: QueueProject, id: string): Promise<void> {
    const shas = engineCommits(project);
    expect(shas).toHaveLength(1);
    expect(await stage(project, id)).toMatchObject({
      stage: 'completed',
      outcome: 'committed',
      sha: shas[0],
    });
    expect(trailersOf(project, shas[0]!)['Nevo-Operation']).toBe(id);
    expect(await queueRecords(project)).toEqual({ batches: 0, lease: false });
  }

  it('records the commit when a plain error follows it', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'one\n');
    const hooks: QueueHooks = {
      afterCommit: () => Promise.reject(new Error('the queue storage failed')),
    };
    await expect(
      runQueueOnce(project.engine, isolatedQueue({ hooks }), undefined, FLUSH),
    ).rejects.toThrow('the queue storage failed');
    await settleQueue(project);
    await expectOneRecordedCommit(project, id);
  });

  it.each([
    [
      'a Git that timed out',
      () => new GitCapabilityError('GIT_UNAVAILABLE', 'timed out', 'timeout'),
    ],
    ['an inspection that failed', () => new GitCapabilityError('GIT_OPERATION_FAILED', 'failed')],
  ])('records the commit when the port reports %s after it', async (_name, error) => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'one\n');
    const real = openVersionControl(project.engine).commits;
    const port: CommitPort = {
      ...real,
      commit: async (request) => {
        await real.commit(request);
        throw error();
      },
    };
    await runQueueOnce(project.engine, isolatedQueue({ commits: port }), undefined, FLUSH);
    await settleQueue(project);
    await expectOneRecordedCommit(project, id);
  });

  it('records the commit when Git is turned off after it and before it was recorded', async () => {
    const project = await queueProject();
    const id = await queueSave(project, 1, 'one\n');
    const hooks: QueueHooks = { afterCommit: () => Promise.reject(new QueueInterrupted()) };
    await expect(
      runQueueOnce(project.engine, isolatedQueue({ hooks }), undefined, FLUSH),
    ).rejects.toBeInstanceOf(QueueInterrupted);
    await writeFile(join(project.root, '.nevo', 'config.yaml'), GIT_OFF);
    await runQueueOnce(project.engine, isolatedQueue(), undefined, FLUSH);
    await expectOneRecordedCommit(project, id);
  });
});

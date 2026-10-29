/**
 * Execution of a reserved manual commit (ADR 0018 decision 8): the lease of the checkout, the journal
 * at `committing`, one commit through the same port as the document queue, its verification, the
 * ledger prune and the completion. Every step is idempotent and a stop between two of them is
 * finished by the next call with the same operation id, which finds the commit by its trailer and
 * never makes a second one.
 *
 *   reserved --lease--> committing --commit--> verify --> prune ledger --> completed --> settled/
 *
 * The order of the last steps is the contract: the commit exists first, the ledger is pruned only
 * after the commit was proven to hold every recorded post-image, and the journal completes last, so
 * a stop at any point leaves either a ledger that still names a path HEAD holds (the next prune or
 * this operation's repeat removes it) or a journal that still says `committing`.
 */
import { isDeepStrictEqual } from 'node:util';

import { removeFileWindowsSafe } from '../../project/fs/windows-safe-fs';
import { GitCapabilityError } from '../../git/errors';
import {
  classifyCommitError,
  isBlockedBeforeCommit,
  NOT_TERMINATED,
  type ClassifiedCommitFailure,
} from '../../version-control/commits/failure-class';
import type { EngineCommitRequest } from '../../version-control/commits/port';
import {
  journalPath,
  judgeExecutor,
  publishJournal,
  markLeaseActive,
  markLeaseIdle,
  readCheckoutLease,
  removeCheckoutLeaseOf,
  removePayload,
  writeCheckoutLease,
  removeLedgerEntriesJudged,
  isMissing,
  type LedgerOwner,
} from '../durable';
import { ledgerOwnerOfKey } from '../durable/ledger/model';
import { MANUAL_COMMIT_BUSY_RETRY_AFTER_MS } from './admission';
import { gitRefusal, manualCommitError } from './errors';
import {
  commitHoldsEntries,
  lookUpCommit,
  provablyNotCommitted,
  type CommitEvidence,
} from './evidence';
import {
  MANUAL_COMMIT_JOURNAL_KIND,
  ManualCommitMovedError,
  readManualCommitJournal,
  readMessage,
  readSnapshot,
  settleManualCommitJournal,
  transitionManualCommitJournal,
  withManualCommitLock,
} from './journal-store';
import { manualCommitTrailers } from './message';
import { MANUAL_COMMIT_ABANDONED, NOTHING_TO_COMMIT, type ManualCommitJournal } from './model';
import type { SnapshotEntry } from './payload';
import { ManualCommitInterrupted, type ManualCommitRuntime } from './runtime';
import { editedSince, type ScopeEntry } from './selection';
import { transitionManualCommit, type ManualCommitTransitionPatch } from './transition';
import { readWorkingContents } from './working';

/** How a manual commit ended and what it holds. */
export interface ManualCommitDone {
  /** The journal as it ended: `completed`. */
  readonly journal: ManualCommitJournal;
  /** The checkout paths the commit holds; empty when every path already equalled HEAD. */
  readonly paths: readonly string[];
  /** The answer is the stored result of an operation that already ended. */
  readonly replayed: boolean;
}

const asScopeEntries = (entries: readonly SnapshotEntry[]): ScopeEntry[] =>
  entries.map((entry) => ({
    owner: entry.owner,
    path: entry.path,
    postSha256: entry.postSha256,
    operationIds: [],
    operationCount: entry.operationCount,
    recordedAt: '',
    reason: '',
  }));

function busyError(): Error {
  return manualCommitError(
    'busy-commit-in-progress',
    'Another commit is running in this checkout; retry shortly.',
    { retryAfterMs: MANUAL_COMMIT_BUSY_RETRY_AFTER_MS },
  );
}

/** The error a journal that ended `failed` stands for (what a replay of its operation id answers). */
export function errorOfFailedJournal(journal: ManualCommitJournal): Error {
  const reason = journal.reason ?? 'commit-failed';
  switch (reason) {
    case 'conflict':
      return manualCommitError(
        'conflict',
        'Some paths were edited since the Engine wrote them; reload and review them first.',
      );
    case 'branch-changed':
      return manualCommitError(
        'branch-changed',
        'The checkout is on another branch than the one the changes were made on.',
      );
    case 'branch-protected':
    case 'branch-not-allowed':
      return manualCommitError(reason, 'The Engine does not commit on this branch.');
    case MANUAL_COMMIT_ABANDONED:
      return manualCommitError(
        'operation-state-invalid',
        'This manual commit was abandoned; start a new one.',
      );
    default:
      return manualCommitError(
        'commit-blocked',
        'The checkout cannot take an Engine commit right now.',
        { blockedBy: journal.blockedBy ?? reason },
      );
  }
}

/**
 * Runs the manual commit of a `reserved` journal, or resumes one that was `committing` when its
 * executor stopped. Takes the checkout's lease for the duration; a lease held by a process that may
 * still run is `SPEC_BUSY` (and a `reserved` journal that never ran is discarded, so the same operation
 * id can be sent again).
 */
export function executeManualCommit(
  rt: ManualCommitRuntime,
  journal: ManualCommitJournal,
): Promise<ManualCommitDone> {
  return runClaimed(rt, journal, (claimed) => attempt(rt, claimed));
}

/**
 * Takes the lease and the journal (`committing`) and runs `work` while the checkout is this
 * executor's; the claim is given back when `work` ends in an error that is not a simulated stop.
 */
export async function runClaimed(
  rt: ManualCommitRuntime,
  journal: ManualCommitJournal,
  work: (claimed: ManualCommitJournal) => Promise<ManualCommitDone>,
): Promise<ManualCommitDone> {
  if (!markLeaseActive(journal.workspaceId)) {
    await discardIfNeverRan(rt, journal);

    throw busyError();
  }

  try {
    if (journal.stage === 'reserved') {
      await rt.hooks.afterReserved?.(journal);
    }

    const claimed = await claim(rt, journal);
    await rt.hooks.afterClaim?.(claimed);

    return await work(claimed);
  } catch (error) {
    if (error instanceof ManualCommitMovedError) {
      return movedOutcome(rt, error.current);
    }

    // An error that is not a simulated stop must not leave the lease to a live process.
    if (!(error instanceof ManualCommitInterrupted)) {
      await releaseAfterError(rt, journal.operationId).catch(() => undefined);
    }

    throw error;
  } finally {
    markLeaseIdle(journal.workspaceId);
  }
}

/** Another executor moved the journal while this one worked: what it ended as is the answer. */
async function movedOutcome(
  rt: ManualCommitRuntime,
  current: ManualCommitJournal,
): Promise<ManualCommitDone> {
  if (current.stage === 'completed') {
    return doneOf(rt, current, true);
  }

  if (current.stage === 'failed') {
    throw errorOfFailedJournal(current);
  }

  if (current.stage === 'recovery-required') {
    throw manualCommitError('recovery-required', 'The manual commit needs recovery.');
  }

  throw busyError();
}

/** The paths a completed journal holds: the commit's own changes, or none when there was nothing to commit. */
export async function doneOf(
  rt: ManualCommitRuntime,
  journal: ManualCommitJournal,
  replayed: boolean,
): Promise<ManualCommitDone> {
  if (journal.outcome !== 'committed' || journal.parentHead === undefined) {
    return { journal, paths: [], replayed };
  }

  let paths: readonly string[] | undefined;
  try {
    const found = await rt.commits.findByOperation(
      journal.workspaceRoot,
      journal.operationId,
      journal.parentHead,
    );
    if (found.status === 'found') {
      paths = found.paths;
    }
  } catch {
    // The history cannot be asked (rewritten or unreadable): the snapshot names what was committed.
  }

  paths ??= (await readSnapshot(rt.context, journal)).map((entry) => entry.path);

  return { journal, paths, replayed };
}

/** Removes a `reserved` journal that never ran (no effect exists), so the id can be sent again. */
async function discardIfNeverRan(
  rt: ManualCommitRuntime,
  journal: ManualCommitJournal,
): Promise<void> {
  if (journal.stage !== 'reserved') {
    return;
  }

  await withManualCommitLock(rt.context, async () => {
    const current = await readManualCommitJournal(rt.context, journal.operationId);
    if (current?.stage !== 'reserved') {
      return;
    }

    await removeFileWindowsSafe(
      journalPath(rt.context, MANUAL_COMMIT_JOURNAL_KIND, journal.operationId),
    ).catch((error: unknown) => {
      if (!isMissing(error)) {
        throw error;
      }
    });
    await removePayload(rt.context, MANUAL_COMMIT_JOURNAL_KIND, journal.operationId);
  });
}

/**
 * Takes the lease and moves the journal to `committing`, in one control-lock section: the lease is
 * written first (an executor that may still run keeps it: busy), then the journal records this
 * executor and the HEAD the commit is searched on top of. A stop between the two leaves a lease of a
 * dead executor and a journal that still says `reserved` or `committing`: the next call judges the
 * lease and replaces it.
 */
async function claim(
  rt: ManualCommitRuntime,
  journal: ManualCommitJournal,
): Promise<ManualCommitJournal> {
  const head = await rt.commits.head(journal.workspaceRoot).catch(() => undefined);
  const own = await rt.executor();
  const now = rt.nowIso();
  try {
    return await withManualCommitLock(rt.context, async () => {
      const current = await readManualCommitJournal(rt.context, journal.operationId);
      if (
        current === undefined ||
        (current.stage !== 'reserved' &&
          current.stage !== 'committing' &&
          current.stage !== 'recovery-required')
      ) {
        throw new ManualCommitMovedError(current ?? journal);
      }

      const lease = await readCheckoutLease(rt.context, journal.workspaceId, rt.leaseErrors);
      if (lease !== undefined) {
        const verdict = await judgeExecutor(lease.executor, own, {
          // A concurrent run of this process was excluded by the caller before the claim.
          activeInProcess: false,
          confirmStopped: rt.options.confirmExecutorStopped === true,
          table: rt.table,
        });
        if (verdict.kind === 'held') {
          throw busyError();
        }
      }

      const parentHead = current.parentHead ?? head;
      if (parentHead === undefined) {
        throw gitRefusal(
          new GitCapabilityError(
            'COMMIT_BLOCKED',
            'The checkout cannot take an Engine commit right now.',
            'no-commits',
          ),
        );
      }

      await writeCheckoutLease(
        rt.context,
        {
          workspaceId: journal.workspaceId,
          executor: own,
          batchId: journal.operationId,
          acquiredAt: now,
        },
        rt.leaseErrors,
      );
      await rt.hooks.inClaimAfterLease?.();
      const next = await publishTransition(rt, current, 'committing', {
        executor: own,
        parentHead,
      });

      return next;
    });
  } catch (error) {
    if (isBusy(error)) {
      await discardIfNeverRan(rt, journal);
    }

    throw error;
  }
}

const isBusy = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && (error as { code?: unknown }).code === 'SPEC_BUSY';

/** Publishes a transition under the control lock the caller already holds. */
async function publishTransition(
  rt: ManualCommitRuntime,
  current: ManualCommitJournal,
  to: ManualCommitJournal['stage'],
  patch: ManualCommitTransitionPatch,
): Promise<ManualCommitJournal> {
  const next = transitionManualCommit(current, to, patch, rt.nowIso());
  await publishJournal(rt.context, MANUAL_COMMIT_JOURNAL_KIND, next);

  return next;
}

/** Rewrites the journal of the committing executor (it must still be this one). */
async function updateOwn(
  rt: ManualCommitRuntime,
  journal: ManualCommitJournal,
  patch: ManualCommitTransitionPatch,
): Promise<ManualCommitJournal> {
  const own = await rt.executor();

  return transitionManualCommitJournal(
    rt.context,
    journal.operationId,
    ['committing'],
    'committing',
    patch,
    rt.nowIso(),
    { guard: (current) => isDeepStrictEqual(current.executor, own) },
  );
}

async function releaseLease(rt: ManualCommitRuntime, journal: ManualCommitJournal): Promise<void> {
  await withManualCommitLock(rt.context, () =>
    removeCheckoutLeaseOf(rt.context, journal.workspaceId, journal.operationId, rt.leaseErrors),
  );
}

/** Ends the journal in a final or recovery stage, releases the lease and settles a final journal. */
export async function finish(
  rt: ManualCommitRuntime,
  journal: ManualCommitJournal,
  to: 'completed' | 'failed' | 'recovery-required',
  patch: ManualCommitTransitionPatch,
): Promise<ManualCommitJournal> {
  const own = await rt.executor();
  const next = await transitionManualCommitJournal(
    rt.context,
    journal.operationId,
    ['committing'],
    to,
    patch,
    rt.nowIso(),
    { guard: (current) => isDeepStrictEqual(current.executor, own) },
  );
  if (to === 'completed') {
    await rt.hooks.afterCompleted?.(next);
  }

  await releaseLease(rt, next);
  if (to !== 'recovery-required') {
    await settleManualCommitJournal(rt.context, next.operationId);
  }

  return next;
}

/**
 * A journal that ended but was not moved to `settled/` (a stop after the completion): the lease it may
 * still hold goes and the record is settled. Idempotent; a journal already settled is left alone.
 */
export async function settleEnded(
  rt: ManualCommitRuntime,
  journal: ManualCommitJournal,
): Promise<void> {
  if ((await readManualCommitJournal(rt.context, journal.operationId)) === undefined) {
    return;
  }

  await releaseLease(rt, journal);
  await settleManualCommitJournal(rt.context, journal.operationId);
}

/** Removes the ledger entries the commit held, as judged at the reservation (idempotent). */
export async function pruneSnapshot(
  rt: ManualCommitRuntime,
  journal: ManualCommitJournal,
  entries: readonly SnapshotEntry[],
): Promise<void> {
  const owners = new Map<string, SnapshotEntry[]>();
  for (const entry of entries) {
    owners.set(entry.owner, [...(owners.get(entry.owner) ?? []), entry]);
  }

  for (const [key, judged] of owners) {
    const owner: LedgerOwner | undefined = ledgerOwnerOfKey(key);
    if (owner === undefined) {
      continue;
    }

    await removeLedgerEntriesJudged(
      rt.context,
      journal.workspaceId,
      owner,
      judged.map((entry) => ({
        path: entry.path,
        postSha256: entry.postSha256,
        operationCount: entry.operationCount,
      })),
      () => rt.nowIso(),
    );
  }
}

/** The commit holds everything (or there was nothing to commit): prune the ledger, complete, release. */
export async function complete(
  rt: ManualCommitRuntime,
  journal: ManualCommitJournal,
  entries: readonly SnapshotEntry[],
  committed: { readonly sha: string; readonly paths: readonly string[] } | undefined,
): Promise<ManualCommitDone> {
  await pruneSnapshot(rt, journal, entries);
  await rt.hooks.afterLedgerPruned?.(journal);
  const done = await finish(
    rt,
    journal,
    'completed',
    committed === undefined
      ? { outcome: 'not-applicable', reason: NOTHING_TO_COMMIT }
      : { outcome: 'committed', sha: committed.sha, pathCount: committed.paths.length },
  );

  return { journal: done, paths: committed?.paths ?? [], replayed: false };
}

/** A refusal decided at execution: nothing was changed. The journal ends `failed` and the error is thrown. */
async function refuse(
  rt: ManualCommitRuntime,
  journal: ManualCommitJournal,
  reason: string,
  error: Error,
  blockedBy?: string,
): Promise<never> {
  await finish(rt, journal, 'failed', {
    reason,
    ...(blockedBy !== undefined ? { blockedBy } : {}),
  });

  throw error;
}

/** The outcome in Git is not provable: the journal waits for the operator. */
export async function needsRecovery(
  rt: ManualCommitRuntime,
  journal: ManualCommitJournal,
  reason: string,
  blockedBy?: string,
): Promise<never> {
  await finish(rt, journal, 'recovery-required', {
    reason,
    ...(blockedBy !== undefined ? { blockedBy } : {}),
  });

  throw manualCommitError('recovery-required', 'The manual commit needs recovery.');
}

const kebab = (value: string | undefined): string | undefined =>
  value !== undefined && /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/u.test(value) && value.length <= 64
    ? value
    : undefined;

async function attempt(
  rt: ManualCommitRuntime,
  started: ManualCommitJournal,
): Promise<ManualCommitDone> {
  const root = started.workspaceRoot;
  let journal = started;
  const entries = await readSnapshot(rt.context, journal);
  const message = await readMessage(rt.context, journal);
  const paths = entries.map((entry) => entry.path);
  try {
    // An earlier attempt may have committed: the commit with this operation's trailer is accepted when
    // it is the whole manual commit, and never repeated.
    if (journal.commitStartedAt !== undefined) {
      const evidence = await lookUpCommit(rt.commits, journal, entries);
      const resolved = await resolveEvidence(rt, journal, entries, evidence);
      if (resolved !== undefined) {
        return resolved;
      }
    }

    const head = await rt.commits.head(root);
    if (head === undefined) {
      throw new GitCapabilityError(
        'COMMIT_BLOCKED',
        'The checkout cannot take an Engine commit right now.',
        'no-commits',
      );
    }

    // No commit was started, so none can be lost: a parent that history left behind is read again.
    if (journal.commitStartedAt === undefined && head !== journal.parentHead) {
      journal = await updateOwn(rt, journal, { parentHead: head });
    }

    if ((await rt.commits.currentBranch(root)) !== journal.branch) {
      return await refuse(
        rt,
        journal,
        'branch-changed',
        manualCommitError(
          'branch-changed',
          'The checkout is on another branch than the one the changes were made on.',
        ),
      );
    }

    const edited = editedSince(asScopeEntries(entries), await readWorkingContents(root, paths));
    if (edited.length > 0) {
      return await refuse(
        rt,
        journal,
        'conflict',
        manualCommitError(
          'conflict',
          'Some paths were edited since the Engine wrote them; reload and review them first.',
          { paths: edited },
        ),
      );
    }

    const split = await rt.commits.effectivePaths(root, paths);
    if (split.effective.length === 0) {
      // Every path already equals HEAD (a hand commit, or an identical content): no Git mutation.
      return await complete(rt, journal, entries, undefined);
    }

    await rt.hooks.beforeCommit?.(journal);
    // Recorded before Git runs: from here on a commit may exist.
    journal = await updateOwn(rt, journal, { commitStartedAt: rt.nowIso() });
    const ownerOfPath = new Map(entries.map((entry) => [entry.path, entry.owner]));
    const request: EngineCommitRequest = {
      root,
      expectedBranch: journal.branch,
      paths: split.effective,
      droppedPaths: split.dropped,
      operationId: journal.operationId,
      kind: 'manual-commit',
      subject: message.subject,
      ...(message.body.length > 0 ? { body: message.body } : {}),
      trailers: manualCommitTrailers({
        scope: journal.scope,
        owners: journal.owners,
        effective: split.effective,
        ownerOfPath,
      }),
      ...(rt.options.commitDeadlineMs !== undefined
        ? { deadlineMs: rt.options.commitDeadlineMs }
        : {}),
    };
    const committed = await rt.commits.commit(request);
    await rt.hooks.afterCommit?.(journal, committed.sha);
    // A foreign write between the check and the add is inside the commit: it is not the recorded content.
    if (!(await commitHoldsEntries(rt.commits, root, entries, split.effective, committed.sha))) {
      return await needsRecovery(rt, journal, 'uncertain', 'commit-content-mismatch');
    }

    await rt.hooks.afterVerify?.(journal, committed.sha);

    return await complete(rt, journal, entries, { sha: committed.sha, paths: split.effective });
  } catch (error) {
    const classified = classifyCommitError(error);
    if (classified === undefined) {
      throw error;
    }

    return handleFailure(rt, journal, entries, classified);
  }
}

/**
 * What the evidence of an earlier attempt decides: a commit that is the whole manual commit completes
 * it; a commit that carries the trailer but is not it, or rewritten history, needs recovery; no commit
 * leaves the attempt to go on.
 */
async function resolveEvidence(
  rt: ManualCommitRuntime,
  journal: ManualCommitJournal,
  entries: readonly SnapshotEntry[],
  evidence: CommitEvidence,
): Promise<ManualCommitDone | undefined> {
  switch (evidence.kind) {
    case 'committed':
      return complete(rt, journal, entries, { sha: evidence.sha, paths: evidence.paths });
    case 'foreign-commit':
      return needsRecovery(rt, journal, 'uncertain', 'foreign-commit');
    case 'history-changed':
      return needsRecovery(rt, journal, 'history-changed');
    case 'absent':
      return undefined;
  }
}

/**
 * A failed attempt (the port's error, classified). Once the commit was started a failure that does not
 * prove the commit never ran is checked against the repository FIRST: a commit that is the whole manual
 * commit completes it, whatever the failure was. Only provably no commit (no trailer, HEAD unchanged, no
 * index lock, and a Git process known to have ended) is an ordinary refusal; anything else, or a
 * repository that cannot be asked, stays for the operator.
 */
async function handleFailure(
  rt: ManualCommitRuntime,
  journal: ManualCommitJournal,
  entries: readonly SnapshotEntry[],
  failure: ClassifiedCommitFailure,
): Promise<ManualCommitDone> {
  const latest = (await readManualCommitJournal(rt.context, journal.operationId)) ?? journal;
  const started = latest.commitStartedAt !== undefined;
  const maybeLanded =
    started &&
    (failure.kind === 'uncertain' ||
      (failure.kind === 'transient' && !isBlockedBeforeCommit(failure.reason)));
  const refusal = (): Promise<never> =>
    refuse(
      rt,
      latest,
      kebab(failure.reason) ?? 'commit-failed',
      refusalError(failure),
      failure.blockedBy,
    );
  if (!maybeLanded) {
    return failure.kind === 'uncertain'
      ? needsRecovery(rt, latest, kebab(failure.reason) ?? 'uncertain', failure.blockedBy)
      : refusal();
  }

  let evidence: CommitEvidence;
  try {
    evidence = await lookUpCommit(rt.commits, latest, entries);
  } catch (error) {
    if (classifyCommitError(error) === undefined) {
      throw error;
    }

    // The repository cannot be asked whether the commit landed.
    return needsRecovery(rt, latest, 'uncertain', kebab(failure.reason));
  }

  const resolved = await resolveEvidence(rt, latest, entries, evidence);
  if (resolved !== undefined) {
    return resolved;
  }

  // No commit. A Git process that may still be running makes that no proof.
  if (
    failure.blockedBy !== NOT_TERMINATED &&
    (await provablyNotCommitted(
      rt.commits,
      latest,
      entries.map((entry) => entry.path),
    ))
  ) {
    return refusal();
  }

  return needsRecovery(rt, latest, 'uncertain', kebab(failure.blockedBy ?? failure.reason));
}

/** The error a classified failure is for the caller of a synchronous request. */
function refusalError(failure: ClassifiedCommitFailure): Error {
  if (failure.reason === 'branch-protected' || failure.reason === 'branch-not-allowed') {
    return manualCommitError(failure.reason, 'The Engine does not commit on this branch.');
  }

  if (failure.reason === 'branch-changed') {
    return manualCommitError(
      'branch-changed',
      'The checkout is on another branch than the one the changes were made on.',
    );
  }

  return manualCommitError(
    'commit-blocked',
    'The checkout cannot take an Engine commit right now.',
    { blockedBy: failure.blockedBy ?? failure.reason },
  );
}

/**
 * Gives the checkout back after an error that is neither a commit failure nor a stop: the lease goes
 * (when it is this executor's); a journal whose commit was started cannot say what happened and
 * needs recovery; an earlier journal stays resumable.
 */
async function releaseAfterError(rt: ManualCommitRuntime, operationId: string): Promise<void> {
  const own = await rt.executor();
  const journal = await readManualCommitJournal(rt.context, operationId);
  if (journal === undefined) {
    return;
  }

  if (journal.stage === 'committing' && isDeepStrictEqual(journal.executor, own)) {
    if (journal.commitStartedAt !== undefined) {
      await finish(rt, journal, 'recovery-required', {
        reason: 'uncertain',
        blockedBy: 'engine-error',
      });

      return;
    }
  }

  await releaseLease(rt, journal);
}

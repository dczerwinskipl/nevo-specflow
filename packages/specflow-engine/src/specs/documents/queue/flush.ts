import type { SpecFlowEngine } from '../../../application';
import { documentChangeError } from '../changes/errors';
import type { DocumentChangeJournal } from '../changes/journal/model';
import type { DocumentChangeStage } from '../changes/journal/stages';
import { listDocumentChangeJournals } from '../write/journal-store';
import { listManualCommitJournals } from '../../manual-commit';
import { pruneUncommitted, readUncommittedHold } from '../../uncommitted';
import { systemQueueClock, type QueueClock } from './settle-ledger';
import { systemQueueTimers, withDeadline, type QueueTimers } from './timers';
import {
  QueueInterrupted,
  type QueueCheckout,
  type QueueDependencies,
  type QueueOptions,
} from './types';
import { drainQueue } from './worker';

/** How long a flush waits for the commits of one checkout (Close, ADR 0016 decision 16). */
export const DOCUMENT_FLUSH_WAIT_CAP_MS = 30_000;

/** The pause between two looks at a checkout whose commit is held by another executor. */
const FLUSH_POLL_MS = 250;

/**
 * Why the document journals of a checkout still hold it, in the order Close reports it:
 * work that is not finished (`commit-pending`), a commit that failed or needs recovery
 * (`commit-failed`), and files that are on disk but not in Git, recorded in the uncommitted-changes
 * ledger (`commit-uncommitted`; only Close reads this one, see {@link readCloseHold}).
 */
export type DocumentCommitHoldCause = 'commit-pending' | 'commit-failed' | 'commit-uncommitted';

export interface DocumentCommitHold {
  readonly workspaceId: string;
  readonly cause: DocumentCommitHoldCause;
  readonly operationIds: readonly string[];
}

const HOLD_OF_STAGE: Readonly<Record<DocumentChangeStage, DocumentCommitHoldCause | undefined>> = {
  reserved: 'commit-pending',
  'files-writing': 'commit-pending',
  queued: 'commit-pending',
  committing: 'commit-pending',
  'commit-failed': 'commit-failed',
  'recovery-required': 'commit-failed',
  completed: undefined,
  failed: undefined,
};

const CAUSE_ORDER: readonly DocumentCommitHoldCause[] = ['commit-pending', 'commit-failed'];

/**
 * The document journals (and manual commits) that still hold a checkout, with the most urgent cause. Reads the active
 * journals only (no Git, no lock); `undefined` when nothing holds the checkout.
 */
export async function readDocumentCommitHold(
  engine: SpecFlowEngine,
  workspaceId: string,
): Promise<DocumentCommitHold | undefined> {
  const byCause = new Map<DocumentCommitHoldCause, string[]>();
  for (const journal of await listDocumentChangeJournals(engine.context)) {
    if (journal.workspaceId !== workspaceId) continue;
    const cause = HOLD_OF_STAGE[journal.stage];
    if (cause === undefined) continue;
    byCause.set(cause, [...(byCause.get(cause) ?? []), journal.operationId]);
  }
  // A manual commit that has not ended holds the checkout as well: it is running (pending) or it
  // needs the operator (failed).
  for (const journal of await listManualCommitJournals(engine.context)) {
    if (journal.workspaceId !== workspaceId) continue;
    const cause: DocumentCommitHoldCause | undefined =
      journal.stage === 'recovery-required'
        ? 'commit-failed'
        : journal.stage === 'reserved' || journal.stage === 'committing'
          ? 'commit-pending'
          : undefined;
    if (cause === undefined) continue;
    byCause.set(cause, [...(byCause.get(cause) ?? []), journal.operationId]);
  }
  for (const cause of CAUSE_ORDER) {
    const operationIds = byCause.get(cause);
    if (operationIds !== undefined) return { workspaceId, cause, operationIds };
  }
  return undefined;
}

/**
 * What stops a Close of the checkout: the journals' hold, else the ledger's. Prunes the ledger first
 * (read-only Git), so files a hand commit or a queued batch already holds do not refuse the Close.
 */
export async function readCloseHold(
  engine: SpecFlowEngine,
  workspaceId: string,
): Promise<DocumentCommitHold | undefined> {
  const journals = await readDocumentCommitHold(engine, workspaceId);
  if (journals !== undefined) return journals;
  await pruneUncommitted(engine, { workspaceId }).catch(() => undefined);
  const ledger = await readUncommittedHold(engine, workspaceId);
  return ledger !== undefined
    ? { workspaceId, cause: 'commit-uncommitted', operationIds: ledger.operationIds }
    : undefined;
}

/** The `DOCUMENT_COMMITS_PENDING` error of a hold (Close, integration). */
export function documentCommitsPendingError(hold: DocumentCommitHold): Error {
  const cause =
    hold.cause === 'commit-pending'
      ? 'close-commit-pending'
      : hold.cause === 'commit-failed'
        ? 'close-commit-failed'
        : 'close-commit-uncommitted';
  return documentChangeError(
    cause,
    'Document commits of this checkout are not finished; flush them, retry or resolve the failed ones.',
  );
}

export interface FlushDependencies {
  /** Seams of the queue pass (commit port, clock, process table, hooks). */
  readonly queue?: QueueDependencies;
  readonly queueOptions?: Omit<QueueOptions, 'flush'>;
  /** Monotonic clock for the wait cap; defaults to the system clock. */
  readonly clock?: QueueClock;
  /** Pause between looks; defaults to a timer. */
  readonly sleep?: (ms: number) => Promise<void>;
}

export interface FlushOptions extends FlushDependencies {
  /** Longest wait for a checkout whose commit another executor holds (default 30 s). */
  readonly waitCapMs?: number;
}

export interface FlushOutcome {
  /** The hold that remains after the flush; absent when the checkout is clean of document work. */
  readonly remaining: DocumentCommitHold | undefined;
  /** The wait cap ran out while work was still held by someone else. */
  readonly timedOut: boolean;
}

const timerSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/**
 * Commits what is queued in a checkout now, ignoring the settle period (ADR 0016 decisions 9 and 16).
 * Passes of the queue run with `flush: true` until no journal of the checkout is `queued`, `committing`
 * or mid-write, nothing more can progress (a failed batch blocks the rest, which then stays queued),
 * or the wait cap runs out. A checkout whose queue another executor runs (or this process already runs)
 * is looked at again every 250 ms until the cap. Never throws for a commit failure: that is a state the
 * caller reads from `remaining`.
 */
export async function flushDocumentCommits(
  engine: SpecFlowEngine,
  checkout: QueueCheckout,
  options: FlushOptions = {},
): Promise<FlushOutcome> {
  const outcome = await flushUntilSettled(engine, checkout, options);
  // What the commits made (or a hand commit made) no longer belongs in the ledger.
  await pruneUncommitted(engine, {
    workspaceId: checkout.workspaceId,
    ...(options.queue?.commits !== undefined ? { commits: options.queue.commits } : {}),
  }).catch(() => undefined);
  return outcome;
}

async function flushUntilSettled(
  engine: SpecFlowEngine,
  checkout: QueueCheckout,
  options: FlushOptions,
): Promise<FlushOutcome> {
  const clock = options.clock ?? systemQueueClock;
  const sleep = options.sleep ?? timerSleep;
  const cap = options.waitCapMs ?? DOCUMENT_FLUSH_WAIT_CAP_MS;
  const started = clock.monotonicMs();
  for (;;) {
    if (!(await hasUnfinishedWork(engine, checkout.workspaceId))) {
      return {
        remaining: await readDocumentCommitHold(engine, checkout.workspaceId),
        timedOut: false,
      };
    }
    let results;
    try {
      results = await drainQueue(engine, options.queue ?? {}, checkout, {
        ...options.queueOptions,
        flush: true,
      });
    } catch (error) {
      if (error instanceof QueueInterrupted) throw error;
      // The pass gave its claim back; what remains is read from the journals.
      return {
        remaining: await readDocumentCommitHold(engine, checkout.workspaceId),
        timedOut: false,
      };
    }
    const last = results.at(-1);
    // Nothing more can progress: the rest waits behind a failed batch, or the checkout cannot commit.
    if (last?.status === 'unavailable' || (last?.status === 'idle' && last.reason === 'blocked')) {
      return {
        remaining: await readDocumentCommitHold(engine, checkout.workspaceId),
        timedOut: false,
      };
    }
    const elapsed = clock.monotonicMs() - started;
    if (elapsed >= cap) {
      return {
        remaining: await readDocumentCommitHold(engine, checkout.workspaceId),
        timedOut: true,
      };
    }
    const wait =
      last?.status === 'idle' && last.waitMs !== undefined
        ? Math.min(Math.max(last.waitMs, 1), FLUSH_POLL_MS)
        : FLUSH_POLL_MS;
    await sleep(Math.min(wait, cap - elapsed));
  }
}

/** Whether an operation of the checkout is still on its way to a commit (not failed). */
async function hasUnfinishedWork(engine: SpecFlowEngine, workspaceId: string): Promise<boolean> {
  return (await listDocumentChangeJournals(engine.context)).some(
    (journal) =>
      journal.workspaceId === workspaceId && HOLD_OF_STAGE[journal.stage] === 'commit-pending',
  );
}

/** The checkouts of a Close (source, and target when it is another checkout) the flush serves. */
export interface FlushCheckoutEvidence {
  readonly workspaceId: string;
  readonly root: string;
}

/**
 * The Close hook (ADR 0016 decision 16): flushes every given checkout, one after the other, then
 * refuses with `DOCUMENT_COMMITS_PENDING` when any of them is still held by document journals
 * (pending, failed, awaiting recovery) or the ledger still holds uncommitted paths. Runs between the pure Close preview and the
 * control lock; a save that slips in after the flush is the claim conflict inside the lock.
 */
export async function flushCheckoutsForClose(
  engine: SpecFlowEngine,
  checkouts: readonly FlushCheckoutEvidence[],
  options: FlushOptions = {},
): Promise<void> {
  const distinct = new Map<string, FlushCheckoutEvidence>();
  for (const checkout of checkouts) distinct.set(checkout.workspaceId, checkout);
  for (const checkout of distinct.values()) {
    const outcome = await flushDocumentCommits(engine, checkout, options);
    if (outcome.remaining !== undefined) throw documentCommitsPendingError(outcome.remaining);
    const uncommitted = await readCloseHold(engine, checkout.workspaceId);
    if (uncommitted !== undefined) throw documentCommitsPendingError(uncommitted);
  }
}

/**
 * Checkouts with operations the queue can act on (`queued`, `committing`), found from the journals
 * (no lock, no Git). The roots come from the journals, so a linked worktree is served as well as the
 * checkout the engine was opened in.
 */
export async function checkoutsWithQueueWork(engine: SpecFlowEngine): Promise<QueueCheckout[]> {
  return checkoutsOfJournals(await listDocumentChangeJournals(engine.context));
}

/** The checkouts of the journals the queue can act on, without a read (see {@link checkoutsWithQueueWork}). */
export function checkoutsOfJournals(
  journals: readonly Pick<DocumentChangeJournal, 'stage' | 'workspaceId' | 'workspaceRoot'>[],
): QueueCheckout[] {
  const found = new Map<string, QueueCheckout>();
  for (const journal of journals) {
    if (journal.stage !== 'queued' && journal.stage !== 'committing') continue;
    if (!found.has(journal.workspaceId)) {
      found.set(journal.workspaceId, {
        workspaceId: journal.workspaceId,
        root: journal.workspaceRoot,
      });
    }
  }
  return [...found.values()];
}

export interface FlushAllOptions extends FlushDependencies {
  /** The whole flush is given up after this long (shutdown: 10 s). What is left stays journaled. */
  readonly deadlineMs: number;
  readonly timers?: QueueTimers;
}

export interface FlushAllOutcome {
  readonly checkouts: number;
  /** Operations still `queued` or `committing` when the flush ended. */
  readonly remaining: number;
  readonly timedOut: boolean;
}

/**
 * Flushes every checkout with queue work within a deadline (shutdown of the Runtime, exit of a CLI
 * command). Checkouts are flushed one after the other; when the deadline passes the flush stops
 * waiting. A commit already running is not cancelled: if the process exits first, its journal
 * is recovered by the next executor (dead proof), so nothing is lost or committed twice.
 */
export async function flushAllDocumentCommits(
  engine: SpecFlowEngine,
  options: FlushAllOptions,
): Promise<FlushAllOutcome> {
  const clock = options.clock ?? systemQueueClock;
  const timers = options.timers ?? systemQueueTimers;
  const started = clock.monotonicMs();
  const checkouts = await checkoutsWithQueueWork(engine);
  const work = (async (): Promise<void> => {
    for (const checkout of checkouts) {
      const left = options.deadlineMs - (clock.monotonicMs() - started);
      if (left <= 0) return;
      await flushDocumentCommits(engine, checkout, { ...options, waitCapMs: left });
    }
  })();
  const outcome = await withDeadline(work, options.deadlineMs, timers);
  const remaining = (await listDocumentChangeJournals(engine.context)).filter(
    (journal) => journal.stage === 'queued' || journal.stage === 'committing',
  ).length;
  return { checkouts: checkouts.length, remaining, timedOut: outcome.kind === 'deadline' };
}

/** Refuses with `DOCUMENT_COMMITS_PENDING` when document journals still hold any of the checkouts. */
export async function assertNoDocumentCommitsHold(
  engine: SpecFlowEngine,
  workspaceIds: readonly string[],
): Promise<void> {
  for (const workspaceId of new Set(workspaceIds)) {
    const hold = await readCloseHold(engine, workspaceId);
    if (hold !== undefined) throw documentCommitsPendingError(hold);
  }
}

/**
 * Refuses with `DOCUMENT_COMMITS_PENDING` when the ledger still holds paths of one of the checkouts. A disk
 * read without Git (no prune), so Close can run it inside the control lock: a manual-mode save that lands
 * between the flush and the lock is seen here, not after a reservation that could only fail.
 */
export async function assertNoUncommittedHold(
  engine: SpecFlowEngine,
  workspaceIds: readonly string[],
): Promise<void> {
  for (const workspaceId of new Set(workspaceIds)) {
    const hold = await readUncommittedHold(engine, workspaceId);
    if (hold !== undefined) {
      throw documentCommitsPendingError({
        workspaceId,
        cause: 'commit-uncommitted',
        operationIds: hold.operationIds,
      });
    }
  }
}

/** Flushes every checkout that has queue work, one after the other (the Close preflight retry). */
export async function flushAllCheckouts(
  engine: SpecFlowEngine,
  options: FlushOptions = {},
): Promise<void> {
  for (const checkout of await checkoutsWithQueueWork(engine)) {
    await flushDocumentCommits(engine, checkout, options);
  }
}

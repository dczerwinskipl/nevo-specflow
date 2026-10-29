import { isDeepStrictEqual } from 'node:util';

import { foldPathKey } from '../../document-rules/document-paths';
import { DocumentError } from '../../document-rules/errors';
import { readPayload, withJournalLock } from '../../durable';
import {
  DOCUMENT_BATCH_RECORD_VERSION,
  encodeBatchPaths,
  mergeBatchPaths,
  parseDocumentBatchRecord,
  type DocumentBatchRecord,
  type DocumentChangeJournal,
  type DocumentQueueLease,
} from '../changes/journal';
import { DOCUMENT_CHANGE_JOURNAL_KIND } from '../changes/journal/kind';
import { isBarrierStage } from '../changes/journal/stages';
import { decodePlanWithEvidence } from '../changes/plan/codec';
import type { DocumentChangePlan } from '../changes/plan/model';
import { listDocumentChangeJournals, readDocumentChangeJournal } from '../write/journal-store';
import {
  DOCUMENT_BATCH_KIND,
  listDocumentBatches,
  publishDocumentBatch,
  readBatchPaths,
  removeDocumentBatch,
  transitionDocumentBatch,
  writeBatchPaths,
} from './batch-store';
import { formNextBatch, type QueuedOperation } from './formation';
import { judgeExecutor, readQueueLease, removeQueueLease, writeQueueLease } from './lease';
import type { QueueRuntime } from './runtime';
import { moveMember, reconcileBatchMembers } from './settlement';
import type { QueueIdleReason } from './types';

/** Operations that are saves wait for the settle period; every other action is structural. */
const SETTLING_ACTIONS: readonly string[] = ['save', 'save-all'];

/** How often a claim re-reads its inputs when they changed between the snapshot and the lock. */
const MAX_SNAPSHOT_ATTEMPTS = 5;

export type ClaimOutcome =
  | { readonly kind: 'idle'; readonly reason: QueueIdleReason; readonly waitMs?: number }
  | { readonly kind: 'busy' }
  | {
      readonly kind: 'claimed';
      readonly batch: DocumentBatchRecord;
      /** Taken over from an executor that stopped, not formed now. */
      readonly resumed: boolean;
    };

/** What the claim decides on, read WITHOUT the control lock and re-checked under it. */
interface ClaimSnapshot {
  readonly journals: readonly DocumentChangeJournal[];
  /** The batch records of this checkout. */
  readonly batches: readonly DocumentBatchRecord[];
  readonly lease: DocumentQueueLease | undefined;
  /** Plans of the `queued` and the barrier journals of this checkout; empty while an executor holds it. */
  readonly plans: ReadonlyMap<string, DocumentChangePlan>;
  /** `queued` operations whose plan cannot be read: each is failed alone (`plan-invalid`). */
  readonly unreadable: readonly DocumentChangeJournal[];
  /** A barrier (an operation still writing) whose plan cannot be read: its paths are unknown. */
  readonly barrierUnreadable: boolean;
  /** Checkout-relative paths (folded) of each `failed` and `recovery-required` batch. */
  readonly heldBatches: ReadonlyMap<string, ReadonlySet<string>>;
}

async function planOf(
  rt: QueueRuntime,
  journal: DocumentChangeJournal,
): Promise<DocumentChangePlan> {
  return decodePlanWithEvidence(
    await readPayload(rt.context, DOCUMENT_CHANGE_JOURNAL_KIND, journal.operationId, journal.plan),
    journal.plan,
  );
}

/**
 * Whether anything of this checkout needs the queue: a queued operation, an operation or a batch
 * mid-commit, or a lease. A lock-free read; it decides only whether a claim is worth trying.
 */
export async function hasQueueWork(rt: QueueRuntime): Promise<boolean> {
  const workspaceId = rt.checkout.workspaceId;
  const journals = await listDocumentChangeJournals(rt.context);
  if (
    journals.some(
      (journal) =>
        journal.workspaceId === workspaceId &&
        (journal.stage === 'queued' || journal.stage === 'committing'),
    )
  ) {
    return true;
  }

  const batches = await listDocumentBatches(rt.context);
  if (
    batches.some(
      (batch) =>
        batch.workspaceId === workspaceId &&
        batch.state !== 'failed' &&
        batch.state !== 'recovery-required',
    )
  ) {
    return true;
  }

  return (await readQueueLease(rt.context, workspaceId)) !== undefined;
}

async function takeSnapshot(rt: QueueRuntime): Promise<ClaimSnapshot> {
  const { context } = rt;
  const workspaceId = rt.checkout.workspaceId;
  const journals = await listDocumentChangeJournals(context);
  const batches = (await listDocumentBatches(context)).filter(
    (batch) => batch.workspaceId === workspaceId,
  );
  const lease = await readQueueLease(context, workspaceId);
  const plans = new Map<string, DocumentChangePlan>();
  const heldBatches = new Map<string, Set<string>>();
  const unreadable: DocumentChangeJournal[] = [];
  let barrierUnreadable = false;
  const executorKnown =
    lease !== undefined || batches.some((batch) => batch.state === 'committing');
  if (!executorKnown) {
    for (const journal of journals) {
      if (journal.workspaceId !== workspaceId) {
        continue;
      }

      const queued = journal.stage === 'queued' && journal.commit !== undefined;
      if (queued || isBarrierStage(journal.stage, journal.recoveryPhase)) {
        try {
          plans.set(journal.operationId, await planOf(rt, journal));
        } catch (error) {
          // One operation with a missing or damaged plan must not wedge the checkout.
          if (!(error instanceof DocumentError)) {
            throw error;
          }

          if (queued) {
            unreadable.push(journal);
          } else {
            barrierUnreadable = true;
          }
        }
      }
    }

    for (const batch of batches) {
      if (batch.state !== 'failed' && batch.state !== 'recovery-required') {
        continue;
      }

      heldBatches.set(
        batch.operationId,
        new Set((await readBatchPaths(context, batch)).map((entry) => foldPathKey(entry.path))),
      );
    }
  }

  return { journals, batches, lease, plans, unreadable, barrierUnreadable, heldBatches };
}

/**
 * Whether what the snapshot read is still what is stored. Called under the control lock: the
 * journal files (no payload, no plan) are read again and compared whole, so any change of a journal's state,
 * an executor, a sequence or a new operation makes the snapshot stale.
 */
async function snapshotIsCurrent(rt: QueueRuntime, snapshot: ClaimSnapshot): Promise<boolean> {
  const { context } = rt;
  const workspaceId = rt.checkout.workspaceId;
  const byId = (a: { operationId: string }, b: { operationId: string }): number =>
    a.operationId < b.operationId ? -1 : a.operationId > b.operationId ? 1 : 0;
  const journals = [...(await listDocumentChangeJournals(context))].sort(byId);
  if (!isDeepStrictEqual(journals, [...snapshot.journals].sort(byId))) {
    return false;
  }

  const batches = (await listDocumentBatches(context))
    .filter((batch) => batch.workspaceId === workspaceId)
    .sort(byId);
  if (!isDeepStrictEqual(batches, [...snapshot.batches].sort(byId))) {
    return false;
  }

  return isDeepStrictEqual(await readQueueLease(context, workspaceId), snapshot.lease);
}

/**
 * THE CLAIM (ADR 0016 decisions 5, 6 and 14). The inputs are read without the control lock; the
 * claim itself is a short section under it that checks the inputs are still current (otherwise it
 * reads them again), decides on them and writes the three records that make the claim. No Git runs
 * inside it.
 *
 * 1. A lease or a `committing` batch of an executor that may still run: `busy`. One that is
 *    provably gone (the dead proof, an idle thread of this process, or an operator assertion) is
 *    taken over: batches in a terminal state are reconciled (their members follow the record), a
 *    `committing` batch is RESUMED by this executor.
 * 2. Otherwise the queued operations are formed into the next batch and claimed in this order, each
 *    step one atomic write: the path list (hash-addressed), the lease, the batch record
 *    (`committing`, with `parentHead` and the executor). The members follow, one short lock section
 *    each (`queued` -> `committing`); a stop between two writes is finished by the next run's resume.
 *    A reservation of an overlapping path is refused from the moment the batch record exists.
 *
 * `parentHead` is the HEAD read immediately BEFORE the claim (so the control lock never waits for
 * Git). `findByOperation` needs only an ancestor of the commit, which that HEAD is.
 */
export async function claimNextBatch(
  rt: QueueRuntime,
  parentHead: () => Promise<string | undefined>,
): Promise<ClaimOutcome> {
  const head = await parentHead();
  let outcome: ClaimLockedOutcome = { kind: 'stale' };
  for (let attempt = 1; outcome.kind === 'stale'; attempt += 1) {
    const lastChance = attempt >= MAX_SNAPSHOT_ATTEMPTS;
    let snapshot: ClaimSnapshot | undefined;
    if (!lastChance) {
      try {
        snapshot = await takeSnapshot(rt);
      } catch (error) {
        // A plan file removed while it was read: the journal settled meanwhile. Read again.
        if (!(error instanceof DocumentError)) {
          throw error;
        }
      }

      await rt.hooks.afterSnapshot?.();
    }

    const taken = snapshot;
    outcome = await withJournalLock(rt.context, DOCUMENT_BATCH_KIND, async () => {
      // The last chance reads the inputs under the lock, where nothing can change them.
      const current = taken ?? (await takeSnapshot(rt));
      if (taken !== undefined && !(await snapshotIsCurrent(rt, taken))) {
        return { kind: 'stale' } as const;
      }

      return claimLocked(rt, head, current);
    });
  }

  if (outcome.kind === 'claimed') {
    await claimQueuedMembers(rt, outcome.batch);
  }

  return outcome;
}

type ClaimLockedOutcome = ClaimOutcome | { readonly kind: 'stale' };

async function claimLocked(
  rt: QueueRuntime,
  head: string | undefined,
  snapshot: ClaimSnapshot,
): Promise<ClaimLockedOutcome> {
  const { context, checkout, hooks } = rt;
  const workspaceId = checkout.workspaceId;
  const now = rt.nowIso();
  const own = await rt.executor();
  const { batches, lease } = snapshot;
  const running = batches.find((batch) => batch.state === 'committing');

  // 1. An executor that may still run keeps the checkout.
  const recorded = lease?.executor ?? running?.executor;
  if (recorded !== undefined) {
    const verdict = await judgeExecutor(recorded, own, {
      // A concurrent run of this process was excluded by the caller before the claim.
      activeInProcess: false,
      confirmStopped: rt.options.confirmExecutorStopped === true,
      table: rt.table,
    });
    if (verdict.kind === 'held') {
      return { kind: 'busy' };
    }
  }

  // No executor runs now (none recorded, or the one recorded is gone). Batches that an earlier
  // executor finished or left: their members follow the record, whether or not a lease is left.
  let touched = lease !== undefined;
  for (const batch of batches) {
    if (batch.state === 'committing') {
      continue;
    }

    if ((await reconcileBatchMembers(context, batch, now)) > 0) {
      touched = true;
    }

    if (batch.state === 'committed' || batch.state === 'dissolved' || batch.state === 'formed') {
      await removeDocumentBatch(context, batch.operationId);
      touched = true;
    }
  }

  if (running !== undefined) {
    // Resume: this executor owns the record and the lease now, and finishes the claim.
    const mine = parseDocumentBatchRecord(
      context,
      { ...running, executor: own, updatedAt: now },
      running.operationId,
    );
    await publishDocumentBatch(context, mine);
    await hooks.inResumeAfterRecord?.();
    await writeQueueLease(context, {
      workspaceId,
      executor: own,
      batchId: mine.operationId,
      acquiredAt: now,
    });

    return { kind: 'claimed', batch: mine, resumed: true };
  }

  if (lease !== undefined) {
    await removeQueueLease(context, workspaceId);
  }

  // What was reconciled changed the inputs: decide again on a fresh reading.
  if (touched) {
    return { kind: 'stale' };
  }

  // An operation whose plan cannot be read is failed alone (the operator abandons or retries it).
  if (snapshot.unreadable.length > 0) {
    for (const journal of snapshot.unreadable) {
      await moveMember(context, journal, 'commit-failed', { reason: 'plan-invalid' }, now);
    }

    return { kind: 'stale' };
  }

  // 2. Form the next batch.
  const { journals } = snapshot;
  const mine = journals.filter((journal) => journal.workspaceId === workspaceId);
  const queuedJournals = mine.filter(
    (journal) => journal.stage === 'queued' && journal.commit !== undefined,
  );
  if (queuedJournals.length === 0) {
    return { kind: 'idle', reason: 'no-queued-operations' };
  }

  if (head === undefined) {
    return { kind: 'idle', reason: 'no-commits' };
  }

  // A barrier whose paths are unknown could overlap anything: nothing is claimed until it is resolved.
  if (snapshot.barrierUnreadable) {
    return { kind: 'idle', reason: 'blocked' };
  }

  rt.ledger.retain(
    new Set(journals.filter((journal) => journal.stage === 'queued').map((j) => j.operationId)),
  );
  const queued: QueuedOperation[] = queuedJournals.map((journal) => ({
    operationId: journal.operationId,
    sequence: journal.sequence,
    specId: journal.specId,
    branch: journal.commit!.branch,
    structural: !SETTLING_ACTIONS.includes(journal.action),
    paths: snapshot.plans.get(journal.operationId)!.paths.map((entry) => entry.path),
    queuedMonoMs: rt.ledger.observe(
      journal.operationId,
      journal.queuedAt ?? journal.updatedAt,
      rt.clock,
    ),
    ...(journal.nextAttemptAt !== undefined
      ? { notBeforeWallMs: Date.parse(journal.nextAttemptAt) }
      : {}),
  }));
  const barrierPaths = new Set<string>();
  for (const journal of mine) {
    if (!isBarrierStage(journal.stage, journal.recoveryPhase)) {
      continue;
    }

    for (const entry of snapshot.plans.get(journal.operationId)!.paths) {
      barrierPaths.add(foldPathKey(entry.path));
    }
  }

  // A failed batch yields to a new operation that overlaps it on the same branch (ADR 0016 decision
  // 13): the batch is dissolved, its members are queued again with the attempt counter reset, and the
  // next reading forms one batch of all of them with the new write folded in. On another branch the
  // new operation cannot join, so the failed batch stays.
  let dissolvedAny = false;
  for (const batch of batches) {
    const held = batch.state === 'failed' ? snapshot.heldBatches.get(batch.operationId) : undefined;
    if (held === undefined) {
      continue;
    }

    const joins = queued.some(
      (operation) =>
        operation.branch === batch.branch &&
        operation.paths.some((path) => held.has(foldPathKey(path))),
    );
    if (!joins) {
      continue;
    }

    const dissolved = transitionDocumentBatch(context, batch, 'dissolved', {}, now);
    await publishDocumentBatch(context, dissolved);
    await reconcileBatchMembers(context, dissolved, now);
    await removeDocumentBatch(context, batch.operationId);
    dissolvedAny = true;
  }

  if (dissolvedAny) {
    return { kind: 'stale' };
  }

  const heldPaths = new Set([...snapshot.heldBatches.values()].flatMap((paths) => [...paths]));

  const decision = formNextBatch({
    queued,
    barrierPaths,
    heldPaths,
    nowMonoMs: rt.clock.monotonicMs(),
    nowWallMs: rt.clock.wallMs(),
    settleMs: rt.settleMs,
    maxHoldMs: rt.maxHoldMs,
    ...(rt.options.flush === true ? { flush: true } : {}),
    ...(rt.options.specId !== undefined ? { onlySpecId: rt.options.specId } : {}),
  });
  if (decision.kind === 'none') {
    return decision.retryAfterMs !== undefined
      ? { kind: 'idle', reason: 'backoff', waitMs: Math.ceil(decision.retryAfterMs) }
      : { kind: 'idle', reason: 'blocked' };
  }

  if (decision.kind === 'wait') {
    return { kind: 'idle', reason: 'settling', waitMs: Math.ceil(decision.waitMs) };
  }

  const formed = decision.batch;
  // A batch id is its first member's operation id. A record under that id that is not finished is
  // never overwritten (its members would be orphaned).
  const existing = batches.find((batch) => batch.operationId === formed.batchId);
  if (existing !== undefined) {
    if (
      existing.state !== 'committed' &&
      existing.state !== 'dissolved' &&
      existing.state !== 'formed'
    ) {
      return { kind: 'idle', reason: 'batch-id-collision' };
    }

    // A finished record that was not cleaned up: its work is done, the id is free again.
    await removeDocumentBatch(context, existing.operationId);
  }

  const first = queuedJournals.find((journal) => journal.operationId === formed.batchId)!;
  const memberPlans = formed.members.map((member) => snapshot.plans.get(member.operationId)!);
  const encoded = encodeBatchPaths(mergeBatchPaths(memberPlans));
  // The counter of a batch is its freshest member: a new save that joins a batch of members that
  // already failed gets its own full set of attempts.
  const attempts = Math.min(
    ...queuedJournals
      .filter((journal) =>
        formed.members.some((member) => member.operationId === journal.operationId),
      )
      .map((journal) => journal.attempts),
  );
  await writeBatchPaths(context, formed.batchId, encoded);
  await writeQueueLease(context, {
    workspaceId,
    executor: own,
    batchId: formed.batchId,
    acquiredAt: now,
  });
  await hooks.inClaimAfterLease?.();

  const record = parseDocumentBatchRecord(
    context,
    {
      version: DOCUMENT_BATCH_RECORD_VERSION,
      projectId: context.project.projectId,
      operationId: formed.batchId,
      workspaceId,
      workspaceRoot: first.workspaceRoot,
      specId: formed.specId,
      slug: first.slug,
      state: 'committing',
      memberIds: formed.members.map((member) => member.operationId),
      paths: { sha256: encoded.sha256, bytes: encoded.bytes, pathCount: encoded.pathCount },
      branch: formed.branch,
      parentHead: head,
      createdAt: now,
      updatedAt: now,
      attempts,
      executor: own,
    },
    formed.batchId,
  );
  await publishDocumentBatch(context, record);
  await hooks.inClaimAfterRecord?.();

  return { kind: 'claimed', batch: record, resumed: false };
}

/**
 * Moves the members of a freshly claimed (or resumed) batch from `queued` to `committing`, one short
 * control-lock section each, so reservations are not held back by a long batch. The batch record is
 * written first and already refuses overlapping reservations; a stop in between is finished by the
 * next run, which reads the same record.
 */
export async function claimQueuedMembers(
  rt: QueueRuntime,
  batch: DocumentBatchRecord,
): Promise<void> {
  let claimed = 0;
  for (const id of batch.memberIds) {
    const moved = await withJournalLock(rt.context, DOCUMENT_BATCH_KIND, async () => {
      const journal = await readDocumentChangeJournal(rt.context, id);
      if (journal?.stage !== 'queued') {
        return false;
      }

      await moveMember(
        rt.context,
        journal,
        'committing',
        { batchId: batch.operationId },
        rt.nowIso(),
      );

      return true;
    });
    if (moved) {
      claimed += 1;
      await rt.hooks.afterMemberClaimed?.(claimed);
    }
  }
}

import type { SpecFlowEngine } from '../../../application';
import { withJournalLock } from '../../durable';
import { findManualCommitJournal } from '../../manual-commit';
import { documentChangeError } from '../changes/errors';
import type { DocumentBatchRecord, DocumentChangeJournal } from '../changes/journal';
import {
  findDocumentChangeJournal,
  readDocumentChangeJournal,
  settleDocumentChangeJournal,
} from '../write/journal-store';
import { abandonCommit, isAbandonedJournal } from './abandon';
import {
  DOCUMENT_BATCH_KIND,
  publishDocumentBatch,
  readBatchPaths,
  readDocumentBatch,
  removeDocumentBatch,
  transitionDocumentBatch,
} from './batch-store';
import { lookUpBatchCommit } from './evidence';
import { inspectBatch } from './inspect';
import { removeQueueLeaseOf } from './lease';
import { createQueueRuntime, type QueueRuntime } from './runtime';
import { moveMember, reconcileBatchMembers } from './settlement';
import type { QueueDependencies, QueueOptions } from './types';
import { headHoldsWholeBatch } from './verify';

/**
 * The actions of a person or tool on the queue, as Engine functions (the CLI and the routes call
 * them). Each is one or two short control-lock sections; the batch record moves first (the commit
 * point) and its members follow, so a stop in between is finished by the next claim.
 */

async function journalOf(rt: QueueRuntime, operationId: string): Promise<DocumentChangeJournal> {
  // Settled operations are found too: a repeated action reports where the operation ended.
  const journal = await findDocumentChangeJournal(rt.context, operationId);
  if (journal === undefined) {
    // A manual commit is resolved by `recover`, never by retry or abandon of a document commit.
    if ((await findManualCommitJournal(rt.context, operationId)) !== undefined) {
      throw documentChangeError(
        'operation-state-invalid',
        'A manual commit is not a document commit; recover it instead.',
      );
    }
    throw documentChangeError('operation-not-found', 'The document operation does not exist.');
  }
  return journal;
}

function runtimeFor(
  engine: SpecFlowEngine,
  journal: DocumentChangeJournal,
  deps: QueueDependencies,
  options: QueueOptions,
): QueueRuntime {
  return createQueueRuntime(
    engine,
    deps,
    { workspaceId: journal.workspaceId, root: journal.workspaceRoot },
    options,
  );
}

/**
 * `retry`: dissolves the failed batch of a `commit-failed` operation. Its members (every operation of
 * that batch) go back to `queued` with the attempt counter reset, and the next pass forms and
 * commits a batch again. An operation without a batch (the checkout was gone) is simply queued again.
 */
export async function retryDocumentCommit(
  engine: SpecFlowEngine,
  operationId: string,
  deps: QueueDependencies = {},
  options: QueueOptions = {},
): Promise<readonly DocumentChangeJournal[]> {
  const rt = runtimeFor(engine, await probe(engine, operationId), deps, options);
  return withJournalLock(rt.context, DOCUMENT_BATCH_KIND, async () => {
    const journal = await journalOf(rt, operationId);
    // A repeat finds the operation on its way already: that is the answer.
    if (journal.stage === 'queued' || journal.stage === 'committing') return [journal];
    if (journal.stage === 'completed' && journal.outcome === 'committed') return [journal];
    if (journal.stage !== 'commit-failed') {
      throw documentChangeError(
        'operation-state-invalid',
        'Only an operation whose commit failed can be retried.',
      );
    }
    const now = rt.nowIso();
    const batch =
      journal.batchId !== undefined
        ? await readDocumentBatch(rt.context, journal.batchId)
        : undefined;
    if (batch?.state === 'failed') {
      const dissolved = transitionDocumentBatch(rt.context, batch, 'dissolved', {}, now);
      await publishDocumentBatch(rt.context, dissolved);
      await reconcileBatchMembers(rt.context, dissolved, now);
      await removeDocumentBatch(rt.context, batch.operationId);
      return membersOf(rt, batch);
    }
    await moveMember(rt.context, journal, 'queued', { attempts: 0 }, now);
    return [await journalOf(rt, operationId)];
  });
}

/** The journal of an operation, read only to learn its checkout. */
async function probe(engine: SpecFlowEngine, operationId: string): Promise<DocumentChangeJournal> {
  const rt = createQueueRuntime(
    engine,
    {},
    { workspaceId: engine.workspace.workspaceId, root: engine.workspace.root },
    {},
  );
  return journalOf(rt, operationId);
}

async function membersOf(
  rt: QueueRuntime,
  batch: DocumentBatchRecord,
): Promise<DocumentChangeJournal[]> {
  const journals: DocumentChangeJournal[] = [];
  for (const id of batch.memberIds) {
    const journal = await readDocumentChangeJournal(rt.context, id);
    if (journal !== undefined) journals.push(journal);
  }
  return journals;
}

/** `abandon`: the files stay on disk and the operations end uncommitted, recorded in the ledger (see `abandon.ts`). */
export async function abandonDocumentCommit(
  engine: SpecFlowEngine,
  operationId: string,
  deps: QueueDependencies = {},
  options: QueueOptions = {},
): Promise<readonly DocumentChangeJournal[]> {
  const rt = runtimeFor(engine, await probe(engine, operationId), deps, options);
  return abandonCommit(rt.context, operationId, () => rt.nowIso(), rt.hooks);
}

/** How `recover` resolves an operation that needs recovery (`recovery-required`, commit phase). */
export type RecoverMode =
  /** Look the commit up; commit again only when nothing was committed. */
  | 'resume'
  /** Accept a commit that holds every path (a hand commit, an amended one). */
  | 'adopt'
  /** Keep the files, end uncommitted (recorded in the ledger). */
  | 'abandon';

async function recoveryBatch(
  rt: QueueRuntime,
  journal: DocumentChangeJournal,
): Promise<DocumentBatchRecord> {
  if (journal.stage !== 'recovery-required' || journal.recoveryPhase !== 'commit') {
    throw documentChangeError(
      'operation-state-invalid',
      'Only a commit that needs recovery can be recovered.',
    );
  }
  const batch =
    journal.batchId !== undefined
      ? await readDocumentBatch(rt.context, journal.batchId)
      : undefined;
  if (batch?.state !== 'recovery-required') {
    throw documentChangeError('journal-corrupt', 'The batch of the operation is missing.');
  }
  return batch;
}

function unresolved(): Error {
  return documentChangeError(
    'recovery-unresolved',
    'The repository does not show whether this batch was committed; adopt a commit or abandon it.',
  );
}

/**
 * `recover <operation> --resume|--adopt|--abandon` for an operation in `recovery-required` (commit
 * phase), together with its batch.
 *
 * - `resume`: a commit that carries the batch's trailer AND holds every path completes the members.
 *   Otherwise, if HEAD holds the whole batch (an identical hand commit) it completes with that
 *   commit; if nothing of the batch is committed and no path was edited by someone else, the members
 *   go back to `queued` (history that was rewritten does not matter then); anything else is
 *   `recovery-unresolved`.
 * - `adopt`: HEAD must hold the recorded content of every path (per-path inspection); the members
 *   complete with the commit that last touched them.
 * - `abandon`: as `abandon`.
 *
 * The operator assertion that an executor whose lease cannot be proven dead has stopped is
 * `QueueOptions.confirmExecutorStopped`, passed to `runQueueOnce` / `drainQueue` (the scheduler task
 * exposes it as the recover command's `--confirmed-stopped`).
 */
export async function recoverDocumentOperation(
  engine: SpecFlowEngine,
  operationId: string,
  mode: RecoverMode,
  deps: QueueDependencies = {},
  options: QueueOptions = {},
): Promise<readonly DocumentChangeJournal[]> {
  const rt = runtimeFor(engine, await probe(engine, operationId), deps, options);
  const journal = await journalOf(rt, operationId);
  // A repeat of the same recovery finds the operation where it ended up.
  if (mode === 'abandon' && isAbandonedJournal(journal)) return [journal];
  if (mode !== 'abandon' && journal.stage === 'completed' && journal.outcome === 'committed') {
    return [journal];
  }
  if (mode === 'resume' && journal.stage === 'queued') return [journal];
  const batch = await recoveryBatch(rt, journal);
  if (mode === 'abandon') {
    return abandonCommit(rt.context, operationId, () => rt.nowIso(), rt.hooks);
  }

  const expectations = await readBatchPaths(rt.context, batch);
  const whole = async (): Promise<boolean> =>
    headHoldsWholeBatch(rt.commits, rt.checkout.root, expectations);
  if (mode === 'adopt') {
    if (!(await whole())) throw unresolved();
    return finishCommitted(
      rt,
      batch,
      await adoptedSha(
        rt,
        expectations.map((entry) => entry.path),
      ),
    );
  }

  const evidence = await lookUpBatchCommit(rt, batch, expectations);
  if (evidence.kind === 'committed') return finishCommitted(rt, batch, evidence.sha);
  if (evidence.kind === 'foreign-commit') throw unresolved();
  if (await whole()) {
    return finishCommitted(
      rt,
      batch,
      await adoptedSha(
        rt,
        expectations.map((entry) => entry.path),
      ),
    );
  }
  const split = await rt.commits.effectivePaths(
    rt.checkout.root,
    expectations.map((entry) => entry.path),
  );
  const states = (await inspectBatch(rt.checkout.root, expectations, split.facts)).map(
    (entry) => entry.state,
  );
  if (!states.every((state) => state === 'at-pre' || state === 'at-post')) throw unresolved();
  return requeue(rt, batch);
}

/** The commit that last touched the paths when they are all committed together, otherwise HEAD. */
async function adoptedSha(rt: QueueRuntime, paths: readonly string[]): Promise<string> {
  const state = await rt.commits.inspectPaths(rt.checkout.root, paths);
  if (state.state === 'committed') return state.sha;
  const head = await rt.commits.head(rt.checkout.root);
  if (head === undefined) throw unresolved();
  return head;
}

async function finishCommitted(
  rt: QueueRuntime,
  batch: DocumentBatchRecord,
  sha: string,
): Promise<readonly DocumentChangeJournal[]> {
  const completed = await withJournalLock(rt.context, DOCUMENT_BATCH_KIND, async () => {
    const current = await readDocumentBatch(rt.context, batch.operationId);
    if (current?.state !== 'recovery-required') {
      throw documentChangeError('operation-state-invalid', 'The document batch moved.');
    }
    const now = rt.nowIso();
    const committed = transitionDocumentBatch(rt.context, current, 'committed', { sha }, now);
    await publishDocumentBatch(rt.context, committed);
    await reconcileBatchMembers(rt.context, committed, now);
    return committed;
  });
  const members = await membersOf(rt, completed);
  for (const member of members) {
    if (member.stage === 'completed')
      await settleDocumentChangeJournal(rt.context, member.operationId);
  }
  await withJournalLock(rt.context, DOCUMENT_BATCH_KIND, async () => {
    await removeDocumentBatch(rt.context, completed.operationId);
    await removeQueueLeaseOf(rt.context, completed.workspaceId, completed.operationId).catch(
      () => undefined,
    );
  });
  return members;
}

async function requeue(
  rt: QueueRuntime,
  batch: DocumentBatchRecord,
): Promise<readonly DocumentChangeJournal[]> {
  return withJournalLock(rt.context, DOCUMENT_BATCH_KIND, async () => {
    const current = await readDocumentBatch(rt.context, batch.operationId);
    if (current?.state !== 'recovery-required') {
      throw documentChangeError('operation-state-invalid', 'The document batch moved.');
    }
    const now = rt.nowIso();
    const dissolved = transitionDocumentBatch(rt.context, current, 'dissolved', {}, now);
    await publishDocumentBatch(rt.context, dissolved);
    await reconcileBatchMembers(rt.context, dissolved, now);
    await removeDocumentBatch(rt.context, current.operationId);
    return membersOf(rt, current);
  });
}

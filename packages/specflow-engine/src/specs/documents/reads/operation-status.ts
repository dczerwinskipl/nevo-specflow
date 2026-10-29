import type {
  Action,
  CommitInfo,
  DocumentExecutorHint,
  DocumentOperationAvailableActions,
  DocumentOperationStatus,
} from '@nevo/specflow-contracts/documents';

import type { SpecFlowEngine } from '../../../application';
import { OPERATION_ID_PATTERN, readPayload, readRecordTolerant } from '../../durable';
import { commitInfoOfJournal } from '../changes/commit-info';
import { documentChangeError } from '../changes/errors';
import type { DocumentBatchRecord } from '../changes/journal/batch';
import { DOCUMENT_CHANGE_JOURNAL_KIND } from '../changes/journal/kind';
import { isWriterStage } from '../changes/journal/stages';
import type { DocumentChangeJournal, ExecutorIdentity } from '../changes/journal/model';
import { decodePlanWithEvidence } from '../changes/plan/codec';
import { DOCUMENT_BATCH_KIND } from '../queue/batch-store';
import {
  captureExecutorIdentity,
  nodeProcessTable,
  proveExecutorState,
} from '../write/executor-identity';
import { readSettledDocumentChangeJournal } from '../write/journal-store';
import { DocumentError } from '../../document-rules/errors';
import { readManualCommitStatus } from '../../manual-commit/reads';
import { writerHint, type CommitReadOptions } from './commit-reader';

export interface OperationStatusOptions extends CommitReadOptions {
  /** The Specification the route names: an operation of another one does not exist for the caller. */
  readonly specId?: string;
}

const NO: Action = { available: false };
const YES: Action = { available: true };

/**
 * `GET .../document-operations/:operationId`. The active journal when there is one, otherwise the
 * settled record for the retention window (24 hours); anything else is
 * `DOCUMENT_OPERATION_NOT_FOUND`. Takes no lock and starts no Git process: the commit state is the
 * one the journal and its batch record show now. A corrupt record is `DOCUMENT_RECOVERY_REQUIRED`
 * (`journal-corrupt`), never a guess.
 */
export async function readDocumentOperationStatus(
  engine: SpecFlowEngine,
  operationId: string,
  options: OperationStatusOptions = {},
): Promise<DocumentOperationStatus> {
  if (!OPERATION_ID_PATTERN.test(operationId)) throw notFound();
  const journal = await findJournal(engine, operationId);
  if (journal === undefined) {
    // A manual commit (ADR 0018) is a document operation of the Specification it addressed.
    const manual = await readManualCommitStatus(engine.context, operationId, {
      ...(options.specId !== undefined ? { specId: options.specId } : {}),
      ...(options.processTable !== undefined ? { processTable: options.processTable } : {}),
    });
    if (manual !== undefined) return manual;
    throw notFound();
  }
  if (options.specId !== undefined && journal.specId !== options.specId) throw notFound();

  const now = (options.now ?? Date.now)();
  const batch =
    journal.batchId === undefined
      ? undefined
      : await readBatch(engine, journal.batchId).catch(() => undefined);
  const active = isOpen(journal);
  const executor = active ? await executorHint(journal, batch, options) : undefined;

  let commit = commitInfoOfJournal(journal, now);
  if (executor?.state === 'dead' && isWriting(journal)) {
    // The writer is provably gone: nothing will finish this write by itself.
    commit = {
      state: 'failed',
      reason: 'write-interrupted',
      recoveryRequired: true,
      ...(commit.batchId !== undefined ? { batchId: commit.batchId } : {}),
    } satisfies CommitInfo;
  }

  const documentIds = await documentIdsOf(engine, journal);
  return {
    operationId: journal.operationId,
    specId: journal.specId,
    action: journal.action,
    documentIds,
    createdAt: journal.createdAt,
    commit: withSharedCount(commit, batch),
    stage: journal.stage,
    updatedAt: journal.settledAt ?? journal.updatedAt,
    ...(batch !== undefined && batch.memberIds.length > 0
      ? { batchMembers: [...batch.memberIds] }
      : {}),
    ...(executor !== undefined ? { executor } : {}),
    actions: actionsOf(journal, executor),
  };
}

function notFound(): Error {
  return documentChangeError('operation-not-found', 'The document operation does not exist.');
}

/** Whether the journal is in the active directory's life (not completed or refused). */
function isOpen(journal: DocumentChangeJournal): boolean {
  return journal.stage !== 'completed' && journal.stage !== 'failed';
}

function isWriting(journal: DocumentChangeJournal): boolean {
  return isWriterStage(journal.stage);
}

async function findJournal(
  engine: SpecFlowEngine,
  operationId: string,
): Promise<DocumentChangeJournal | undefined> {
  const row = await readRecordTolerant(engine.context, DOCUMENT_CHANGE_JOURNAL_KIND, operationId);
  if (row?.kind === 'record') return row.record;
  if (row !== undefined) {
    throw documentChangeError('journal-corrupt', 'The document operation record is unreadable.');
  }
  try {
    return await readSettledDocumentChangeJournal(engine.context, operationId);
  } catch (error) {
    if (error instanceof DocumentError) {
      throw documentChangeError('journal-corrupt', 'The document operation record is unreadable.');
    }
    throw error;
  }
}

async function readBatch(
  engine: SpecFlowEngine,
  batchId: string,
): Promise<DocumentBatchRecord | undefined> {
  const row = await readRecordTolerant(engine.context, DOCUMENT_BATCH_KIND, batchId);
  return row?.kind === 'record' ? row.record : undefined;
}

/** The members that share the commit: the batch's, else the count the journal kept. */
function withSharedCount(commit: CommitInfo, batch: DocumentBatchRecord | undefined): CommitInfo {
  if (commit.coalescedWith !== undefined || batch === undefined) return commit;
  return { ...commit, coalescedWith: Math.max(0, batch.memberIds.length - 1) };
}

async function executorHint(
  journal: DocumentChangeJournal,
  batch: DocumentBatchRecord | undefined,
  options: CommitReadOptions,
): Promise<DocumentExecutorHint | undefined> {
  const recorded: ExecutorIdentity | undefined = isWriting(journal)
    ? journal.executor
    : journal.stage === 'committing' || journal.stage === 'recovery-required'
      ? batch?.executor
      : undefined;
  if (recorded === undefined) return undefined;
  const table = options.processTable ?? nodeProcessTable;
  const state = writerHint(
    await proveExecutorState(recorded, await captureExecutorIdentity(table), table),
  );
  return { state };
}

/** What a person can do now; `retry` and `abandon` answer the HTTP routes, `recover` the operator's CLI. */
function actionsOf(
  journal: DocumentChangeJournal,
  executor: DocumentExecutorHint | undefined,
): DocumentOperationAvailableActions {
  const failed = journal.stage === 'commit-failed';
  return {
    retry: failed ? YES : NO,
    abandon: failed ? YES : NO,
    recover:
      journal.stage === 'recovery-required' || (isWriting(journal) && executor?.state === 'dead')
        ? YES
        : NO,
  };
}

/** Ids of the documents the operation writes, creates or removes (from its plan, while the plan file exists). */
async function documentIdsOf(
  engine: SpecFlowEngine,
  journal: DocumentChangeJournal,
): Promise<string[]> {
  try {
    const plan = decodePlanWithEvidence(
      await readPayload(
        engine.context,
        DOCUMENT_CHANGE_JOURNAL_KIND,
        journal.operationId,
        journal.plan,
      ),
      journal.plan,
    );
    return [...new Set([...plan.documents.map((entry) => entry.id), ...plan.removedDocumentIds])];
  } catch (error) {
    // The plan file is gone (retention) or damaged: the status still answers, without the ids.
    if (error instanceof DocumentError) return [];
    throw error;
  }
}

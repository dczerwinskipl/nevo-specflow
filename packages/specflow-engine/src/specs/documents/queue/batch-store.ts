import { join } from 'node:path';

import { removeFileWindowsSafe } from '../../../project/fs/windows-safe-fs';
import type { ResolvedProjectHome } from '../../../project/home/home';
import {
  isMissing,
  journalDirectory,
  listJournals,
  publishJournal,
  readJournal,
  readPayload,
  removePayload,
  validateJournalOperationId,
  writePayload,
  type JournalKind,
} from '../../durable';
import { documentChangeError } from '../changes/errors';
import {
  DOCUMENT_BATCH_RECORD_VERSION,
  DOCUMENT_BATCH_RELATIVE_DIR,
  canTransitionDocumentBatch,
  decodeBatchPaths,
  invalidBatchRecord,
  parseDocumentBatchRecord,
  type BatchPathExpectation,
  type DocumentBatchRecord,
  type DocumentBatchState,
  type EncodedBatchPaths,
  type ExecutorIdentity,
} from '../changes/journal';
import {
  DOCUMENT_BATCH_RECORD_MAX_BYTES,
  DOCUMENT_JOURNAL_LISTING_MAX_FILES,
} from '../changes/limits';
import type { BatchPathView } from '../write/reservation-guard';
import type { BatchViewProvider } from '../write/writer-types';

/**
 * The batch record as one kind of the generic durable core: records live in
 * `engine/operations/documents/batches/<batchId>.json`, the hash-addressed path list of a batch in
 * `<batchId>.payload/` next to it. Files that are not batch records (stage files, other versions,
 * other names) are ignored by the listing; a corrupt current-format record fails closed.
 */
export const DOCUMENT_BATCH_KIND: JournalKind<DocumentBatchRecord> = {
  name: 'document-batch',
  label: 'Document batch',
  relativeDir: DOCUMENT_BATCH_RELATIVE_DIR,
  version: DOCUMENT_BATCH_RECORD_VERSION,
  maxBytes: DOCUMENT_BATCH_RECORD_MAX_BYTES,
  listingMaxFiles: DOCUMENT_JOURNAL_LISTING_MAX_FILES,
  parse: (context, value, batchId) => parseDocumentBatchRecord(context, value, batchId),
  isSettled: (record) => record.state === 'committed' || record.state === 'dissolved',
  errors: {
    invalid: invalidBatchRecord,
    unsupported: invalidBatchRecord,
    invalidOperationId: () =>
      documentChangeError('operation-invalid', 'A UUID batch id is required.'),
    payloadUnprovable: (message) => documentChangeError('payload-unprovable', message),
  },
};

/** The current-format batch records of the Project Home (all checkouts). */
export function listDocumentBatches(
  context: ResolvedProjectHome,
): Promise<readonly DocumentBatchRecord[]> {
  return listJournals(context, DOCUMENT_BATCH_KIND);
}

export function readDocumentBatch(
  context: ResolvedProjectHome,
  batchId: string,
): Promise<DocumentBatchRecord | undefined> {
  return readJournal(context, DOCUMENT_BATCH_KIND, batchId);
}

/** Caller holds the control lock. Atomic: temp file, fsync, rename. */
export function publishDocumentBatch(
  context: ResolvedProjectHome,
  record: DocumentBatchRecord,
): Promise<void> {
  return publishJournal(context, DOCUMENT_BATCH_KIND, record);
}

/** Caller holds the control lock. Writes the path list (hash-addressed) BEFORE the record is published. */
export function writeBatchPaths(
  context: ResolvedProjectHome,
  batchId: string,
  encoded: EncodedBatchPaths,
): Promise<void> {
  return writePayload(context, DOCUMENT_BATCH_KIND, batchId, [
    { sha256: encoded.sha256, content: encoded.text },
  ]);
}

/** The verified path list of a batch (hash and size are checked against the record). */
export async function readBatchPaths(
  context: ResolvedProjectHome,
  record: DocumentBatchRecord,
): Promise<readonly BatchPathExpectation[]> {
  const text = await readPayload(context, DOCUMENT_BATCH_KIND, record.operationId, record.paths);
  const paths = decodeBatchPaths(text);
  if (paths.length !== record.paths.pathCount) {
    throw documentChangeError('plan-invalid', 'The batch path list does not match its record.');
  }

  return paths;
}

/** Caller holds the control lock. Removes the record, then its path list; absent is fine. */
export async function removeDocumentBatch(
  context: ResolvedProjectHome,
  batchId: string,
): Promise<void> {
  validateJournalOperationId(DOCUMENT_BATCH_KIND, batchId);
  const path = join(journalDirectory(context, DOCUMENT_BATCH_KIND), batchId + '.json');
  await removeFileWindowsSafe(path).catch((error: unknown) => {
    if (!isMissing(error)) {
      throw error;
    }
  });
  await removePayload(context, DOCUMENT_BATCH_KIND, batchId);
}

/** What a batch transition sets; everything a state does not keep is dropped. */
export interface DocumentBatchTransitionPatch {
  readonly executor?: ExecutorIdentity;
  readonly attempts?: number;
  readonly reason?: string;
  readonly blockedBy?: string;
  readonly sha?: string;
  readonly commitStartedAt?: string;
}

/**
 * The batch after moving to `to`: a pure function of the record, the state and the patch. An illegal
 * move, or a result the codec would not read, throws. `parentHead` and the member and path evidence
 * never change; `executor` lives only while `committing`, `sha` only once `committed`.
 */
export function transitionDocumentBatch(
  context: ResolvedProjectHome,
  record: DocumentBatchRecord,
  to: DocumentBatchState,
  patch: DocumentBatchTransitionPatch,
  now: string,
): DocumentBatchRecord {
  if (!canTransitionDocumentBatch(record.state, to)) {
    throw documentChangeError(
      'operation-state-invalid',
      `A document batch cannot move from ${record.state} to ${to}.`,
    );
  }

  const executor = to === 'committing' ? (patch.executor ?? record.executor) : undefined;
  const next: DocumentBatchRecord = {
    version: record.version,
    projectId: record.projectId,
    operationId: record.operationId,
    workspaceId: record.workspaceId,
    workspaceRoot: record.workspaceRoot,
    specId: record.specId,
    slug: record.slug,
    state: to,
    memberIds: record.memberIds,
    paths: record.paths,
    branch: record.branch,
    ...(record.parentHead !== undefined ? { parentHead: record.parentHead } : {}),
    ...(patch.commitStartedAt !== undefined
      ? { commitStartedAt: patch.commitStartedAt }
      : record.commitStartedAt !== undefined
        ? { commitStartedAt: record.commitStartedAt }
        : {}),
    createdAt: record.createdAt,
    updatedAt: now,
    attempts: patch.attempts ?? record.attempts,
    ...(patch.reason !== undefined ? { reason: patch.reason } : {}),
    ...(patch.blockedBy !== undefined ? { blockedBy: patch.blockedBy } : {}),
    ...(to === 'committed' && patch.sha !== undefined ? { sha: patch.sha } : {}),
    ...(executor !== undefined ? { executor } : {}),
  };

  return parseDocumentBatchRecord(context, next, record.operationId);
}

/** States whose paths the reservation guard and the formation must know about. */
const VISIBLE_STATES: readonly DocumentBatchState[] = [
  'formed',
  'committing',
  'failed',
  'recovery-required',
];

/**
 * The batches the writer's reservation guard consults: state and checkout-relative paths of every
 * batch that is `formed`, `committing`, `failed` or `recovery-required` in the checkout. Read-only
 * and lock-free (the reservation calls it while it holds the control lock); a Project Home that never
 * had a batch has no directory and answers an empty list.
 */
export const documentBatchViews: BatchViewProvider = {
  async list(context, workspaceId): Promise<readonly BatchPathView[]> {
    const views: BatchPathView[] = [];
    for (const record of await listDocumentBatches(context)) {
      if (record.workspaceId !== workspaceId || !VISIBLE_STATES.includes(record.state)) {
        continue;
      }

      const paths = await readBatchPaths(context, record);
      views.push({
        batchId: record.operationId,
        workspaceId: record.workspaceId,
        state: record.state,
        paths: new Set(paths.map((entry) => entry.path)),
      });
    }

    return views;
  },
};

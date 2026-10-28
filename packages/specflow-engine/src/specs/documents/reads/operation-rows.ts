import type { SpecFlowEngine } from '../../../application';
import { commitInfoOfJournal } from '../changes/commit-info';
import type { DocumentChangeJournal } from '../changes/journal/model';
import { DOCUMENT_CHANGE_STAGE_FACTS, isWriterStage } from '../changes/journal/stages';
import {
  captureExecutorIdentity,
  nodeProcessTable,
  proveExecutorState,
} from '../write/executor-identity';
import { listActiveDocumentOperations, writerHint, type CommitReadOptions } from './commit-reader';

/** A commit that waits longer than this after it was queued is listed (it may be stuck, or the Runtime may be gone). */
export const DOCUMENT_ROW_PENDING_AFTER_MS = 30_000;

/** Code of a row whose write was interrupted: the process that was writing is gone. */
export const DOCUMENT_WRITE_INTERRUPTED_CODE = 'OPERATION_INTERRUPTED';
/** Code of a row that needs recovery, or whose journal file cannot be read. */
export const DOCUMENT_RECOVERY_REQUIRED_CODE = 'DOCUMENT_RECOVERY_REQUIRED';

/**
 * A row of the document-change operation list (ADR 0014): the contract row (the fields of
 * `OperationSummary` that a document change fills; a Runtime test pins the correspondence) plus the source `state` the list service judges
 * by. Paths are never part of a row. A document change is NEVER judged by the idle-interrupted rule
 * of the Specifications list (`staleAfterMs`): a pending commit may legitimately wait, and what is
 * interrupted is known from the writer's identity, not from the age of the file. `staleExempt` says
 * so on every row.
 */
export interface DocumentChangeListingRow {
  readonly operationId: string;
  readonly kind: 'document-change';
  readonly subject?: { readonly specId: string; readonly slug: string };
  /** The kind of change (the `DocumentOperationStatus` action vocabulary). */
  readonly action?: string;
  readonly documentCount?: number;
  /** Stable code, never server text. */
  readonly code?: string;
  /** ISO. */
  readonly startedAt?: string;
  /** ISO, the last change of the journal. */
  readonly updatedAt: string;
  readonly status: 'queued' | 'failed' | 'recovery-required';
  /** The source state in the vocabulary of the list service. */
  readonly state: 'queued' | 'failed' | 'recovery-required';
  readonly staleExempt: true;
  /** The journal file could not be read: only its id and time are known. */
  readonly unreadable?: true;
}

/** Stable code of a failed commit, from its reason (the codes of the document errors). */
export function commitFailureCode(reason: string | undefined): string {
  switch (reason) {
    case 'branch-protected':
    case 'branch-not-allowed':
      return 'BRANCH_PROTECTED';
    case 'detached':
    case 'branch-changed':
    case 'no-commits':
    case 'path-ignored':
    case 'index-unreadable':
      return 'COMMIT_BLOCKED';
    default:
      return 'COMMIT_FAILED';
  }
}

/**
 * The rows of the active document journals worth a person's attention: `failed` (a commit that needs
 * a decision), `recovery-required` (also a write whose process is provably gone), and a
 * commit still pending 30 seconds after it was queued. Settled operations (committed, nothing to
 * commit) are never listed. Active directory only: no lock, no Git, one tolerant read per changed
 * file; a bad file is a row of its own.
 */
export async function listDocumentOperationRows(
  engine: SpecFlowEngine,
  options: CommitReadOptions = {},
): Promise<readonly DocumentChangeListingRow[]> {
  const now = (options.now ?? Date.now)();
  const active = await listActiveDocumentOperations(engine.context);
  const table = options.processTable ?? nodeProcessTable;
  const writing = active.journals.some(
    (journal) => isWriting(journal) && journal.executor !== undefined,
  );
  const own = writing ? await captureExecutorIdentity(table) : undefined;
  const rows: DocumentChangeListingRow[] = [];
  for (const journal of active.journals) {
    if (!DOCUMENT_CHANGE_STAGE_FACTS[journal.stage].active) continue;
    const row = await rowOf(journal, now, async () =>
      own === undefined || journal.executor === undefined
        ? 'unknown'
        : writerHint(await proveExecutorState(journal.executor, own, table)),
    );
    if (row !== undefined) rows.push(row);
  }
  for (const entry of active.unreadableJournals) {
    rows.push({
      operationId: entry.operationId,
      kind: 'document-change',
      status: 'recovery-required',
      state: 'recovery-required',
      code: DOCUMENT_RECOVERY_REQUIRED_CODE,
      unreadable: true,
      updatedAt: entry.updatedAt.toISOString(),
      staleExempt: true,
    });
  }
  return rows.sort(
    (left, right) =>
      Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
      (left.operationId < right.operationId ? -1 : 1),
  );
}

function isWriting(journal: DocumentChangeJournal): boolean {
  return isWriterStage(journal.stage);
}

async function rowOf(
  journal: DocumentChangeJournal,
  now: number,
  writer: () => Promise<'alive' | 'dead' | 'unknown'>,
): Promise<DocumentChangeListingRow | undefined> {
  const base = {
    operationId: journal.operationId,
    kind: 'document-change',
    subject: { specId: journal.specId, slug: journal.slug },
    action: journal.action,
    documentCount: journal.plan.documentCount,
    startedAt: journal.createdAt,
    updatedAt: journal.updatedAt,
    staleExempt: true,
  } as const;
  switch (journal.stage) {
    case 'commit-failed':
      return {
        ...base,
        status: 'failed',
        state: 'failed',
        code: commitFailureCode(journal.reason),
      };
    case 'recovery-required':
      return {
        ...base,
        status: 'recovery-required',
        state: 'recovery-required',
        code: DOCUMENT_RECOVERY_REQUIRED_CODE,
      };
    case 'queued':
    case 'committing': {
      const info = commitInfoOfJournal(journal, now);
      const queuedAt = info.queuedAt === undefined ? undefined : Date.parse(info.queuedAt);
      if (queuedAt === undefined || now - queuedAt < DOCUMENT_ROW_PENDING_AFTER_MS) {
        return undefined;
      }
      return { ...base, status: 'queued', state: 'queued' };
    }
    case 'reserved':
    case 'files-writing':
      if ((await writer()) !== 'dead') return undefined;
      return {
        ...base,
        status: 'recovery-required',
        state: 'recovery-required',
        code: DOCUMENT_WRITE_INTERRUPTED_CODE,
      };
    case 'completed':
    case 'failed':
      return undefined;
  }
}

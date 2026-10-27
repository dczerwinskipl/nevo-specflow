import type { ResolvedProjectHome } from '../../../project/home/home';
import { mapBounded } from '../../../concurrency';
import { DocumentError } from '../../document-rules/errors';
import { listRecordsTolerant, readLedgerRecord, readPayload } from '../../durable';
import type { DocumentBatchRecord } from '../changes/journal/batch';
import type { CommitPolicyMode } from '@nevo/specflow-contracts/documents';

import type { DocumentChangeJournal } from '../changes/journal/model';
import { DOCUMENT_CHANGE_JOURNAL_KIND } from '../changes/journal/kind';
import { DOCUMENT_CHANGE_STAGE_FACTS, isWriterStage } from '../changes/journal/stages';
import { decodePlanWithEvidence } from '../changes/plan/codec';
import { DOCUMENT_BATCH_KIND, readBatchPaths } from '../queue/batch-store';
import {
  captureExecutorIdentity,
  nodeProcessTable,
  proveExecutorState,
  type ProcessTable,
} from '../write/executor-identity';
import {
  deriveCommitView,
  type BatchPaths,
  type LedgerMarkerInput,
  type DocumentCommitView,
  type OperationPaths,
} from './commit-model';

/** Plan and path-list reads run this many at a time. */
const READ_CONCURRENCY = 8;
/** Plans are immutable and addressed by their hash: the memo never goes stale, only large. */
const PLAN_MEMO_MAX = 1024;

const planPathsMemo = new Map<string, readonly string[]>();

function remember(key: string, paths: readonly string[]): void {
  if (planPathsMemo.size >= PLAN_MEMO_MAX) {
    const oldest = planPathsMemo.keys().next();
    if (!oldest.done) planPathsMemo.delete(oldest.value);
  }
  planPathsMemo.set(key, paths);
}

/** Forgets every memoised plan (tests). */
export function clearCommitReadMemo(): void {
  planPathsMemo.clear();
}

export interface CommitReadOptions {
  readonly now?: () => number;
  /** Process table of the writer liveness judgement (procfs seam). */
  readonly processTable?: ProcessTable;
  /**
   * The commit policy of the documents, resolved by the caller (the read side knows no Git policy):
   * reported in the summary of the view. Absent while Git is disabled.
   */
  readonly policy?: CommitPolicyMode;
}

/** The active operations of the Project Home as a read sees them (tolerant, lock-free). */
export interface ActiveDocumentOperations {
  readonly journals: readonly DocumentChangeJournal[];
  readonly batches: readonly DocumentBatchRecord[];
  /** Journal or batch files that are corrupt, redirected or oversize. */
  readonly unreadable: number;
  /** The unreadable journal files, with the time of their last change. */
  readonly unreadableJournals: readonly {
    readonly operationId: string;
    readonly updatedAt: Date;
  }[];
  /** A directory holds more files than a listing reads. */
  readonly truncated: boolean;
}

/**
 * The active (not yet settled) document journals and batch records of the Project Home. Lock-free
 * and Git-free; a bad file is counted, never thrown. Older-format files are ignored: they claim
 * nothing and block nothing.
 */
export async function listActiveDocumentOperations(
  context: ResolvedProjectHome,
): Promise<ActiveDocumentOperations> {
  const [journals, batches] = await Promise.all([
    listRecordsTolerant(context, DOCUMENT_CHANGE_JOURNAL_KIND),
    listRecordsTolerant(context, DOCUMENT_BATCH_KIND),
  ]);
  return {
    journals: journals.records,
    batches: batches.records,
    unreadable: journals.unreadable.length + batches.unreadable.length,
    unreadableJournals: journals.unreadable,
    truncated: journals.truncated || batches.truncated,
  };
}

/** The checkout-relative paths of a journal's plan; `undefined` when the plan cannot be proven. */
export async function readJournalPlanPaths(
  context: ResolvedProjectHome,
  journal: DocumentChangeJournal,
): Promise<readonly string[] | undefined> {
  const key = journal.plan.sha256;
  const known = planPathsMemo.get(key);
  if (known !== undefined) return known;
  try {
    const plan = decodePlanWithEvidence(
      await readPayload(context, DOCUMENT_CHANGE_JOURNAL_KIND, journal.operationId, journal.plan),
      journal.plan,
    );
    const paths = plan.paths.map((path) => path.path);
    remember(key, paths);
    return paths;
  } catch (error) {
    if (error instanceof DocumentError) return undefined;
    throw error;
  }
}

async function readBatchPathList(
  context: ResolvedProjectHome,
  batch: DocumentBatchRecord,
): Promise<readonly string[] | undefined> {
  const key = 'batch:' + batch.paths.sha256;
  const known = planPathsMemo.get(key);
  if (known !== undefined) return known;
  try {
    const paths = (await readBatchPaths(context, batch)).map((entry) => entry.path);
    remember(key, paths);
    return paths;
  } catch (error) {
    if (error instanceof DocumentError) return undefined;
    throw error;
  }
}

/** The Specification a commit view is read for: the plans name its checkout-relative directory. */
export function commitSubjectOf(loaded: {
  readonly specId: string;
  readonly workspaceId: string;
  readonly slug: string;
}): { readonly specId: string; readonly workspaceId: string; readonly directory: string } {
  return {
    specId: loaded.specId,
    workspaceId: loaded.workspaceId,
    directory: 'specs/active/' + loaded.slug,
  };
}

/** Where a Specification's open commits stand: what the tree, the workspace and the status read. */
export async function readDocumentCommitView(
  context: ResolvedProjectHome,
  subject: { readonly specId: string; readonly workspaceId: string; readonly directory: string },
  options: CommitReadOptions = {},
): Promise<DocumentCommitView> {
  const now = (options.now ?? Date.now)();
  const active = await listActiveDocumentOperations(context);
  const mine = active.journals.filter(
    (journal) => journal.workspaceId === subject.workspaceId && journal.specId === subject.specId,
  );
  const table = options.processTable ?? nodeProcessTable;
  const writing = mine.some(
    (journal) => journal.executor !== undefined && journalIsWriting(journal),
  );
  const own = writing ? await captureExecutorIdentity(table) : undefined;

  const journals = await mapBounded(
    mine,
    READ_CONCURRENCY,
    async (journal): Promise<OperationPaths> => ({
      journal,
      paths: await readJournalPlanPaths(context, journal),
      ...(own !== undefined && journal.executor !== undefined && journalIsWriting(journal)
        ? { writer: writerHint(await proveExecutorState(journal.executor, own, table)) }
        : {}),
    }),
  );
  const claimed = active.batches.filter(
    (batch) => batch.workspaceId === subject.workspaceId && batch.specId === subject.specId,
  );
  const batches = await mapBounded(
    claimed,
    READ_CONCURRENCY,
    async (batch): Promise<BatchPaths> => ({
      batch,
      paths: await readBatchPathList(context, batch),
    }),
  );
  // Journals of the other Specifications only count toward the checkout's queue capacity.
  const others = active.journals
    .filter((journal) => !mine.includes(journal))
    .map((journal): OperationPaths => ({ journal, paths: [] }));
  const ledger = await readLedgerMarkers(context, subject);
  return deriveCommitView({
    ...subject,
    journals: [...journals, ...others],
    batches,
    unreadable: active.unreadable,
    now,
    ledger,
    ...(options.policy !== undefined ? { policy: options.policy } : {}),
  });
}

/** The paths of the Specification's ledger record; an unreadable record shows nothing (a write fails closed on it). */
async function readLedgerMarkers(
  context: ResolvedProjectHome,
  subject: { readonly specId: string; readonly workspaceId: string },
): Promise<readonly LedgerMarkerInput[]> {
  try {
    const record = await readLedgerRecord(context, subject.workspaceId, {
      kind: 'specification',
      id: subject.specId,
    });
    return (record?.entries ?? []).map((entry) => ({
      path: entry.path,
      operationId: entry.operationIds.at(-1)!,
      reason: entry.reason,
      recordedAt: entry.recordedAt,
    }));
  } catch {
    return [];
  }
}

function journalIsWriting(journal: DocumentChangeJournal): boolean {
  return DOCUMENT_CHANGE_STAGE_FACTS[journal.stage].active && isWriterStage(journal.stage);
}

/** `self` and `alive` both run; only `dead` is proven gone. */
export function writerHint(
  state: 'self' | 'alive' | 'dead' | 'unknown',
): 'alive' | 'dead' | 'unknown' {
  return state === 'self' || state === 'alive' ? 'alive' : state;
}

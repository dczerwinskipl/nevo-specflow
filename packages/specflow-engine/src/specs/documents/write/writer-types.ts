import type { CommitInfo } from '@nevo/specflow-contracts/documents';

import type { SpecFlowEngine } from '../../../application';
import type { ResolvedProjectHome } from '../../../project/home/home';
import type { ClaimSelf, MutationResource } from '../../durable';
import type { DocumentChangeJournal } from '../changes/journal/model';
import type { DocumentChangeStage } from '../changes/journal/stages';
import type {
  DocumentChangeAction,
  DocumentChangePlan,
  PlannedDocument,
} from '../changes/plan/model';
import type { DocumentAdmissionOptions } from './admission';
import type { DocumentFileOps, PathEffectEvent } from './file-effects';
import type { ExecutorIdentity } from '../changes/journal/model';
import type { ProcessTable } from './executor-identity';
import type { BatchPathView } from './reservation-guard';

/**
 * Observation points of a write. Production passes none. A test awaits them to cut the process at a
 * point (throwing `WriterInterrupted`, or hanging until it is killed), and every hook runs OUTSIDE the
 * Project Home control lock except `beforeReservationPublish`.
 */
export interface DocumentWriteHooks {
  /** Between admission and the reservation; `attempt` is 1 for the first plan and 2 after a re-plan. */
  afterAdmission?(attempt: number): Promise<void>;
  /** Inside the reservation lock, after the plan and the content are durable and before the journal. */
  beforeReservationPublish?(): Promise<void>;
  /** A journal of `stage` is about to be written / has just been written. */
  beforeJournalWrite?(stage: DocumentChangeStage): Promise<void>;
  afterJournalWrite?(stage: DocumentChangeStage): Promise<void>;
  /** Each effect on a path of the plan. */
  onPathEffect?(event: PathEffectEvent): Promise<void>;
  /** After the content payload was deleted at the `queued` transition. */
  afterPayloadReleased?(): Promise<void>;
  /**
   * Manual mode, inside the control lock: the ledger holds the paths of the operation, its journal
   * is not `completed` yet. A test stops the process here; a hook that hangs holds the lock.
   */
  afterLedgerWrite?(): Promise<void>;
}

/** Batches the queue holds, as the reservation sees them. The queue (batch store) supplies the real one. */
export interface BatchViewProvider {
  list(context: ResolvedProjectHome, workspaceId: string): Promise<readonly BatchPathView[]>;
}

/** No batch exists: the provider of a writer that runs without a queue. */
export const NO_BATCHES: BatchViewProvider = { list: () => Promise.resolve([]) };

/** What the writer needs from the rest of the Engine, supplied by the composition that owns the claims. */
export interface DocumentWriteDependencies {
  /** The cross-slice claim check (Create, Close, document journals); throws `SharedResourceError`. */
  readonly assertClaims: (
    context: ResolvedProjectHome,
    requested: readonly MutationResource[],
    self: ClaimSelf,
  ) => Promise<void>;
}

export interface DocumentWriteOptions extends DocumentAdmissionOptions {
  readonly files?: DocumentFileOps;
  readonly hooks?: DocumentWriteHooks;
  readonly batches?: BatchViewProvider;
  readonly now?: () => Date;
  readonly sleep?: (ms: number) => Promise<void>;
  readonly processTable?: ProcessTable;
  /** The identity written into the journal; defaults to the capture of this process. */
  readonly executor?: ExecutorIdentity;
  /** Retries of a failed file effect after the first attempt (default 3, 100 ms apart). */
  readonly retries?: { readonly count: number; readonly delayMs: number };
  /** How long a reservation that meets a claimed batch or a writer of the same paths waits (default 5 s). */
  readonly busyWaitMs?: number;
  /**
   * Operator assertion that the writer recorded in a `reserved` / `files-writing` journal is no longer
   * running, for a platform or process that cannot be proven dead. Never set by a transport.
   */
  readonly confirmWriterStopped?: boolean;
}

/** What a write answers: the facts the transports shape their responses from. */
export interface DocumentChangeResult {
  readonly operationId: string;
  readonly specId: string;
  readonly slug: string;
  readonly action: DocumentChangeAction;
  /** Documents written or created, with their content hash and size (the revision of a text document). */
  readonly documents: readonly PlannedDocument[];
  readonly removedDocumentIds: readonly string[];
  readonly folders: readonly string[];
  readonly allocatedIds: readonly string[];
  /** The commit state now: pending after a write with Git, not-applicable without it. */
  readonly commit: CommitInfo;
  /** The stage the journal is in now. */
  readonly stage: DocumentChangeStage;
  /** True when the answer is the stored result of an operation that was already admitted. */
  readonly replayed: boolean;
}

export function resultOf(
  journal: DocumentChangeJournal,
  plan: DocumentChangePlan,
  commit: CommitInfo,
  replayed: boolean,
): DocumentChangeResult {
  return {
    operationId: journal.operationId,
    specId: journal.specId,
    slug: journal.slug,
    action: journal.action,
    documents: plan.documents,
    removedDocumentIds: plan.removedDocumentIds,
    folders: plan.folders,
    allocatedIds: plan.allocatedIds,
    commit,
    stage: journal.stage,
    replayed,
  };
}

/** The options with every seam filled in. */
export interface WriteRuntime {
  readonly engine: SpecFlowEngine;
  readonly context: ResolvedProjectHome;
  readonly deps: DocumentWriteDependencies;
  readonly options: DocumentWriteOptions;
  readonly files: DocumentFileOps;
  readonly hooks: DocumentWriteHooks;
  readonly batches: BatchViewProvider;
  readonly retries: { readonly count: number; readonly delayMs: number };
  readonly busyWaitMs: number;
  now(): Date;
  nowIso(): string;
  sleep(ms: number): Promise<void>;
  executor(): Promise<ExecutorIdentity>;
  /** Five hexadecimal characters that tell this call's stage files from another executor's. */
  readonly executorTag: string;
}

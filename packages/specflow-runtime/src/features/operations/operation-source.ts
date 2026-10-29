import type { OperationStepStatus } from '@nevo/specflow-contracts/operations';

/**
 * What a feature knows about one persisted operation of one kind (its journal), without any
 * liveness: the list service overlays the progress registry and applies the status table.
 * Adapters read from disk only, tolerate a bad record per row and never expose internal text.
 */
export interface OperationSourceRow {
  readonly operationId: string;
  /**
   * Persisted progress, not liveness. `queued` and `failed` are produced by document changes (a
   * queued commit can wait legitimately; the idle-interrupted rule never applies to it). An
   * uncommitted or abandoned change is not a failure and is never listed.
   */
  readonly state: 'in-progress' | 'recovery-required' | 'completed' | 'queued' | 'failed';
  /** Stable code of a recovery-required row whose cause is known (e.g. an unreadable journal). */
  readonly code?: string;
  readonly title?: string;
  readonly subject?: { readonly specId?: string; readonly slug?: string };
  readonly target?: {
    readonly workspaceKind?: 'existing' | 'new-worktree';
    readonly workspaceId?: string;
    readonly branch?: string;
  };
  /** `document-change` rows: the kind of change and how many documents it covers. */
  readonly action?: string;
  readonly documentCount?: number;
  /** Public step vocabulary of the kind, derived from the persisted stage. */
  readonly currentStep?: string;
  readonly steps?: readonly { readonly id: string; readonly status: OperationStepStatus }[];
  /** ISO. Absent when the record never stored it. */
  readonly startedAt?: string;
  /** ISO, required: the last persisted change (file time when the record has no own clock). */
  readonly updatedAt: string;
}

export interface OperationListSource {
  /** The operation kind this source lists (matches the progress registry kind). */
  readonly kind: string;
  /** Disk-only, tolerant per record: one bad record must not fail the list. */
  list(): Promise<readonly OperationSourceRow[]>;
  // Reserved for a later runner / diagnostics, intentionally not implemented now:
  //   resume?: { safe: boolean; handler(row): Promise<void> };
  //   describeForDiagnostics?(row): DiagnosticsRow;
}

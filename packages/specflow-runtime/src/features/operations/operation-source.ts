import type { OperationStepStatus } from '@nevo/specflow-contracts/operations';

/**
 * What a feature knows about one persisted operation of one kind (its journal), without any
 * liveness: the list service overlays the progress registry and applies the status table.
 * Adapters read from disk only, tolerate a bad record per row and never expose internal text.
 */
export interface OperationSourceRow {
  readonly operationId: string;
  /** Persisted progress, not liveness. */
  readonly state: 'in-progress' | 'recovery-required' | 'completed';
  /** Stable code of a recovery-required row whose cause is known (e.g. an unreadable journal). */
  readonly code?: string;
  readonly title?: string;
  readonly subject?: { readonly specId?: string; readonly slug?: string };
  readonly target?: {
    readonly workspaceKind?: 'existing' | 'new-worktree';
    readonly workspaceId?: string;
    readonly branch?: string;
  };
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

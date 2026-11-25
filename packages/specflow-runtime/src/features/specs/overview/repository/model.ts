import type { CurrentSpecWorkflow } from '@nevo/specflow-contracts/specs/overview';

export interface SpecProgressRecord {
  readonly completed: number;
  readonly total: number;
}

export interface SpecPullRequestRecord {
  readonly number: number;
  readonly url: string;
}

export interface SpecOverviewRecord {
  readonly id: string;
  readonly title: string;
  readonly key?: string;
  readonly pullRequests?: readonly SpecPullRequestRecord[];
  readonly tags?: readonly string[];
  readonly updatedAt: string;
  readonly progress: SpecProgressRecord | null;
}

export type CurrentSpecAttentionReasonRecord =
  'input' | 'decision' | 'review' | 'blocked' | 'approval';

export type CurrentSpecSignalKindRecord = 'attention' | 'ready' | 'working' | 'issue' | 'quiet';

export type CurrentSpecTargetRecord =
  | { readonly kind: 'specification'; readonly specId: string }
  | { readonly kind: 'task'; readonly specId: string; readonly taskId: string }
  | { readonly kind: 'session'; readonly specId: string; readonly sessionId: string };

export interface CurrentSpecSignalRecord {
  readonly id: string;
  readonly kind: CurrentSpecSignalKindRecord;
  readonly label: string;
  readonly reason?: string;
  readonly attentionReason?: CurrentSpecAttentionReasonRecord;
  readonly count?: number;
  readonly priority: number;
  readonly target: CurrentSpecTargetRecord;
}

/** Where the Specification's workflow run stands (the Overview's Now position). */
export type CurrentSpecWorkflowRecord = CurrentSpecWorkflow;

export interface CurrentSpecRecord extends SpecOverviewRecord {
  /**
   * Where the Specification's workflow run stands; `null` when it cannot be read. The manifest's
   * `status` is not progress (it stays `draft` until Close archives the Specification), so it is not
   * read here.
   */
  readonly workflow: CurrentSpecWorkflowRecord | null;
  readonly signals: readonly CurrentSpecSignalRecord[] | null;
  readonly currentExecutions:
    | readonly {
        readonly sessionId: string;
        readonly agentRole: string;
        readonly taskIds: readonly string[];
      }[]
    | null;
}

export interface ArchivedSpecRecord extends SpecOverviewRecord {
  readonly completedAt?: string;
  readonly archivedAt?: string;
}

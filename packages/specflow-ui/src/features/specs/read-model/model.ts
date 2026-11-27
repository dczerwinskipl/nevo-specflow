import type { IconGlyph } from '@nevo/ui';
import type { TaskOverview, WorkspaceAttention } from '@nevo/specflow-contracts/specs/workspace';
import type { DocumentContentState } from '@nevo/specflow-contracts/documents';
import type { AgentStepOrigin } from '@nevo/specflow-contracts/sessions';
import { type TaskGroup } from '../../tasks/read-model';

export {
  getTaskStatePresentation,
  type TaskLifecycle,
  type TaskEvidence,
  type TaskRelatedSession,
  type TaskItem,
  type TaskGroup,
  type TaskStatePresentation,
} from '../../tasks/read-model';

export interface DocumentSection {
  readonly heading: string;
  readonly content?: string;
  readonly items?: readonly string[];
}

export interface DocumentItem {
  readonly filename?: string;
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly summary?: string;
  /** What the file holds relative to its initial content; absent when the source cannot tell. */
  readonly contentState?: DocumentContentState;
  readonly content?: string;
  readonly sections?: readonly DocumentSection[];
}

export interface SessionActivity {
  readonly label: string;
  readonly tone?: 'attention' | 'info' | 'neutral' | 'success';
  readonly icon?: IconGlyph;
  readonly animate?: boolean;
}

export interface SessionSummary {
  /** Effective Session readiness as the workspace section projects it. */
  readonly navigationStatus?:
    'active' | 'attention' | 'quiet' | 'authenticationRequired' | 'unknown';
  readonly id: string;
  readonly title: string;
  readonly meta?: string;
  /** Associated Tasks; absent or zero shows no count. */
  readonly taskCount?: number;
  /** The agent step attempt an agent step Session was made for (its title and facts lines). */
  readonly agentStep?: AgentStepOrigin;
  readonly updatedAt?: string;
  /**
   * The agent: ids from the Session, display titles resolved by the Runtime. Every workspace row
   * carries `providerId`; only the navigator, which never names the agent, reads summaries
   * without it.
   */
  readonly providerId?: string;
  readonly providerTitle?: string;
  readonly modelId?: string;
  readonly modelTitle?: string;
  /** The provider mode the Session runs in, by the catalogue's title (Auto, Manual, ...). */
  readonly providerModeTitle?: string;
  readonly activity?: SessionActivity;
  readonly activityCode?: 'active' | 'attention';
}

export interface AttentionItem {
  readonly id: string;
  readonly kind: 'task' | 'session' | 'git' | 'specification';
  readonly title: string;
  readonly reason: string;
  readonly actionLabel: string;
  readonly actionCode?: 'task' | 'session' | 'git' | 'specification';
  readonly targetId?: string;
  readonly priority?: 'critical' | 'high' | 'normal';
  /**
   * Workflow and Session items (the attention projection): the stable reason code (`reason` is
   * then the server's display text), who has to act, the one action and its alternative, and the
   * Tasks it names (`tasks-stuck`: with why each blocks; `on-hold-blocking`: what the held Task
   * holds up, `blocks`). Absent on other items.
   */
  readonly code?: string;
  /** The step the item is about (its action names it). */
  readonly stepTitle?: string;
  readonly actor?: WorkspaceAttention['actor'];
  readonly action?: WorkspaceAttention['action'];
  readonly secondaryAction?: WorkspaceAttention['secondaryAction'];
  readonly taskIds?: readonly string[];
  /** `dependency-unsatisfiable` with `restore-task`: the broken Tasks among `taskIds`. */
  readonly brokenTaskIds?: readonly string[];
  readonly blocking?: WorkspaceAttention['blocking'];
  readonly blocks?: WorkspaceAttention['blocks'];
}

/**
 * The Specification's Task progress, one definition: done of the Tasks meant to be done, with
 * cancelled, ended and on hold named apart (absent in the demo Runtime).
 */
export interface TaskProgressData {
  readonly completed: number;
  readonly total: number;
  readonly cancelled?: number;
  readonly ended?: number;
  readonly onHold?: number;
}

/** A missing domain read is not an empty Attention list. */
export type FeatureAttentionSource =
  | { readonly state: 'available'; readonly items: readonly AttentionItem[] }
  | {
      readonly state: 'unavailable';
      readonly reason: 'source_unavailable' | 'source_busy' | 'source_recovery' | 'not_implemented';
    }
  | { readonly state: 'forbidden' };

export interface FeatureAttentionData {
  readonly tasks: FeatureAttentionSource;
  readonly sessions: FeatureAttentionSource;
  readonly git: FeatureAttentionSource;
}

export interface RepoContext {
  readonly branch?: string;
  readonly baseBranch?: string;
  readonly uncommittedCount?: number;
  readonly syncStatus?: string;
  readonly conflictStatus?: string;
  readonly repositoryName?: string;
  readonly linkedPr?: {
    readonly number: number;
    readonly title: string;
  };
  readonly otherPrs?: readonly {
    readonly number: number;
    readonly title: string;
    readonly status: string;
  }[];
  readonly isDirty?: boolean;
  readonly freshness?: 'fresh' | 'stale' | 'unknown';
}

export type ActivityEventKind = 'task' | 'session' | 'doc' | 'info';

export interface BaseActivityEvent {
  readonly id: string;
  readonly time: string;
  /** A known Runtime event the UI localizes; `title`/`description` are then English fallbacks. */
  readonly event?: 'specification_created' | 'session_started';
  readonly title: string;
  readonly description: string;
}

export interface TaskActivityEvent extends BaseActivityEvent {
  readonly kind: 'task';
  readonly targetId: string;
}

export interface SessionActivityEvent extends BaseActivityEvent {
  readonly kind: 'session';
  readonly targetId: string;
}

export interface DocumentActivityEvent extends BaseActivityEvent {
  readonly kind: 'doc';
  readonly targetId: string;
}

export interface InformationalActivityEvent extends BaseActivityEvent {
  readonly kind: 'info';
  readonly targetId?: string;
}

export type ActivityEvent =
  TaskActivityEvent | SessionActivityEvent | DocumentActivityEvent | InformationalActivityEvent;

export interface SpecificationChangesData {
  readonly base?: readonly string[];
  readonly uncommitted?: readonly string[];
  readonly mr?: readonly string[];
}

/**
 * `actions.startSession` of the workspace read: whether this user may start a Session in the
 * Specification, else one reason (`sessions_disabled`, then `forbidden`, then `no_provider`). `path`
 * is the start route when it is not the composed create (the demo Runtime).
 */
export interface StartSessionAction {
  readonly available: boolean;
  readonly reason?: string;
  readonly path?: string;
}

export type SpecificationSectionId =
  'tasks' | 'documents' | 'sessions' | 'activity' | 'repository' | 'changes';
export type SpecificationSectionState = 'available' | 'unavailable' | 'forbidden';

export interface SpecificationWorkspaceData {
  readonly sectionAvailability?: Partial<Record<SpecificationSectionId, SpecificationSectionState>>;
  /**
   * Why an unavailable section is unavailable: `not_implemented` is permanent for this Runtime,
   * `source_busy` is a held control lock (busy or recovering from a stop), `source_recovery` a lock
   * only an operator's recovery releases, `source_unavailable` any
   * other read failure.
   */
  readonly sectionUnavailableReason?: Partial<
    Record<
      SpecificationSectionId,
      'not_implemented' | 'source_unavailable' | 'source_busy' | 'source_recovery'
    >
  >;
  readonly id: string;
  /** The registered workspace the Specification is bound to (its documentation is read there). */
  readonly workspaceId?: string;
  /** Optional human-facing Specification key, e.g. `UI-1234`. */
  readonly key?: string;
  readonly title: string;
  readonly intro: string;
  readonly overviewDocumentId?: string;
  readonly isEmpty?: boolean;
  readonly isPreparing?: boolean;
  readonly hasGit?: boolean;
  /** Specification-owned entries only, not other features' Attention. */
  readonly attentionItems: readonly AttentionItem[];
  /** Facts provided by the owning Runtime feature sections. */
  readonly featureAttention?: FeatureAttentionData;
  readonly repoContext?: RepoContext;
  readonly resumeSession?: SessionSummary;
  readonly taskGroups: readonly TaskGroup[];
  readonly documents: readonly DocumentItem[];
  readonly documentFolders?: readonly string[];
  readonly sessions: readonly SessionSummary[];
  /** More associated Sessions exist than the bounded workspace section returns. */
  readonly sessionsHasMore?: boolean;
  readonly startSession?: StartSessionAction;
  readonly activityEvents: readonly ActivityEvent[];
  readonly completedTasksCount?: number;
  readonly totalTasksCount?: number;
  /** The Task progress with its named parts; absent when the Tasks could not be read. */
  readonly taskProgress?: TaskProgressData;
  /** The Runtime's Overview summary of the configured grouping, and Now's explanation when stuck. */
  readonly taskOverview?: TaskOverview;
  readonly changes?: SpecificationChangesData;
}

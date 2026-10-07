export type SpecificationWorkspaceView =
  'work' | 'documents' | 'sessions' | 'changes' | 'repository' | 'task';

export type SpecificationScenario =
  | 'working'
  | 'empty'
  | 'preparing'
  | 'no-git'
  | 'git-conflict'
  | 'git-unknown'
  | 'git-stale'
  | 'extensions';

export type TaskLifecycle = 'pending' | 'in_progress' | 'completed' | 'blocked';

export interface TaskExecutionReadiness {
  readonly canExecute: boolean;
  readonly blockers?: readonly string[];
  readonly warnings?: readonly string[];
}

export interface TaskEvidence {
  readonly label: string;
  readonly href?: string;
}

export interface TaskRelatedSession {
  readonly id: string;
  readonly title: string;
}

export interface TaskItem {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly lifecycle?: TaskLifecycle;
  readonly additionalInfo?: string;
  readonly group: string;
  readonly purpose?: string;
  readonly acceptanceCriteria?: readonly string[];
  readonly workflow?: string;
  readonly evidence?: readonly TaskEvidence[];
  readonly relatedSessions?: readonly TaskRelatedSession[];
  readonly history?: readonly string[];
}

export interface TaskGroup {
  readonly id: string;
  readonly name: string;
  readonly tasks: readonly TaskItem[];
}

export interface DocumentSection {
  readonly heading: string;
  readonly content?: string;
  readonly items?: readonly string[];
}

export interface DocumentItem {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly summary?: string;
  readonly content?: string;
  readonly sections?: readonly DocumentSection[];
}

export interface SessionSummary {
  readonly id: string;
  readonly title: string;
  readonly meta: string;
}

export interface AttentionItem {
  readonly id: string;
  readonly kind: 'task' | 'session' | 'git';
  readonly title: string;
  readonly reason: string;
  readonly actionLabel: string;
  readonly targetId?: string;
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

export interface ActivityEvent {
  readonly id: string;
  readonly time: string;
  readonly title: string;
  readonly description: string;
  readonly type?: 'task' | 'session' | 'doc';
  readonly targetId?: string;
}

export interface SpecificationChangesData {
  readonly base?: readonly string[];
  readonly uncommitted?: readonly string[];
  readonly mr?: readonly string[];
}

export interface SpecificationWorkspaceData {
  readonly id: string;
  readonly title: string;
  readonly intro: string;
  readonly isEmpty?: boolean;
  readonly isPreparing?: boolean;
  readonly hasGit?: boolean;
  readonly hasExtensions?: boolean;
  readonly attentionItems: readonly AttentionItem[];
  readonly repoContext?: RepoContext;
  readonly resumeSession?: SessionSummary;
  readonly taskGroups: readonly TaskGroup[];
  readonly documents: readonly DocumentItem[];
  readonly sessions: readonly SessionSummary[];
  readonly activityEvents: readonly ActivityEvent[];
  readonly completedTasksCount?: number;
  readonly totalTasksCount?: number;
  readonly executionReadiness?: TaskExecutionReadiness;
  readonly changes?: SpecificationChangesData;
}

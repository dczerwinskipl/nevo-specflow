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

export interface TaskItem {
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly additionalInfo?: string;
  readonly group: string;
}

export interface TaskGroup {
  readonly id: string;
  readonly name: string;
  readonly tasks: readonly TaskItem[];
}

export interface DocumentItem {
  readonly id: string;
  readonly title: string;
  readonly kind: string;
  readonly summary?: string;
  readonly content?: string;
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
  readonly branch: string;
  readonly baseBranch: string;
  readonly uncommittedCount: number;
  readonly syncStatus: string;
  readonly conflictStatus: string;
  readonly linkedPr?: {
    readonly number: number;
    readonly title: string;
  };
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
}

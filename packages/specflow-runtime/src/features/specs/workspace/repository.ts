import type { RequestAuthorization } from '../../auth';
import type { SessionScopeIdentity } from '../../sessions';
import type { WorkspaceActivityInput, WorkspaceSessionStart } from './activity';

/**
 * Runtime-owned read projection: not an HTTP response.
 * Authorization/redaction and transport availability are applied at the endpoint.
 */
export type SourceSection<T> =
  | { readonly state: 'available'; readonly data: T }
  | { readonly state: 'unavailable'; readonly reason: 'not_implemented' | 'source_unavailable' };

export interface WorkspaceTaskRecord {
  readonly id: string;
  readonly title: string;
  readonly status: {
    readonly id: string;
    readonly label: string;
    readonly lifecycle: 'pending' | 'in_progress' | 'completed' | 'blocked';
  };
}
export interface WorkspaceSessionRecord {
  readonly id: string;
  /** Absent for an untitled Session; the server never invents a title. */
  readonly title?: string;
  readonly taskIds: string[];
  readonly status: 'active' | 'attention' | 'quiet' | 'authenticationRequired' | 'unknown';
  readonly providerId: string;
  readonly providerTitle?: string;
  readonly modelId?: string;
  readonly modelTitle?: string;
  readonly updatedAt: string;
}
export interface WorkspaceAttentionRecord {
  readonly id: string;
  readonly kind: 'task' | 'session' | 'git' | 'specification';
  readonly title: string;
  readonly reason: string;
  readonly targetId?: string;
  readonly priority?: 'critical' | 'high' | 'normal';
}
export interface WorkspaceActivityRecord {
  readonly id: string;
  readonly occurredAt: string;
  readonly kind: 'task' | 'session' | 'doc' | 'info';
  /** A known Runtime event that clients localize; `title`/`description` are English fallbacks. */
  readonly event?: 'specification_created' | 'session_started';
  readonly title: string;
  readonly description: string;
  readonly targetId?: string;
  /** Mandatory when a generic event contains Session-owned information. */
  readonly relatedSessionId?: string;
}
export interface WorkspaceReadModel {
  readonly revision: string;
  readonly specification: {
    readonly id: string;
    readonly key?: string;
    readonly title: string;
    readonly summary: string;
    readonly preparationState: 'empty' | 'preparing' | 'prepared';
    readonly attention: WorkspaceAttentionRecord[];
  };
  /** Recommendation candidates in order; the first the caller may view is recommended. */
  readonly recommendedSessionIds?: readonly string[];
  /** Store-derived identities of the section rows, so they are not resolved a second time. */
  readonly sessionIdentities?: readonly SessionScopeIdentity[];
  readonly sections: {
    readonly tasks: SourceSection<{
      readonly groups: {
        readonly id: string;
        readonly name: string;
        readonly tasks: WorkspaceTaskRecord[];
      }[];
      readonly completed: number;
      readonly total: number;
      readonly attention: WorkspaceAttentionRecord[];
    }>;
    readonly documents: SourceSection<{
      readonly items: {
        readonly id: string;
        readonly title: string;
        readonly kind: string;
        readonly summary?: string;
      }[];
      /** The overview among `items` (the description's source), whatever its position. */
      readonly overviewDocumentId?: string;
    }>;
    readonly sessions: SourceSection<{
      readonly items: WorkspaceSessionRecord[];
      /** More associated Sessions exist than the bounded section returns. */
      readonly hasMore?: boolean;
      readonly attention: WorkspaceAttentionRecord[];
    }>;
    readonly activity: SourceSection<{ readonly items: WorkspaceActivityRecord[] }>;
    readonly repository: SourceSection<{
      readonly repositoryName?: string;
      readonly branch?: string;
      readonly baseBranch?: string;
      readonly uncommittedCount?: number;
      readonly attention: WorkspaceAttentionRecord[];
    }>;
    readonly changes: SourceSection<{
      readonly base: string[];
      readonly uncommitted: string[];
      readonly mr: string[];
    }>;
  };
  readonly actions: {
    readonly executeTasks: { readonly available: boolean; readonly reason?: string };
    readonly startSession: {
      readonly available: boolean;
      readonly reason?: string;
      /** The start route when it is not the composed create (the demo Runtime's own). */
      readonly path?: string;
    };
  };
}
export type SpecificationReadModel = Omit<
  WorkspaceReadModel,
  'sections' | 'recommendedSessionIds' | 'sessionIdentities'
> & {
  sections: Pick<WorkspaceReadModel['sections'], 'repository' | 'changes'>;
  /**
   * The manifest `created` value as stored, an input of the `activity` contribution. Never
   * presented; the contribution decides whether it is a valid calendar date.
   */
  readonly created?: string;
  /**
   * The verified manifest `tasks`, an input of the (temporary) `tasks` contribution, so the
   * manifest is read once per workspace read. Never presented.
   */
  readonly manifestTasks?: readonly unknown[];
};
/** Facts the Specification source already read, handed to the contributions that need them. */
export interface WorkspaceSourceFacts {
  readonly manifestTasks?: readonly unknown[];
}
export interface SpecificationWorkspaceRepository {
  readSpecification(specId: string): Promise<SpecificationReadModel | null>;
}
export interface WorkspaceContributions {
  tasks?(
    specId: string,
    facts: WorkspaceSourceFacts,
  ): Promise<WorkspaceReadModel['sections']['tasks']>;
  documents?(specId: string): Promise<WorkspaceReadModel['sections']['documents']>;
  /** Composed after the other reads, from the facts they already returned (no foreign read). */
  activity?(
    specId: string,
    input: WorkspaceActivityInput,
  ): Promise<WorkspaceReadModel['sections']['activity']>;
  /** The caller's authorization decides the `startSession` action, never the section. */
  sessions?(
    specId: string,
    context: { readonly authz: RequestAuthorization },
  ): Promise<{
    section: WorkspaceReadModel['sections']['sessions'];
    /** Candidates in recommendation order; the first the caller may view is recommended. */
    recommendedSessionIds?: readonly string[];
    /** The Session owner's store-derived identity of each section row. */
    sessionIdentities?: readonly SessionScopeIdentity[];
    /** The section rows' creation facts: the Session events of the `activity` contribution. */
    sessionStarts?: readonly WorkspaceSessionStart[];
    /** Overrides the Specification source's `startSession` action. */
    startSession?: WorkspaceReadModel['actions']['startSession'];
  }>;
}

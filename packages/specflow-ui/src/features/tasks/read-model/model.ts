import type { SpecificationTaskResponse } from '@nevo/specflow-contracts/specs/workspace';

export type TaskLifecycle = 'pending' | 'in_progress' | 'completed' | 'blocked';

export interface TaskEvidence {
  readonly label: string;
  readonly href?: string;
}

export interface TaskRelatedSession {
  readonly id: string;
  readonly title: string;
}

export interface TaskItem {
  readonly snapshot?: SpecificationTaskResponse['snapshot'];
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly statusCode?: TaskLifecycle;
  readonly lifecycle?: TaskLifecycle;
  /** The presented status of the Engine lane (`draft`, `ready`, `cancelled`, …); project mode. */
  readonly statusId?: string;
  /** The Task Type title; project mode. */
  readonly typeTitle?: string;
  /** The Tasks it depends on; project mode. */
  readonly dependsOn?: readonly string[];
  readonly attention?: boolean;
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
  /** How the Overview summary shows the group (the Runtime's dashboard grouping). */
  readonly summary?: 'row' | 'compact';
  /** The Tasks page collapses it by default. */
  readonly collapsed?: boolean;
  readonly tasks: readonly TaskItem[];
}

/** Full Task identity and detail are independent of Workspace task-group membership. */
export interface FullTaskData {
  readonly snapshot?: SpecificationTaskResponse['snapshot'];
  /** The Task resource (project mode): revision, type, status, documents, context, dependencies. */
  readonly resource?: SpecificationTaskResponse['resource'];
  readonly id: string;
  readonly title: string;
  readonly status: string;
  readonly statusCode?: TaskLifecycle;
  readonly additionalInfo?: string;
  readonly purpose?: string;
  readonly acceptanceCriteria?: readonly string[];
  readonly workflow?: string;
  readonly evidence?: readonly { label: string; href?: string }[];
  readonly relatedSessions?: readonly { id: string; title: string }[];
  readonly history?: readonly string[];
}

export function mapFullTaskResponse(response: SpecificationTaskResponse): FullTaskData {
  return {
    id: response.task.id,
    title: response.task.title,
    status: response.task.status.lifecycle,
    statusCode: response.task.status.lifecycle,
    purpose: response.purpose,
    acceptanceCriteria: response.acceptanceCriteria,
    workflow: response.workflow,
    snapshot: response.snapshot,
    ...(response.resource ? { resource: response.resource } : {}),
  };
}

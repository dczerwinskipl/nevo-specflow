import type { SpecificationTaskResponse } from '@nevo/specflow-contracts/specs/workspace';
import type { TaskLifecycle } from '../workspace/model';

/** Full Task identity and detail are independent of Workspace task-group membership. */
export interface FullTaskData {
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
  };
}

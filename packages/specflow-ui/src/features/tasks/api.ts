import type { HttpRequestClient } from '@nevo/http-client';
import type {
  SpecificationTaskResponse,
  TaskResourcePage,
  TaskHistoryPage,
  TaskListQuery,
  TaskListResponse,
} from '@nevo/specflow-contracts/specs/workspace';

/** Task detail reads are owned by the Tasks feature, even under a Specification URL. */
export interface TaskApi {
  /**
   * The Tasks page read (`GET /api/specs/:specId/tasks`): the configured grouping, progress and
   * attention; `blocking` keeps only the Tasks blocking the Specification. Project Runtime only.
   */
  getTaskList?(
    specId: string,
    query: TaskListQuery,
    signal?: AbortSignal,
  ): Promise<TaskListResponse>;
  getTask(specId: string, taskId: string, signal?: AbortSignal): Promise<SpecificationTaskResponse>;
  getResources?(
    specId: string,
    taskId: string,
    token: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<TaskResourcePage>;
  getHistory?(
    specId: string,
    taskId: string,
    token: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<TaskHistoryPage>;
}

export function createRuntimeTaskApi(client: HttpRequestClient): TaskApi {
  return {
    getTaskList: (specId, query, signal) =>
      client.get<TaskListResponse>(
        `/api/specs/${encodeURIComponent(specId)}/tasks${query.blocking ? `?blocking=${query.blocking}` : ''}`,
        { signal },
      ),
    getResources: (specId, taskId, token, cursor, signal) =>
      client.get<TaskResourcePage>(taskPageUrl(specId, taskId, 'resources', token, cursor), {
        signal,
      }),
    getHistory: (specId, taskId, token, cursor, signal) =>
      client.get<TaskHistoryPage>(taskPageUrl(specId, taskId, 'history', token, cursor), {
        signal,
      }),
    getTask: (specId, taskId, signal) =>
      client.get<SpecificationTaskResponse>(
        '/api/specs/' + encodeURIComponent(specId) + '/tasks/' + encodeURIComponent(taskId),
        { signal },
      ),
  };
}

function taskPageUrl(specId: string, taskId: string, kind: string, token: string, cursor?: string) {
  const query = new URLSearchParams({ token });
  if (cursor) {
    query.set('cursor', cursor);
  }

  return `/api/specs/${encodeURIComponent(specId)}/tasks/${encodeURIComponent(taskId)}/${kind}?${query}`;
}

import type {
  ArchetypeCatalogue,
  CreateDocumentsInput,
  DocumentOperationInput,
  DocumentOperationResult,
} from '@nevo/specflow-contracts/documents';
import type { DocsSearchResult } from '@nevo/specflow-contracts/docs';
import type {
  CreateTaskInput,
  EditTaskInput,
  SetTaskStatusInput,
  TaskChangeResult,
  TaskDocumentTree,
  TaskRemoveResult,
  TaskStatusResult,
} from '@nevo/specflow-contracts/tasks';
import {
  WORKFLOW_ERROR_CODES,
  type WorkflowActionProjection,
  type WorkflowErrorCode,
} from '@nevo/specflow-contracts/workflow';
import type { ApiTransport, ErrorCodeRule, ErrorCodeTable } from '../../../api';

/**
 * Port of Task authoring: the workflow action projections (what the owner may do now), the Task
 * commands (create, edit, remove, status) and the Task documents. Every write names the revision it
 * was planned against where the contract has one; the Engine decides legality, the UI only renders
 * what the projections allow (`reference.api.task-reads`, "Task commands").
 */
export interface TaskAuthoringApi {
  specificationActions(specId: string, signal?: AbortSignal): Promise<WorkflowActionProjection>;
  taskActions(
    specId: string,
    taskId: string,
    signal?: AbortSignal,
  ): Promise<WorkflowActionProjection>;
  createTask(specId: string, input: CreateTaskInput): Promise<TaskChangeResult>;
  editTask(specId: string, taskId: string, input: EditTaskInput): Promise<TaskChangeResult>;
  removeTask(specId: string, taskId: string, expectedRevision: string): Promise<TaskRemoveResult>;
  setStatus(specId: string, taskId: string, input: SetTaskStatusInput): Promise<TaskStatusResult>;
  documentTree(specId: string, taskId: string, signal?: AbortSignal): Promise<TaskDocumentTree>;
  addDocuments(
    specId: string,
    taskId: string,
    input: CreateDocumentsInput,
  ): Promise<DocumentOperationResult>;
  operateDocument(
    specId: string,
    taskId: string,
    input: DocumentOperationInput,
  ): Promise<DocumentOperationResult>;
  /** The document types a new Task document may have (`GET /api/specs/archetypes`). */
  catalogue(signal?: AbortSignal): Promise<ArchetypeCatalogue>;
  /** Project documentation search (`GET /api/docs/search`), for project-document context. */
  searchProjectDocuments(query: string, signal?: AbortSignal): Promise<DocsSearchResult>;
}

const spec = (specId: string) => `/api/specs/${encodeURIComponent(specId)}`;
const task = (specId: string, taskId: string) =>
  `${spec(specId)}/tasks/${encodeURIComponent(taskId)}`;

/** How each workflow refusal is classified (`reference.api.specification-workflow`, "Refusals"). */
const RULES: Partial<Record<WorkflowErrorCode, ErrorCodeRule>> = {
  WORKFLOW_SUBJECT_NOT_FOUND: { kind: 'not-found', outcome: 'not-applied' },
  WORKFLOW_INPUT_INVALID: { kind: 'validation', outcome: 'not-applied' },
  WORKFLOW_RETURN_NOT_ALLOWED: { kind: 'validation', outcome: 'not-applied' },
  WORKFLOW_NOT_CONFIGURED: { kind: 'precondition', outcome: 'not-applied' },
  WORKFLOW_DEFINITION_MISSING: { kind: 'precondition', outcome: 'not-applied' },
  WORKFLOW_TASK_TYPE_NOT_ALLOWED: { kind: 'validation', outcome: 'not-applied' },
  WORKFLOW_TASK_TYPE_IMMUTABLE: { kind: 'validation', outcome: 'not-applied' },
  WORKFLOW_TASK_CONTEXT_UNRESOLVED: { kind: 'validation', outcome: 'not-applied' },
  WORKFLOW_STATE_CORRUPT: { kind: 'server' },
  WORKFLOW_UNAVAILABLE: { kind: 'unavailable', outcome: 'not-applied' },
  CONTROL_LOCK_BUSY: { kind: 'unavailable', outcome: 'not-applied', retryable: true },
  CONTROL_LOCK_CORRUPT: { kind: 'server' },
  CONTROL_LOCK_OWNERSHIP_LOST: { kind: 'server' },
  CONTROL_LOCK_INVALID_HOME: { kind: 'server' },
};

/** Every other workflow code is a 409 refusal: nothing was written. */
export const workflowErrorCodes: ErrorCodeTable = Object.fromEntries(
  WORKFLOW_ERROR_CODES.map((code) => [
    code,
    RULES[code] ?? { kind: 'conflict', outcome: 'not-applied' },
  ]),
);

export function createRuntimeTaskAuthoringApi(transport: ApiTransport): TaskAuthoringApi {
  return {
    specificationActions: (specId, signal) =>
      transport.get(`${spec(specId)}/workflow/actions`, {
        signal,
        operation: 'tasks.actions',
      }),
    taskActions: (specId, taskId, signal) =>
      transport.get(`${task(specId, taskId)}/workflow/actions`, {
        signal,
        operation: 'tasks.actions',
      }),
    createTask: (specId, input) =>
      transport.post(`${spec(specId)}/tasks`, input, { operation: 'tasks.create' }),
    editTask: (specId, taskId, input) =>
      transport.patch(task(specId, taskId), input, { operation: 'tasks.edit' }),
    removeTask: (specId, taskId, expectedRevision) =>
      transport.delete(
        `${task(specId, taskId)}?${new URLSearchParams({ expectedRevision }).toString()}`,
        { operation: 'tasks.remove' },
      ),
    setStatus: (specId, taskId, input) =>
      transport.put(`${task(specId, taskId)}/status`, input, { operation: 'tasks.status' }),
    documentTree: (specId, taskId, signal) =>
      transport.get(`${task(specId, taskId)}/document-tree`, {
        signal,
        operation: 'tasks.documents',
      }),
    addDocuments: (specId, taskId, input) =>
      transport.post(`${task(specId, taskId)}/documents`, input, {
        operation: 'tasks.documents.create',
      }),
    operateDocument: (specId, taskId, input) =>
      transport.post(`${task(specId, taskId)}/document-operations`, input, {
        operation: 'tasks.documents.operate',
      }),
    catalogue: (signal) =>
      transport.get('/api/specs/archetypes', { signal, operation: 'tasks.catalogue' }),
    searchProjectDocuments: (query, signal) =>
      transport.get(
        `/api/docs/search?${new URLSearchParams({ q: query, limit: '10' }).toString()}`,
        {
          signal,
          operation: 'tasks.docs-search',
        },
      ),
  };
}

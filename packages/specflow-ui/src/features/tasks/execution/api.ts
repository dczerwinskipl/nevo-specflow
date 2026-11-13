import type {
  AbandonSpecificationResult,
  FinishWorkflowRequest,
  FinishWorkflowResult,
  ReturnWorkflowRequest,
  ReturnWorkflowResult,
  StartWorkflowRequest,
  StartWorkflowResult,
} from '@nevo/specflow-contracts/workflow';
import type { ApiTransport, ErrorCodeTable } from '../../../api';

/** The workflow subject a command acts on: the Specification, or one of its Tasks. */
export interface WorkflowSubjectRef {
  readonly specId: string;
  readonly taskId?: string;
}

/** `GET /api/specs/:specId/close/preview`: the planned Close (only the operation id is used). */
export interface ClosePreviewResult {
  readonly operationId: string;
}

/** `POST /api/specs/:specId/close`: `completed`, or a Close that still needs attention. */
export interface CloseSpecificationResult {
  readonly operationId: string;
  readonly status: 'completed' | 'requires-resolution' | 'in-progress' | 'recovery-required';
}

/**
 * Port of manual workflow execution: the owner commands start, finish and return of a Specification
 * or a Task, abandon of a Specification, and its Close (preview, then the Close the preview planned).
 * The Engine decides; the UI only sends what the workflow projection offered
 * (`reference.api.specification-workflow`).
 */
export interface WorkflowExecutionApi {
  start(subject: WorkflowSubjectRef, input: StartWorkflowRequest): Promise<StartWorkflowResult>;
  finish(subject: WorkflowSubjectRef, input: FinishWorkflowRequest): Promise<FinishWorkflowResult>;
  returnTo(
    subject: WorkflowSubjectRef,
    input: ReturnWorkflowRequest,
  ): Promise<ReturnWorkflowResult>;
  abandon(specId: string, reason: string): Promise<AbandonSpecificationResult>;
  closePreview(specId: string, signal?: AbortSignal): Promise<ClosePreviewResult>;
  close(specId: string, operationId: string): Promise<CloseSpecificationResult>;
}

/** `CLOSE_BLOCKED` (409) carries the workflow blockers; every other Close code keeps its status. */
export const closeErrorCodes: ErrorCodeTable = {
  CLOSE_BLOCKED: { kind: 'conflict', outcome: 'not-applied' },
};

const workflowBase = ({ specId, taskId }: WorkflowSubjectRef) =>
  `/api/specs/${encodeURIComponent(specId)}${
    taskId === undefined ? '' : `/tasks/${encodeURIComponent(taskId)}`
  }/workflow`;
const specBase = (specId: string) => `/api/specs/${encodeURIComponent(specId)}`;

export function createRuntimeWorkflowExecutionApi(transport: ApiTransport): WorkflowExecutionApi {
  return {
    start: (subject, input) =>
      transport.post(`${workflowBase(subject)}/start`, input, { operation: 'workflow.start' }),
    finish: (subject, input) =>
      transport.post(`${workflowBase(subject)}/finish`, input, { operation: 'workflow.finish' }),
    returnTo: (subject, input) =>
      transport.post(`${workflowBase(subject)}/return`, input, { operation: 'workflow.return' }),
    abandon: (specId, reason) =>
      transport.post(
        `${specBase(specId)}/workflow/abandon`,
        { reason },
        { operation: 'workflow.abandon' },
      ),
    closePreview: (specId, signal) =>
      transport.get(`${specBase(specId)}/close/preview`, {
        signal,
        operation: 'workflow.close-preview',
      }),
    close: (specId, operationId) =>
      transport.post(`${specBase(specId)}/close`, { operationId }, { operation: 'workflow.close' }),
  };
}

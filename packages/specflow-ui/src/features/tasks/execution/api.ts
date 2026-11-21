import type {
  AbandonSpecificationResult,
  AgentStepExecutionCheck,
  AgentStepExecutionRequest,
  AgentStepExecutionResult,
  FinishWorkflowRequest,
  FinishWorkflowResult,
  ReevaluateWaitRequest,
  ReevaluateWaitResult,
  ReturnWorkflowRequest,
  ReturnWorkflowResult,
  StartWorkflowRequest,
  StartWorkflowResult,
} from '@nevo/specflow-contracts/workflow';
import type { CloseOccupancy, ClosePreview } from '@nevo/specflow-contracts/specs';
import type { ApiTransport, ErrorCodeTable } from '../../../api';

/** The workflow subject a command acts on: the Specification, or one of its Tasks. */
export interface WorkflowSubjectRef {
  readonly specId: string;
  readonly taskId?: string;
}

/**
 * `GET /api/specs/:specId/close/preview`: the planned Close: the operation id the confirm sends and
 * what it merges (or why it merges nothing).
 */
export type ClosePreviewResult = Pick<ClosePreview, 'operationId' | 'merge'>;

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
  reevaluateWait(specId: string, input: ReevaluateWaitRequest): Promise<ReevaluateWaitResult>;
  abandon(specId: string, reason: string): Promise<AbandonSpecificationResult>;
  /**
   * Whether an agent can run the step now, with every reason a start would refuse with, the
   * checkout's baseline included (`GET .../workflow/agent-execution/check`). The dialog reads it
   * when it opens.
   */
  checkAgentExecution(
    subject: WorkflowSubjectRef,
    signal?: AbortSignal,
  ): Promise<AgentStepExecutionCheck>;
  /** Run the step the owner was shown with an agent (`POST .../workflow/agent-execution`). */
  startAgentExecution(
    subject: WorkflowSubjectRef,
    input: AgentStepExecutionRequest,
  ): Promise<AgentStepExecutionResult>;
  closePreview(specId: string, signal?: AbortSignal): Promise<ClosePreviewResult>;
  /** What else holds the checkout a Close would remove (running agent Turns), without planning it. */
  closeOccupancy(specId: string, signal?: AbortSignal): Promise<CloseOccupancy>;
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
    reevaluateWait: (specId, input) =>
      transport.post(`${specBase(specId)}/workflow/reevaluate-wait`, input, {
        operation: 'workflow.reevaluate-wait',
      }),
    abandon: (specId, reason) =>
      transport.post(
        `${specBase(specId)}/workflow/abandon`,
        { reason },
        { operation: 'workflow.abandon' },
      ),
    checkAgentExecution: (subject, signal) =>
      transport.get(`${workflowBase(subject)}/agent-execution/check`, {
        signal,
        operation: 'workflow.agent-execution-check',
      }),
    startAgentExecution: (subject, input) =>
      transport.post(`${workflowBase(subject)}/agent-execution`, input, {
        operation: 'workflow.agent-execution',
      }),
    closePreview: (specId, signal) =>
      transport.get(`${specBase(specId)}/close/preview`, {
        signal,
        operation: 'workflow.close-preview',
      }),
    closeOccupancy: (specId, signal) =>
      transport.get(`${specBase(specId)}/close/occupancy`, {
        signal,
        operation: 'workflow.close-occupancy',
      }),
    close: (specId, operationId) =>
      transport.post(`${specBase(specId)}/close`, { operationId }, { operation: 'workflow.close' }),
  };
}

import type {
  AbandonSpecificationInput,
  AbandonSpecificationResult,
  ActionProjection,
  AgentResultDecisionInput,
  ConfirmAgentResultResult,
  FinishStepInput,
  RejectAgentResultInput,
  RejectAgentResultResult,
  FinishStepResult,
  OwnerActor,
  ReevaluateWaitInput,
  ReevaluateWaitResult,
  ReturnToStepInput,
  ReturnToStepResult,
  RetryAgentAttemptCommitInput,
  RetryAgentAttemptCommitResult,
  StartResult,
  WorkflowSubject,
} from '@nevo/specflow-engine';

/**
 * What the workflow routes need from the Engine, in the Engine's own shapes. The routes authorize,
 * derive the owner actor from the authenticated caller and map refusals; every workflow rule lives
 * behind this port. A port that fails throws the Engine's `WorkflowError`s.
 */
export interface WorkflowPort {
  actions(subject: WorkflowSubject): Promise<ActionProjection>;
  start(input: {
    readonly subject: WorkflowSubject;
    readonly actor: OwnerActor;
    readonly expectedWorkflowRevision?: string;
  }): Promise<StartResult>;
  finish(input: FinishStepInput): Promise<FinishStepResult>;
  return(input: ReturnToStepInput): Promise<ReturnToStepResult>;
  reevaluateWait(input: ReevaluateWaitInput): Promise<ReevaluateWaitResult>;
  abandon(input: AbandonSpecificationInput): Promise<AbandonSpecificationResult>;
  /** The owner's Retry commit of a finished agent attempt whose commit failed (D15). */
  retryAttemptCommit(input: RetryAgentAttemptCommitInput): Promise<RetryAgentAttemptCommitResult>;
  /** The owner's Confirm of an agent's result that waits for them (D17). */
  confirm(input: AgentResultDecisionInput): Promise<ConfirmAgentResultResult>;
  /** The owner's Reject of that result: back to its step with the owner's feedback. */
  reject(input: RejectAgentResultInput): Promise<RejectAgentResultResult>;
}

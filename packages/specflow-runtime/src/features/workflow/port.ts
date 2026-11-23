import type {
  AbandonSpecificationInput,
  AbandonSpecificationResult,
  ActionProjection,
  ConfirmAgentResultInput,
  ConfirmAgentResultResult,
  FinishStepInput,
  RejectAgentResultInput,
  RejectAgentResultResult,
  FinishStepResult,
  OwnerActor,
  OwnerReturnResult,
  ReevaluateWaitInput,
  ReevaluateWaitResult,
  ReturnToStepInput,
  RetryAgentAttemptCommitInput,
  RetryAgentAttemptCommitResult,
  StartResult,
  WorkflowHistory,
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
  /**
   * The owner's Return: applied now, or (D19) recorded on the agent attempt whose Turn may still
   * run. `principal` is the caller as the Session routes name it (the Turn is stopped as theirs).
   */
  return(input: ReturnToStepInput, principal: string): Promise<OwnerReturnResult>;
  /** The subject's Workflow history, an agent attempt with its step events and work (read-only). */
  history(subject: WorkflowSubject): Promise<WorkflowHistory>;
  reevaluateWait(input: ReevaluateWaitInput): Promise<ReevaluateWaitResult>;
  abandon(input: AbandonSpecificationInput): Promise<AbandonSpecificationResult>;
  /** The owner's Retry commit of a finished agent attempt whose commit failed or is pending (D15). */
  retryAttemptCommit(input: RetryAgentAttemptCommitInput): Promise<RetryAgentAttemptCommitResult>;
  /** The owner's Confirm of an agent's result that waits for them (D17). */
  confirm(input: ConfirmAgentResultInput): Promise<ConfirmAgentResultResult>;
  /** The owner's Reject of that result: back to its step with the owner's feedback. */
  reject(input: RejectAgentResultInput): Promise<RejectAgentResultResult>;
}

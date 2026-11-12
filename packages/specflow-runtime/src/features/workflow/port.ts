import type {
  AbandonSpecificationInput,
  AbandonSpecificationResult,
  ActionProjection,
  FinishStepInput,
  FinishStepResult,
  OwnerActor,
  ReturnToStepInput,
  ReturnToStepResult,
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
  abandon(input: AbandonSpecificationInput): Promise<AbandonSpecificationResult>;
}

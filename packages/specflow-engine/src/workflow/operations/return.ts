import type { ContinuationDecision } from '../continuation/resolve';
import { WorkflowError } from '../errors';
import { applyReturn, planReturn } from '../progression/progression';
import type { RunPosition, WorkflowSubject } from '../state/model';
import { advance, applyEffects, type AdvanceContext } from './advance';
import { isoNow, loadSubject, type WorkflowDependencies } from './loaded-execution';
import { ExecutionWorkingSet } from './working-set';

export interface ReturnToStepInput {
  readonly subject: WorkflowSubject;
  /** A step the workflow declares as a return target. */
  readonly step: string;
  /** What changed; carried to the step as its handoff. */
  readonly feedback?: string;
}

export interface ReturnToStepResult {
  readonly subject: WorkflowSubject;
  readonly position: RunPosition;
  readonly continuation: ContinuationDecision;
}

/**
 * "Back to the table": move a run to a declared earlier step from any non-terminal position, also
 * while the Specification waits for its Tasks. The return's effects (by default none; typically
 * blocking Tasks that have not started) apply in the same change. A return is an owner action, so
 * what follows always waits for the owner.
 *
 * A blocked Task is refused: it waits for the Specification, not for its owner.
 *
 * An attempt that was active ends as `returned`; stopping a Session still working on it is the
 * Runtime's responsibility.
 */
export function returnToStep(
  dependencies: WorkflowDependencies,
  request: ReturnToStepInput,
): Promise<ReturnToStepResult> {
  return dependencies.serialize(async () => {
    const { subject } = request;
    const snapshot = await dependencies.store.read(subject.specId);
    const loaded = loadSubject(dependencies.catalogue, snapshot, subject);
    if (loaded.task?.blocked) {
      throw new WorkflowError(
        'WORKFLOW_TASK_BLOCKED',
        `The Task "${loaded.task.taskId}" is blocked until the Specification is ready again.`,
      );
    }

    const entry = planReturn(loaded.run, loaded.definition, request.step, request.feedback);
    const context: AdvanceContext = {
      set: new ExecutionWorkingSet(snapshot),
      catalogue: dependencies.catalogue,
      at: isoNow(dependencies),
    };
    context.set.setRun(subject, applyReturn(loaded.run, entry, request.feedback, context.at));
    applyEffects(context, entry.effects);
    const continuation = advance(context, subject, loaded.definition, undefined, undefined);
    await dependencies.store.apply(subject.specId, context.set.change());

    return { subject, position: context.set.run(subject).position, continuation };
  });
}

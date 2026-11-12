import type { ContinuationDecision } from '../continuation/resolve';
import { decide, type RunPosition } from '@nevo/workflow';
import { WorkflowError } from '../errors';
import { assertFeedback } from '../input-schema';
import type { OwnerActor, WorkflowSubject } from '../state/model';
import { assertOwner } from './actors';
import { advance, applyEffects, type AdvanceContext } from './advance';
import { isoNow, loadSubject, loadTask, type WorkflowDependencies } from './loaded-execution';
import { ExecutionWorkingSet } from './working-set';

export interface ReturnToStepInput {
  readonly subject: WorkflowSubject;
  /** A step the workflow declares as a return target and the run has already reached. */
  readonly step: string;
  /** What changed; carried to the step as its handoff. */
  readonly feedback?: string;
  /** The owner, from trusted Runtime/CLI context; a return is an owner action. */
  readonly actor: OwnerActor;
}

export interface ReturnToStepResult {
  readonly subject: WorkflowSubject;
  readonly position: RunPosition;
  readonly continuation: ContinuationDecision;
}

/**
 * "Back to the table": move a run to a declared step it has already reached (earlier work, never a
 * step ahead) from any non-terminal position, also while the Specification waits for its Tasks. The
 * return's declared effects (by default none) apply in the same change; a return never changes a
 * Task's status by itself. A return is an owner action: it names the owner as its actor (anything
 * else is refused with `WORKFLOW_EXECUTOR_NOT_ALLOWED`), and what follows always waits for the owner.
 *
 * Only a `ready` Task returns: a Task on hold or cancelled cannot start, so its return would leave it
 * waiting for an owner start that is refused.
 *
 * An attempt that was active ends as `returned`; stopping a Session still working on it is the
 * Runtime's responsibility.
 */
export function returnToStep(
  dependencies: WorkflowDependencies,
  request: ReturnToStepInput,
): Promise<ReturnToStepResult> {
  return dependencies.serialize(async () => {
    assertOwner(request.actor, 'returns a run to an earlier step');
    const { subject } = request;
    const snapshot = await dependencies.store.read(subject.specId);
    const held =
      subject.kind === 'task'
        ? loadTask(dependencies.catalogue, snapshot, subject.taskId).task
        : undefined;
    if (held && held.status !== 'ready') {
      throw new WorkflowError(
        'WORKFLOW_TASK_BLOCKED',
        `The Task "${held.taskId}" is ${held.status}; only a ready Task can return.`,
      );
    }

    const loaded = loadSubject(dependencies.catalogue, snapshot, subject);
    assertFeedback(request.feedback);
    const context: AdvanceContext = {
      set: new ExecutionWorkingSet(snapshot, dependencies.catalogue),
      catalogue: dependencies.catalogue,
      at: isoNow(dependencies),
    };
    const decision = decide(loaded.definition, loaded.run, {
      kind: 'return',
      at: context.at,
      step: request.step,
      ...(request.feedback !== undefined ? { feedback: request.feedback } : {}),
    });
    context.set.setRun(subject, decision.nextRun);
    applyEffects(context, decision.declaredEffects);
    const continuation = advance(context, subject, loaded.definition, decision.intent);
    await dependencies.store.apply(subject.specId, context.set.change());

    return { subject, position: context.set.run(subject).position, continuation };
  });
}

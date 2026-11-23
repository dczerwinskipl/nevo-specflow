import type { ContinuationDecision } from '../continuation/resolve';
import { decide, type RunPosition } from '@nevo/workflow';
import { WorkflowError } from '../errors';
import { assertFeedback } from '../input-schema';
import type { OwnerActor, WorkflowSubject } from '../state/model';
import type { ExecutionChange, ExecutionSnapshot } from '../state/store';
import { assertOwner } from './actors';
import { advance, applyEffects, type AdvanceContext } from './advance';
import {
  isoNow,
  loadSubject,
  loadTask,
  ofSubject,
  type WorkflowDependencies,
} from './loaded-execution';
import type { PostActionResult } from './post-actions';
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
  /**
   * What the owner's commit of the return reported (`commit-execution-state` with automatic commits
   * off); absent where the host runs no post actions.
   */
  readonly postActions?: readonly PostActionResult[];
}

/**
 * The owner's commit of a return just applied (`afterOwnerChange`): an owner change is committed by
 * an owner's commit, so a later agent attempt never builds on it uncommitted.
 */
export async function withReturnCommitted<R extends ReturnToStepResult>(
  dependencies: Pick<WorkflowDependencies, 'postActions'>,
  request: ReturnToStepInput,
  result: R,
): Promise<R> {
  const postActions = await dependencies.postActions?.afterOwnerChange?.({
    subject: request.subject,
    phrase: `return to step ${request.step}${ofSubject(request.subject)}`,
  });

  return postActions !== undefined ? { ...result, postActions } : result;
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
 * Runtime's responsibility. The return is committed by the owner's commit once it applied
 * (`postActions`).
 */
export function returnToStep(
  dependencies: WorkflowDependencies,
  request: ReturnToStepInput,
): Promise<ReturnToStepResult> {
  const operation = dependencies.operation ?? ((work) => work());

  return operation(async () => {
    const result = await dependencies.serialize(async () => {
      assertOwner(request.actor, 'returns a run to an earlier step');
      const plan = planReturn(
        dependencies,
        await dependencies.store.read(request.subject.specId),
        request,
      );
      await dependencies.store.apply(request.subject.specId, plan.change);

      return plan.result;
    });

    return withReturnCommitted(dependencies, request, result);
  });
}

/** A return planned on a snapshot, nothing written: the one change that records it, and its result. */
export interface ReturnPlan {
  readonly change: ExecutionChange;
  readonly result: ReturnToStepResult;
}

/**
 * Every rule of a return, judged on `snapshot` without writing anything. The caller holds the
 * `serialize` section the snapshot was read in: an owner's return applies the change at once; the
 * finalize section of an agent attempt applies the owner's recorded return request (`workflow/agent`).
 */
export function planReturn(
  dependencies: WorkflowDependencies,
  snapshot: ExecutionSnapshot,
  request: ReturnToStepInput,
): ReturnPlan {
  assertOwner(request.actor, 'returns a run to an earlier step');
  const { subject } = request;
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

  return {
    change: {
      ...context.set.change(),
      summary: `return to step ${request.step}${ofSubject(subject)}`,
    },
    result: { subject, position: context.set.run(subject).position, continuation },
  };
}

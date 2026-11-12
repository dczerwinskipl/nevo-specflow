import type { ContinuationDecision } from '../continuation/resolve';
import { assertTaskDecisionShape } from '../input-schema';
import { assertOwner } from './actors';
import type { OwnerActor, TaskStatus, WorkflowSubject } from '../state/model';
import { decideTaskStatus, type TaskDecisionStatus } from '../tasks/tasks';
import { settleWait, type AdvanceContext } from './advance';
import { isoNow, type WorkflowDependencies } from './loaded-execution';
import { ExecutionWorkingSet } from './working-set';

export interface SetTaskStatusInput {
  readonly specId: string;
  readonly taskId: string;
  readonly status: TaskDecisionStatus;
  readonly reason?: string;
  /** The owner, from trusted Runtime/CLI context. */
  readonly actor: OwnerActor;
}

export interface SetTaskStatusResult {
  readonly subject: WorkflowSubject;
  readonly status: TaskStatus;
  /** What the Specification needs now, for example the next step after its wait completed. */
  readonly specification?: ContinuationDecision;
}

/**
 * The owner's decision on a Task's status (approve a draft, hold, resume, cancel), with the same
 * rules as the spec writer's `taskDecisions` (`decideTaskStatus`). It needs no Specification run. When
 * the Specification has one, it is brought up to date in the same change: cancelling the last open
 * Task completes its wait step, and resuming an escalated Task ends the escalation.
 */
export function setTaskStatus(
  dependencies: WorkflowDependencies,
  request: SetTaskStatusInput,
): Promise<SetTaskStatusResult> {
  return dependencies.serialize(async () => {
    assertOwner(request.actor, 'sets the status of a Task directly');

    const decision = {
      taskId: request.taskId,
      status: request.status,
      ...(request.reason !== undefined ? { reason: request.reason } : {}),
    };
    assertTaskDecisionShape(decision);
    const subject: WorkflowSubject = {
      kind: 'task',
      specId: request.specId,
      taskId: request.taskId,
    };
    const context: AdvanceContext = {
      set: new ExecutionWorkingSet(
        await dependencies.store.read(request.specId),
        dependencies.catalogue,
      ),
      catalogue: dependencies.catalogue,
      at: isoNow(dependencies),
    };
    const task = decideTaskStatus(context.set.task(request.taskId), decision, context.at);
    context.set.setTask(task);
    const specification = settleWait(context);
    await dependencies.store.apply(request.specId, context.set.change());

    return {
      subject,
      status: task.status,
      ...(specification && specification.kind !== 'none' ? { specification } : {}),
    };
  });
}

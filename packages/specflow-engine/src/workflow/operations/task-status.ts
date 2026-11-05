import type { ContinuationDecision } from '../continuation/resolve';
import { WorkflowError } from '../errors';
import { assertTaskDecisionShape } from '../input-schema';
import type { ExecutorRecord, TaskStatus, WorkflowSubject } from '../state/model';
import { decideTaskStatus, type TaskDecisionStatus } from '../tasks/tasks';
import { settleWait, updateTask, type AdvanceContext } from './advance';
import { isoNow, type WorkflowDependencies } from './loaded-execution';
import { ExecutionWorkingSet } from './working-set';

export interface SetTaskStatusInput {
  readonly specId: string;
  readonly taskId: string;
  readonly status: TaskDecisionStatus;
  readonly reason?: string;
  /** The owner, from trusted Runtime/CLI context. */
  readonly executor: ExecutorRecord;
}

export interface SetTaskStatusResult {
  readonly subject: WorkflowSubject;
  readonly status: TaskStatus;
  /** What the Specification's attention became, for example the next step after its wait completed. */
  readonly specification?: ContinuationDecision;
}

/**
 * The owner's decision on a Task's status (approve a draft, hold, resume, cancel), with the same
 * rules as the spec writer's `taskDecisions` (`decideTaskStatus`). The Specification is brought up to
 * date in the same change: cancelling the last open Task completes its wait step, and resuming an
 * escalated Task removes the escalation item.
 */
export function setTaskStatus(
  dependencies: WorkflowDependencies,
  request: SetTaskStatusInput,
): Promise<SetTaskStatusResult> {
  return dependencies.serialize(async () => {
    if (request.executor.kind !== 'human') {
      throw new WorkflowError(
        'WORKFLOW_EXECUTOR_NOT_ALLOWED',
        'Only the owner sets the status of a Task directly.',
      );
    }

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
      set: new ExecutionWorkingSet(await dependencies.store.read(request.specId)),
      catalogue: dependencies.catalogue,
      at: isoNow(dependencies),
    };
    context.set.specification();
    const task = decideTaskStatus(context.set.task(request.taskId), decision, context.at);
    updateTask(context, task);
    const specification = settleWait(context);
    await dependencies.store.apply(request.specId, context.set.change());

    return {
      subject,
      status: task.status,
      ...(specification && specification.kind !== 'none' ? { specification } : {}),
    };
  });
}

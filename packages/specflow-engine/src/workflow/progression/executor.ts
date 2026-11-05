import type { WorkStep } from '../definitions/model';
import { WorkflowError } from '../errors';
import type { AttemptRecord, ExecutorRecord } from '../state/model';

function notAllowed(message: string): never {
  throw new WorkflowError('WORKFLOW_EXECUTOR_NOT_ALLOWED', message);
}

/**
 * The executor contract of a work step, shared by start and finish. Every start and finish names
 * its executor, and its kind is the step's (`agent` or `human`). An active agent attempt that runs in
 * a Session is resumed and finished only by that Session (same provider and Session id); handing an
 * agent step to the owner is not a finish.
 *
 * @param active The active attempt being resumed or finished; absent when a step is activated.
 */
export function assertExecutorAllowed(
  step: WorkStep,
  executor: ExecutorRecord | undefined,
  active?: AttemptRecord,
): asserts executor is ExecutorRecord {
  if (!executor) {
    notAllowed(`The step "${step.id}" needs the executor that works on it.`);
  }

  if (executor.kind !== step.executor) {
    notAllowed(
      step.executor === 'human'
        ? `An agent cannot do the human step "${step.id}".`
        : `The agent step "${step.id}" is done by an agent, not by a person.`,
    );
  }

  const started = active?.executor;
  if (
    executor.kind === 'agent' &&
    started?.kind === 'agent' &&
    started.sessionId !== undefined &&
    (executor.provider !== started.provider || executor.sessionId !== started.sessionId)
  ) {
    notAllowed(`Only the Session that works on "${step.id}" can resume or finish it.`);
  }
}

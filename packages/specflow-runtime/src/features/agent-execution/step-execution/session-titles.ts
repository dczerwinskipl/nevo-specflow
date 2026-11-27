import { readAgentSessionOrigins, type WorkflowDependencies } from '@nevo/specflow-engine';
import type { AgentStepOrigin } from '@nevo/specflow-contracts/sessions';

import { GENERIC_AGENT_SESSION_TITLE, sessionTitleOf } from './operation';

export { GENERIC_AGENT_SESSION_TITLE };

/** The title to show for a Session: the derived one replaces only none or the generic one. */
export function shownSessionTitle(
  stored: string | undefined,
  derived: string | undefined,
): string | undefined {
  return derived !== undefined && (stored === undefined || stored === GENERIC_AGENT_SESSION_TITLE)
    ? derived
    : stored;
}

/**
 * The agent step origin of each agent step execution Session of a Specification, by Session id,
 * as Session reads expose it (`agentStep`), from the committed attempt records.
 */
export async function agentStepOrigins(
  openWorkflow: () => Promise<Pick<WorkflowDependencies, 'catalogue' | 'store'>>,
  specId: string,
): Promise<ReadonlyMap<string, AgentStepOrigin>> {
  const origins = await readAgentSessionOrigins(await openWorkflow(), specId);

  return new Map(
    [...origins].map(([sessionId, origin]) => [
      sessionId,
      {
        stepId: origin.step.id,
        stepTitle: origin.step.title,
        attempt: origin.attempt,
        ...(origin.task ? { taskId: origin.task.id, taskTitle: origin.task.title } : {}),
      },
    ]),
  );
}

/** The title of an agent step Session from its origin (`sessionTitleOf`). */
export function agentStepTitle(origin: AgentStepOrigin): string {
  return sessionTitleOf({
    step: { id: origin.stepId, title: origin.stepTitle },
    attempt: origin.attempt,
    ...(origin.taskId !== undefined
      ? { task: { id: origin.taskId, title: origin.taskTitle ?? origin.taskId } }
      : {}),
  });
}

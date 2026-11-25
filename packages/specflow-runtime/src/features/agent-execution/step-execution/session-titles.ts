import { readAgentSessionOrigins, type WorkflowDependencies } from '@nevo/specflow-engine';

import { GENERIC_AGENT_SESSION_TITLE, sessionTitleOf } from './operation';

export { GENERIC_AGENT_SESSION_TITLE };

/**
 * The titles of a Specification's agent step Sessions, by Session id, derived at read time from the
 * committed run records ("Break the solution down · attempt 2", with the Task title for a Task
 * subject; `sessionTitleOf`), so a Session created before it was titled so reads the same as a new
 * one. Nothing is migrated or written.
 */
export async function agentSessionTitles(
  openWorkflow: () => Promise<Pick<WorkflowDependencies, 'catalogue' | 'store'>>,
  specId: string,
): Promise<ReadonlyMap<string, string>> {
  const origins = await readAgentSessionOrigins(await openWorkflow(), specId);

  return new Map(
    [...origins].map(([sessionId, origin]) => [
      sessionId,
      sessionTitleOf({
        step: origin.step,
        attempt: origin.attempt,
        ...(origin.task ? { task: origin.task } : {}),
      }),
    ]),
  );
}

/** The title to show for a Session: the derived one replaces only none or the generic one. */
export function shownSessionTitle(
  stored: string | undefined,
  derived: string | undefined,
): string | undefined {
  return derived !== undefined && (stored === undefined || stored === GENERIC_AGENT_SESSION_TITLE)
    ? derived
    : stored;
}

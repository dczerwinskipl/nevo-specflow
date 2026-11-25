import type { AgentStepOrigin } from '@nevo/specflow-contracts/sessions';

/** The title an agent Session was created with before it was named by its step and attempt. */
const GENERIC_TITLE = 'Agent step execution';

/** The title the Runtime gives a new agent step Session ("<step> · attempt <n>[ · <task>]"). */
function systemTitle(origin: AgentStepOrigin): string {
  return `${origin.stepTitle} · attempt ${String(origin.attempt)}${
    origin.taskTitle !== undefined ? ` · ${origin.taskTitle}` : ''
  }`;
}

/**
 * A Session's title line. An agent step Session is named by its step (with its Task's title), the
 * attempt going to the facts line; a title the owner gave it wins. A title is the owner's when it
 * is neither absent, the old generic one nor the one the Runtime made from the same origin.
 */
export function sessionTitleOf(
  title: string | undefined,
  agentStep: AgentStepOrigin | undefined,
): string | undefined {
  if (!agentStep) {
    return title;
  }

  const system = systemTitle(agentStep);
  const ownersTitle =
    title !== undefined &&
    title !== GENERIC_TITLE &&
    title !== system &&
    // The Runtime cuts a long title at 256 characters with an ellipsis.
    !(title.endsWith('…') && system.startsWith(title.slice(0, -1)));

  if (ownersTitle) {
    return title;
  }

  return agentStep.taskTitle !== undefined
    ? `${agentStep.stepTitle} · ${agentStep.taskTitle}`
    : agentStep.stepTitle;
}

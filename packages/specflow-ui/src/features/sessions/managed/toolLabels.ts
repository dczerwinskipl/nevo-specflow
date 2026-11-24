import type { TFunction } from 'i18next';
import type {
  ToolActionSummary,
  ToolOperation,
  WorkSummary,
} from '@nevo/specflow-contracts/sessions';

/**
 * One wording of a tool operation for the Work history rows and the ToolAction detail, so both say
 * the same: what was done ("Ran command"), in the UI's own words, followed by what it acted on (the
 * Runtime's language-neutral `subject`: a workspace-relative path, a command's first line). A
 * provider's tool name only stands in for an operation the UI has no words for.
 */
export function toolVerb(t: TFunction, operation: ToolOperation | undefined, tool: string): string {
  return operation && operation !== 'other'
    ? t(`managedSession.toolVerb.${operation}`)
    : tool || t('managedSession.toolVerb.other');
}

/** "Ran command · mkdir -p …": the verb, then the subject when there is one. */
export function toolLabel(
  t: TFunction,
  operation: ToolOperation | undefined,
  tool: string,
  subject: string | undefined,
): string {
  const verb = toolVerb(t, operation, tool);

  return subject ? `${verb} · ${subject}` : verb;
}

/** A ToolAction's heading and subject line (its detail header). */
export function toolActionHeading(
  t: TFunction,
  action: Pick<ToolActionSummary, 'operation' | 'title' | 'subject'>,
): { heading: string; subject?: string } {
  return {
    heading: toolVerb(t, action.operation, action.title.text),
    ...(action.subject ? { subject: action.subject } : {}),
  };
}

/**
 * The title of a Work row on the Work history rail. Tool Work: its first action's label, and how
 * many more it holds. A permission: its decision (or that it waits for the person) before the
 * operation it is for. Work without a subject keeps the Runtime's own title.
 */
export function workItemTitle(t: TFunction, item: WorkSummary): string {
  if (item.kind === 'tool' && (item.operation || item.subject)) {
    const label = toolLabel(t, item.operation, item.title.text, item.subject);
    const more = (item.actionCount ?? 0) - 1;

    return more > 0 ? t('managedSession.toolVerb.andMore', { label, count: more }) : label;
  }

  if (item.kind === 'interaction' && (item.operation || item.subject)) {
    const label = toolLabel(t, item.operation, item.title.text, item.subject);
    const state =
      item.decision ??
      (['queued', 'active', 'waiting'].includes(item.state) ? 'waiting' : undefined);

    return state ? t(`managedSession.permissionState.${state}`, { label }) : label;
  }

  return item.title.text;
}

/** The failure line of a tool Work row: what failed, then why. */
export function workFailureText(item: WorkSummary): string | undefined {
  return item.failure
    ? item.failure.subject
      ? `${item.failure.subject}: ${item.failure.message}`
      : item.failure.message
    : undefined;
}

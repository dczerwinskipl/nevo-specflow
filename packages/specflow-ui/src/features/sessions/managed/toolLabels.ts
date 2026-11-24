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

/** A Work row's title in two parts: the emphasised label, then the subject it acted on. */
export interface WorkTitleParts {
  /** "Ran command", "Wrote file and 2 more", "Allowed", "Waiting for you". */
  label: string;
  /** The command, path or pattern: shown as an identifier, never emphasised. */
  subject?: string;
}

/**
 * The title of a Work row on the Work history rail. Tool Work: what its first action did, and how
 * many more it holds. A permission: what the person decided (or that it waits for them, or only
 * that it was answered when the decision was not kept). Then the subject. Work without one keeps
 * the Runtime's own title.
 */
export function workItemTitleParts(t: TFunction, item: WorkSummary): WorkTitleParts {
  const subject = item.subject ? { subject: item.subject } : {};
  if (item.kind === 'tool' && (item.operation || item.subject)) {
    const verb = toolVerb(t, item.operation, item.title.text);
    const more = (item.actionCount ?? 0) - 1;

    return {
      label: more > 0 ? t('managedSession.toolVerb.andMore', { label: verb, count: more }) : verb,
      ...subject,
    };
  }

  if (item.kind === 'interaction' && (item.operation || item.subject)) {
    const state =
      item.decision ??
      (['queued', 'active', 'waiting'].includes(item.state)
        ? 'waiting'
        : item.state === 'completed'
          ? 'answered'
          : undefined);

    return {
      label: state
        ? t(`managedSession.permissionState.${state}`)
        : toolVerb(t, item.operation, item.title.text),
      ...subject,
    };
  }

  return { label: item.title.text };
}

/** The same title as one line of text (search, the actions screen's heading). */
export function workItemTitle(t: TFunction, item: WorkSummary): string {
  const { label, subject } = workItemTitleParts(t, item);

  return subject ? `${label} · ${subject}` : label;
}

/**
 * The failure line of a tool Work row: a reason the UI knows in its own words (the raw text stays
 * in the detail), else the provider's reason; the file is already the row's subject.
 */
export function workFailureText(t: TFunction, item: WorkSummary): string | undefined {
  if (!item.failure) {
    return undefined;
  }

  if (item.failure.reason && (knownFailures as readonly string[]).includes(item.failure.reason)) {
    return t(
      `managedSession.failureReason.${item.failure.reason as (typeof knownFailures)[number]}`,
    );
  }

  return item.failure.subject && item.failure.subject !== item.subject
    ? `${item.failure.subject}: ${item.failure.message}`
    : item.failure.message;
}

const knownFailures = ['outside-worktree'] as const;

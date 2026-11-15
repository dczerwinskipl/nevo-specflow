import type { TFunction } from 'i18next';
import type { GateStatus, OpenTask, WorkflowActor } from '@nevo/specflow-contracts/workflow';

/** The recorded identity of the trusted local person (no authentication configured). */
const TRUSTED_LOCAL_ACTOR = 'runtime:trusted-local';

/**
 * A person as recorded (`user:ann`, `local:ann`): "you" for the viewer or the trusted local person,
 * else the id without its identity-source prefix (the id itself is shown as it is).
 */
export function personLabel(t: TFunction, actorId: string, viewerId?: string): string {
  if (
    actorId === TRUSTED_LOCAL_ACTOR ||
    (viewerId !== undefined && actorId === `user:${viewerId}`)
  ) {
    return t('workflowExecution.actor.you');
  }

  return actorId.replace(/^(local|user):/, '');
}

/** Who acted, as recorded: a person by {@link personLabel}, an agent by provider and model. */
export function actorLabel(t: TFunction, actor: WorkflowActor, viewerId?: string): string {
  if (actor.class === 'human') {
    return personLabel(t, actor.details.actorId, viewerId);
  }

  return [actor.details.provider, actor.details.model].filter(Boolean).join(' · ');
}

/** `needs-changes` -> `Needs changes`: the fallback for an id that has no label. */
export function humanizeId(id: string): string {
  const words = id.replace(/[-_.]+/g, ' ').trim();

  return words ? words[0]!.toUpperCase() + words.slice(1) : id;
}

/** A transition as people read it: its label, its result, else its id made readable. */
export function transitionLabel(transition: {
  readonly id: string;
  readonly label?: string;
  readonly result?: string;
}): string {
  return transition.label ?? transition.result ?? humanizeId(transition.id);
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * A recorded time as people say it: `Today 11:40`, `Yesterday 17:20`, else a short date and time.
 * With `timeOnlyToday`, a time today is just `11:40` (the Now block's running attempt). An
 * unreadable value is shown as it is.
 */
export function formatWhen(
  t: TFunction,
  at: string,
  locale: string,
  options: { readonly now?: Date; readonly timeOnlyToday?: boolean } = {},
): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) {
    return at;
  }

  const now = options.now ?? new Date();
  const time = new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(date);
  if (sameDay(date, now)) {
    return options.timeOnlyToday ? time : t('workflowExecution.time.today', { time });
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(date, yesterday)) {
    return t('workflowExecution.time.yesterday', { time });
  }

  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/** What an unmet gate is missing, in one clause (`none registered yet`). */
export function gateDetail(t: TFunction, gate: GateStatus): string | undefined {
  if (gate.status === 'satisfied') {
    return undefined;
  }

  switch (gate.reason) {
    case 'no-document':
      return t('workflowExecution.gate.noDocument');
    case 'file-missing':
      return t('workflowExecution.gate.fileMissing');
    case 'sections-missing':
      return t('workflowExecution.gate.sectionsMissing', {
        sections: (gate.missingSections ?? []).join(', '),
      });
    case 'unreadable':
      return t('workflowExecution.gate.unreadable');
    default:
      return undefined;
  }
}

export interface PreviewStep {
  readonly id: string;
  readonly title: string;
  readonly next: readonly string[];
}

/**
 * What changed between the workflow the owner confirmed and the one a start would pin now, one
 * sentence each: added, removed and renamed steps, and steps whose transitions lead elsewhere.
 */
export function workflowChanges(
  t: TFunction,
  before: readonly PreviewStep[],
  after: readonly PreviewStep[],
): string[] {
  const old = new Map(before.map((step) => [step.id, step]));
  const now = new Map(after.map((step) => [step.id, step]));
  const changes: string[] = [];
  after.forEach((step, index) => {
    const previous = old.get(step.id);
    if (!previous) {
      const preceding = after[index - 1]?.title;
      changes.push(
        preceding
          ? t('workflowExecution.change.addedAfter', { step: step.title, after: preceding })
          : t('workflowExecution.change.added', { step: step.title }),
      );
    } else if (previous.title !== step.title) {
      changes.push(t('workflowExecution.change.renamed', { from: previous.title, to: step.title }));
    } else if (previous.next.join() !== step.next.join()) {
      changes.push(t('workflowExecution.change.transitions', { step: step.title }));
    }
  });
  for (const step of before) {
    if (!now.has(step.id)) {
      changes.push(t('workflowExecution.change.removed', { step: step.title }));
    }
  }

  return changes;
}

/**
 * The open Tasks a completion waits for, in running text (`api is in progress, screen waits for
 * other tasks`), with the cause words of the stuck explanation.
 */
export function openTasksText(t: TFunction, tasks: readonly OpenTask[]): string {
  return tasks
    .map((task) => `${task.taskId} ${t(`taskOverview.stuck.cause.${task.cause}`)}`)
    .join(', ');
}

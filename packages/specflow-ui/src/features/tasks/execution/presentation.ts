import type { TFunction } from 'i18next';
import type { GateStatus, WorkflowActor } from '@nevo/specflow-contracts/workflow';

/**
 * Who acted, as recorded: a person by the id the Runtime recorded (without the `local:` or `user:`
 * prefix of the identity source; the id itself is shown as it is), an agent by provider and model.
 */
export function actorLabel(actor: WorkflowActor): string {
  if (actor.class === 'human') {
    return actor.details.actorId.replace(/^(local|user):/, '');
  }

  return [actor.details.provider, actor.details.model].filter(Boolean).join(' · ');
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

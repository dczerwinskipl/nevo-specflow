import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Timeline, Typography, type IconName, type TimelineTone } from '@nevo/ui';
import { actorLabel, humanizeId, transitionLabel } from '../presentation';
import { useViewer } from '../useViewer';
import {
  AgentAttemptHistory,
  AgentAttemptMeta,
  attemptOutcome,
  attemptTimeLine,
  HistoryFeedback,
  outcomeTextClass,
  type AgentHistoryItem,
  type AttemptOutcomeView,
  type HistoryItem,
} from './AgentAttemptHistory';
import { useAgentTitles } from './modelTitles';
import type { WorkflowTimelineEntry } from './workflowTimeline';
import type { AttemptRef } from '../StartBlockerLines';

/** The feedback an attempt's result or return left, if any. */
function feedbackOf(item: Extract<HistoryItem, { kind: 'attempt' }>): string | undefined {
  const outcome = item.outcome;

  return outcome?.kind === 'transition' || outcome?.kind === 'returned'
    ? outcome.feedback
    : undefined;
}

/** A step by its title, as the history titles its entries. */
function stepTitleOf(items: readonly HistoryItem[], step: string): string {
  const found = items.find((item) => item.kind === 'attempt' && item.step === step);

  return found?.kind === 'attempt' && found.stepTitle ? found.stepTitle : humanizeId(step);
}

/** The time of day of one instant; the day is the group's heading. */
function timeOfDay(at: string, locale: string): string {
  const date = new Date(at);

  return Number.isNaN(date.getTime())
    ? at
    : new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(date);
}

/** How an attempt without an agent's detail ended, with the marks of the agent attempts. */
function plainOutcome(
  t: TFunction,
  item: Extract<WorkflowTimelineEntry, { kind: 'attempt' }>['item'],
  items: readonly HistoryItem[],
): AttemptOutcomeView {
  const outcome = item.outcome;
  if (!item.endedAt || !outcome) {
    return {
      label: t('taskDetails.historyInProgress'),
      icon: 'loader',
      tone: 'info',
      toned: true,
    };
  }

  switch (outcome.kind) {
    case 'transition': {
      const label = transitionLabel({
        id: outcome.transition,
        ...(item.transitionLabel !== undefined ? { label: item.transitionLabel } : {}),
        ...(outcome.result !== undefined ? { result: outcome.result } : {}),
      });

      return outcome.result === 'fail'
        ? { label, icon: 'circle-alert', tone: 'attention', toned: true }
        : { label, icon: 'circle-check', tone: 'success', toned: true };
    }

    case 'returned':
      return {
        label: t('workflowExecution.attemptHistory.outcome.returned', {
          step: stepTitleOf(items, outcome.to),
        }),
        icon: 'undo',
        tone: 'neutral',
        toned: false,
      };
    case 'abandoned':
      return {
        label: t('workflowExecution.attemptHistory.outcome.abandoned'),
        icon: 'close',
        tone: 'neutral',
        toned: false,
      };
    case 'taken-over':
      // The owner's attempt ended when they handed the step to the agent (Hand to agent).
      return {
        label: items.some(
          (next) =>
            next.kind === 'attempt' &&
            next.step === item.step &&
            next.attempt === item.attempt + 1 &&
            next.agent?.handedOverFrom?.attempt === item.attempt,
        )
          ? t('workflowExecution.attemptHistory.outcome.handedToAgent')
          : t('workflowExecution.attemptHistory.outcome.takenOver'),
        icon: 'undo',
        tone: 'neutral',
        toned: false,
      };
  }
}

/** One entry of the timeline: the shared mark, the step as its title, then its lines. */
function Entry({
  icon,
  tone,
  iconClassName,
  title,
  children,
}: {
  readonly icon: IconName;
  readonly tone: TimelineTone;
  readonly iconClassName?: string | undefined;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <Timeline.Item>
      <Timeline.Marker icon={icon} tone={tone} {...(iconClassName ? { iconClassName } : {})} />
      <Timeline.Content
        title={
          <span role="heading" aria-level={3}>
            {title}
          </span>
        }
      >
        <div className="grid min-w-0 gap-1 [overflow-wrap:anywhere]" data-attempt-entry="">
          {children}
        </div>
      </Timeline.Content>
    </Timeline.Item>
  );
}

function OutcomeLine({ outcome }: { readonly outcome: AttemptOutcomeView }) {
  return (
    <Typography
      as="p"
      variant="body-sm"
      className={outcomeTextClass(outcome)}
      data-attempt-outcome=""
    >
      {outcome.label}
    </Typography>
  );
}

function MetaLine({ children }: { readonly children: string }) {
  return (
    <Typography as="p" variant="body-sm" className="text-content-muted" data-attempt-time="">
      {children}
    </Typography>
  );
}

/**
 * One workflow entry of a Specification's Activity history (workflow-execution.md, "Activity
 * history"), in the grammar of the agent attempts: marked by how it ended, titled by its step, the
 * outcome line, then when, who and which attempt. An agent attempt adds its agent with Open session,
 * what it changed and its commit; the owner's own attempt, their Confirm or Reject and their return
 * say who acted in the time line, as the Task history does. Feedback is behind View feedback, open
 * for the attempt the reader came from "Open full feedback" for (`feedback`).
 */
export function WorkflowHistoryEntry({
  entry,
  items,
  specId,
  openDocument,
  feedback,
}: {
  readonly entry: WorkflowTimelineEntry;
  /** The whole history: an attempt that took another over names who did. */
  readonly items: readonly HistoryItem[];
  readonly specId: string;
  readonly openDocument?: ((path: string) => boolean) | undefined;
  /** The attempt whose feedback the reader opened from the Now block. */
  readonly feedback?: AttemptRef | undefined;
}) {
  const { t, i18n } = useTranslation();
  const viewer = useViewer();
  const titles = useAgentTitles(specId);
  // The attempt's result left the feedback: its own entry opens it, never its later Confirm.
  const feedbackOpen =
    (entry.kind === 'agent-attempt' || entry.kind === 'attempt') &&
    entry.item.step === feedback?.step &&
    entry.item.attempt === feedback.attempt;

  switch (entry.kind) {
    case 'agent-attempt': {
      const item: AgentHistoryItem = entry.item;
      const outcome = attemptOutcome(t, item, items, viewer);

      return (
        <Entry
          icon={outcome.icon}
          tone={outcome.tone}
          iconClassName={outcome.iconClassName}
          title={item.stepTitle || item.step}
        >
          <OutcomeLine outcome={outcome} />
          {/* The day is the group's heading. */}
          <AgentAttemptMeta item={item} withDay={false} />
          <AgentAttemptHistory
            item={item}
            items={items}
            subject={{ specId }}
            feedback={feedbackOf(item)}
            feedbackOpen={feedbackOpen}
            showOutcome={false}
            {...(openDocument ? { openDocument } : {})}
          />
        </Entry>
      );
    }

    case 'attempt': {
      const { item } = entry;
      const outcome = plainOutcome(t, item, items);

      return (
        <Entry
          icon={outcome.icon}
          tone={outcome.tone}
          iconClassName={
            outcome.icon === 'loader' ? 'animate-spin motion-reduce:animate-none' : undefined
          }
          title={item.stepTitle || item.step}
        >
          <OutcomeLine outcome={outcome} />
          <MetaLine>
            {attemptTimeLine(
              t,
              item,
              i18n.language,
              false,
              actorLabel(t, item.actor, viewer, titles),
            )}
          </MetaLine>
          <HistoryFeedback
            feedback={feedbackOf(item)}
            attention={outcome.tone === 'attention'}
            open={feedbackOpen}
          />
        </Entry>
      );
    }

    case 'confirmation': {
      const { item, confirmation } = entry;
      const rejected = confirmation.state === 'rejected';
      const outcome: AttemptOutcomeView = rejected
        ? {
            label: t('workflowExecution.attemptHistory.outcome.rejected'),
            icon: 'circle-alert',
            tone: 'attention',
            toned: true,
          }
        : {
            label: t('workflowExecution.attemptHistory.event.confirmed'),
            icon: 'circle-check',
            tone: 'success',
            toned: true,
          };

      return (
        <Entry icon={outcome.icon} tone={outcome.tone} title={item.stepTitle || item.step}>
          <OutcomeLine outcome={outcome} />
          <MetaLine>
            {[
              timeOfDay(confirmation.at, i18n.language),
              actorLabel(t, confirmation.actor, viewer, titles),
              t('taskDetails.attempt', { count: item.attempt }),
            ].join(' · ')}
          </MetaLine>
          <HistoryFeedback feedback={confirmation.feedback} attention={rejected} />
        </Entry>
      );
    }

    case 'return': {
      const { item } = entry;

      return (
        <Entry
          icon="undo"
          tone="neutral"
          title={t('workflowExecution.attemptHistory.outcome.returned', {
            step: stepTitleOf(items, item.to),
          })}
        >
          <MetaLine>{timeOfDay(item.at, i18n.language)}</MetaLine>
          <HistoryFeedback feedback={item.feedback} />
        </Entry>
      );
    }
  }
}

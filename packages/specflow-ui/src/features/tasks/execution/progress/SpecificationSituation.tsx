import type { ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Icon, cn, type IconName } from '@nevo/ui';
import type { CurrentSpecWorkflow } from '@nevo/specflow-contracts/specs/overview';
import type { AttentionItem } from '../../../specs/read-model';
import { translateMessage } from '../../../../i18n/message';
import { attentionHeadline } from '../../overview/attentionWording';
import {
  actorLabel,
  attemptLine,
  formatWhen,
  positionTrack,
  type StepTrack,
  type Viewer,
} from '../presentation';
import { useViewer } from '../useViewer';
import { handoffView } from './handoffView';
import { StepProgress } from './StepProgress';

/** The workflow attention a list row leads with: the Overview's first item, and how many there are. */
export interface SituationAttention {
  readonly first: AttentionItem;
  readonly taskTitles?: Readonly<Record<string, string>>;
  readonly count: number;
}

/** What a Specifications list row says about where its workflow stands. */
export interface Situation {
  readonly title: string;
  readonly icon?: { readonly name: IconName; readonly className: string };
  readonly tone?: 'attention' | 'success' | 'muted';
  readonly track?: StepTrack;
  /** The line beside the track's label: who works on the step, what it waits for, when it ended. */
  readonly detail?: string;
  /** `detail` is a date (`abandonedAt`): the row marks it up as one. */
  readonly dateTime?: string;
}

type Step = Extract<CurrentSpecWorkflow, { kind: 'step' }>;

/** The track of a list row's position, in the Now's words (`positionTrack`). */
function trackOf(t: TFunction, workflow: CurrentSpecWorkflow): StepTrack | undefined {
  switch (workflow.kind) {
    case 'not-started':
      return workflow.stepCount && workflow.firstStep !== undefined
        ? positionTrack(t, {
            kind: 'not-started',
            total: workflow.stepCount,
            firstStep: workflow.firstStep,
          })
        : undefined;
    case 'step':
      return workflow.step
        ? positionTrack(t, {
            kind: 'current',
            position: workflow.step.position,
            total: workflow.step.count,
            title: workflow.step.title,
          })
        : undefined;
    case 'ended':
      // A finished row says that it ended; where an abandoned run stopped is the Overview's.
      return undefined;
  }
}

/**
 * Who or what the step waits for, in the Now's words: the running attempt ("In progress since
 * 11:18 · started by you", "Attempt 1 · agent working since 11:18"), a hand-off the next attempt must
 * act on ("Changes requested"), "Ready to start", or the wait step's Tasks ("5 ready to start",
 * "Waiting for 7 of 12 tasks").
 */
function stepDetail(
  t: TFunction,
  workflow: Step,
  context: { readonly locale: string; readonly viewer: Viewer },
): string | undefined {
  switch (workflow.state) {
    case 'active': {
      const attempt = workflow.attempt;
      if (!attempt) {
        return undefined;
      }

      const since = formatWhen(t, attempt.startedAt, context.locale, { timeOnlyToday: true });

      return attempt.actor.class === 'agent'
        ? t('workflowExecution.agentAttempt.line.working', { attempt: attempt.number, since })
        : attemptLine(t, {
            number: attempt.number,
            since,
            actor: actorLabel(t, attempt.actor, context.viewer),
          });
    }

    case 'ready': {
      const handoff = workflow.handoff
        ? handoffView(t, workflow.handoff, { locale: context.locale, viewer: context.viewer })
        : undefined;

      return handoff?.tone === 'blocking' ? handoff.outcome : t('workflowExecution.now.ready');
    }

    case 'waiting': {
      const tasks = workflow.tasks;
      if (!tasks) {
        return undefined;
      }

      // What the owner can start first, else what is left (the Now's Task progress and wait line).
      return tasks.readyToStart > 0
        ? t('taskOverview.progress.readyToStart', { count: tasks.readyToStart })
        : t('workflowExecution.now.waitingFor', { count: tasks.open, total: tasks.total });
    }
  }
}

/**
 * A list row's situation, in the Overview's own words: the Now's title and step track, the Now's
 * line about the step, or, when the workflow needs a person, the action of the item the Overview's
 * Requires attention lists first ("Start Review the breakdown") with how many more there are. Pure.
 */
export function situationOf(
  t: TFunction,
  workflow: CurrentSpecWorkflow,
  context: {
    readonly locale: string;
    readonly viewer?: Viewer;
    readonly attention?: SituationAttention;
  },
): Situation {
  const viewer = context.viewer ?? {};
  const track = trackOf(t, workflow);
  const attention = context.attention;
  if (attention) {
    const more = attention.count - 1;

    return {
      title: translateMessage(
        t,
        attentionHeadline(attention.first, attention.taskTitles),
        context.locale,
      ),
      icon: { name: 'triangle-alert', className: 'text-status-attention' },
      tone: 'attention',
      ...(track ? { track } : {}),
      ...(more > 0 ? { detail: t('specifications.summary.moreAttention', { count: more }) } : {}),
    };
  }

  switch (workflow.kind) {
    case 'not-started':
      return { title: t('workflowExecution.now.notStarted'), ...(track ? { track } : {}) };
    case 'ended':
      return workflow.outcome === 'completed'
        ? {
            title: t('workflowExecution.now.terminal.completed'),
            icon: { name: 'circle-check', className: 'text-status-success' },
            tone: 'success',
          }
        : {
            title: t('workflowExecution.now.terminal.abandoned'),
            icon: { name: 'archive', className: 'text-content-muted' },
            tone: 'muted',
            ...(workflow.abandonedAt !== undefined
              ? {
                  detail: formatWhen(t, workflow.abandonedAt, context.locale),
                  dateTime: workflow.abandonedAt,
                }
              : {}),
          };
    case 'step': {
      const detail = stepDetail(t, workflow, { locale: context.locale, viewer });

      return {
        title: workflow.step?.title ?? t('specifications.sections.inProgress'),
        ...(track ? { track } : {}),
        ...(detail ? { detail } : {}),
      };
    }
  }
}

const TONES = {
  attention: 'font-medium text-status-attention',
  success: 'text-content-primary',
  muted: 'text-content-secondary',
} as const;

/**
 * Where a Specification's workflow stands on its Specifications list row: {@link situationOf} in
 * the compact {@link StepProgress}, the Overview's own components and words.
 */
export function SpecificationSituation({
  workflow,
  attention,
}: {
  readonly workflow: CurrentSpecWorkflow;
  readonly attention?: SituationAttention;
}) {
  const { t, i18n } = useTranslation();
  const viewer = useViewer();
  const situation = situationOf(t, workflow, {
    locale: i18n.language,
    viewer,
    ...(attention ? { attention } : {}),
  });
  const title: ReactNode = (
    <>
      {situation.icon ? (
        <Icon
          name={situation.icon.name}
          size="sm"
          className={cn('mr-1 inline-block align-text-bottom', situation.icon.className)}
        />
      ) : null}
      {situation.title}
    </>
  );
  const detail =
    situation.detail !== undefined && situation.dateTime !== undefined ? (
      <time dateTime={situation.dateTime}>{situation.detail}</time>
    ) : (
      situation.detail
    );

  return (
    <StepProgress
      variant="compact"
      title={title}
      {...(situation.tone ? { titleClassName: TONES[situation.tone] } : {})}
      {...(situation.track ? { track: situation.track } : {})}
      {...(detail !== undefined ? { detail } : {})}
    />
  );
}

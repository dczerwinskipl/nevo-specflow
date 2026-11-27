import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Icon, Typography, type IconName, type TimelineTone } from '@nevo/ui';
import type { WorkflowHistory } from '@nevo/specflow-contracts/workflow';
import {
  formatRange,
  formatWhen,
  humanizeId,
  personLabel,
  transitionLabel,
  type Viewer,
} from '../presentation';
import { useSessionFacts } from './useSessionFacts';
import { useAgentCatalogue } from './modelTitles';
import { AgentName } from '../../../../shared/agents/AgentName';
import { useViewer } from '../useViewer';
import type { WorkflowSubjectRef } from '../api';
import { SessionLink } from './AgentSession';
import { AttemptCommitNote, commitReason, type AttemptCommitView } from './AttemptCommitNote';
import { AttemptChanges, CommittedRow } from './AttemptChanges';
import { SessionProviderIcon } from '../../../sessions';
import { committedFacts } from './useAttemptCommit';
import { useAgentAttemptCommands } from './useAgentAttemptCommands';
import { DecisionLine, FeedbackLink } from '../feedback/FeedbackParts';

export type HistoryItem = WorkflowHistory['items'][number];
export type AgentHistoryItem = Extract<HistoryItem, { kind: 'attempt' }> & {
  readonly agent: NonNullable<Extract<HistoryItem, { kind: 'attempt' }>['agent']>;
};

/** The agent attempt of a step and attempt number, when the history has one. */
export function agentAttemptOf(
  history: WorkflowHistory | undefined,
  step: string,
  attempt: number,
): AgentHistoryItem | undefined {
  return history?.items.find(
    (item): item is AgentHistoryItem =>
      item.kind === 'attempt' &&
      item.step === step &&
      item.attempt === attempt &&
      item.agent !== undefined,
  );
}

/**
 * Whether the owner's attempt `step#attempt` ended handed to the agent (Hand to agent): the step's
 * next attempt is the agent's and names it as the attempt that handed the step over.
 */
export function handedToAgent(
  history: WorkflowHistory | undefined,
  step: string,
  attempt: number,
): boolean {
  return agentAttemptOf(history, step, attempt + 1)?.agent.handedOverFrom?.attempt === attempt;
}

/** What the attempt's work was committed as, from the history: the same note the Now block shows. */
function commitOf(item: AgentHistoryItem): AttemptCommitView | undefined {
  const { work } = item.agent;
  if (work.commit.state === 'committed') {
    return {
      state: 'committed',
      stepTitle: item.stepTitle || item.step,
      ...committedFacts(work.commit),
    };
  }

  // A pending commit is the Now block's to explain; the history says nothing of it yet.
  if (work.commit.state !== 'failed') {
    return undefined;
  }

  return {
    state: 'failed',
    step: item.step,
    attempt: item.attempt,
    stepTitle: item.stepTitle || item.step,
    code: work.commit.code ?? 'COMMIT_FAILED',
    // Everything the attempt changed stays uncommitted: its documents, files and SpecFlow's records.
    paths: work.changes
      ? [...work.changes.documents, ...work.changes.files, ...work.changes.state]
      : [...new Set([...work.documents, ...work.mixed, ...work.declared])],
  };
}

/**
 * How an agent attempt ended, as its history entry's mark and outcome line. The marks are the ones
 * the Now block's Last hand-off and the Task statuses use: done (circle-check, success), waiting for
 * the owner (clock, info), changes requested or rejected (circle-alert, attention), a commit that
 * failed (circle-alert, attention, as its note), running (the spinning loader), taken over or returned (undo,
 * neutral), abandoned (close, neutral).
 */
export interface AttemptOutcomeView {
  readonly label: string;
  readonly icon: IconName;
  readonly tone: TimelineTone;
  readonly iconClassName?: string;
  /** Whether the label takes the tone's colour (results); a neutral end stays secondary. */
  readonly toned: boolean;
}

const TONE_TEXT: Partial<Record<TimelineTone, string>> = {
  success: 'text-status-success',
  info: 'text-status-info',
  attention: 'text-status-attention',
  danger: 'text-status-danger',
};

/** The class of an outcome line: its tone's colour for a result, else the secondary text. */
export function outcomeTextClass(outcome: AttemptOutcomeView): string {
  return (outcome.toned ? TONE_TEXT[outcome.tone] : undefined) ?? 'text-content-secondary';
}

export function attemptOutcome(
  t: TFunction,
  item: AgentHistoryItem,
  items: readonly HistoryItem[],
  viewer: Viewer,
): AttemptOutcomeView {
  const { agent } = item;
  const kinds = new Set(agent.events.map((event) => event.kind));
  switch (agent.ended) {
    case 'active':
      return {
        label: t('workflowExecution.attemptHistory.outcome.active'),
        icon: 'loader',
        tone: 'info',
        iconClassName: 'animate-spin motion-reduce:animate-none',
        toned: true,
      };
    case 'taken-over': {
      const by = agent.takenOverBy
        ? items.find(
            (candidate) =>
              candidate.kind === 'attempt' &&
              candidate.step === item.step &&
              candidate.attempt === agent.takenOverBy?.attempt,
          )
        : undefined;
      const who =
        by?.kind === 'attempt' && by.actor?.class === 'human'
          ? personLabel(t, by.actor.details.actorId, viewer)
          : undefined;

      return {
        label: who
          ? t('workflowExecution.attemptHistory.outcome.takenOverBy', { who })
          : t('workflowExecution.attemptHistory.outcome.takenOver'),
        icon: 'undo',
        tone: 'neutral',
        toned: false,
      };
    }

    case 'returned':
      return {
        label: t('workflowExecution.attemptHistory.outcome.returned', {
          step: humanizeId(agent.returnRequest?.to ?? ''),
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
    case 'finished':
      break;
  }

  if (kinds.has('rejected') || item.confirmation?.state === 'rejected') {
    return {
      label: t('workflowExecution.attemptHistory.outcome.rejected'),
      icon: 'circle-alert',
      tone: 'attention',
      toned: true,
    };
  }

  if (kinds.has('awaiting-confirmation') && !kinds.has('confirmed')) {
    return {
      label: t('workflowExecution.attemptHistory.outcome.awaitingConfirmation'),
      icon: 'clock',
      tone: 'info',
      toned: true,
    };
  }

  if (agent.work.commit.state === 'failed') {
    return {
      label: t('workflowExecution.attemptHistory.outcome.commitFailed'),
      // The attention tone of the Now block's failed-commit note, which says what to do.
      icon: 'circle-alert',
      tone: 'attention',
      toned: true,
    };
  }

  const outcome = item.outcome?.kind === 'transition' ? item.outcome : undefined;
  const label = outcome
    ? transitionLabel({
        id: outcome.transition,
        ...(item.transitionLabel !== undefined ? { label: item.transitionLabel } : {}),
        ...(outcome.result !== undefined ? { result: outcome.result } : {}),
      })
    : t('workflowExecution.attemptHistory.outcome.completed');
  // A review that requested changes is what the next attempt acts on, as in the Last hand-off.
  const blocking = outcome?.result === 'fail';

  return blocking
    ? { label, icon: 'circle-alert', tone: 'attention', toned: true }
    : { label, icon: 'circle-check', tone: 'success', toned: true };
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/** The day as the history names it: Today, Yesterday, else a short date. */
export function historyDay(t: TFunction, at: Date, locale: string, now = new Date()): string {
  if (sameDay(at, now)) {
    return t('workflowExecution.attemptHistory.day.today');
  }

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameDay(at, yesterday)) {
    return t('workflowExecution.attemptHistory.day.yesterday');
  }

  return new Intl.DateTimeFormat(locale, {
    month: 'short',
    day: 'numeric',
    ...(at.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  }).format(at);
}

/**
 * When the attempt ran: "Today, 12:35 – 12:40 PM · Attempt 1" (`withDay` false drops the day, for a
 * history grouped by day; `actor` names who worked on it before the attempt, as the Task history
 * does). The end carries its own day when it is another one. Only the elapsed range is said, never a
 * duration: the range holds interruptions and waits the data cannot tell from working time.
 */
export function attemptTimeLine(
  t: TFunction,
  item: Pick<AgentHistoryItem, 'startedAt' | 'endedAt' | 'attempt'>,
  locale: string,
  withDay = true,
  actor?: string,
): string {
  const start = new Date(item.startedAt);
  const end = item.endedAt ? new Date(item.endedAt) : undefined;
  const time = new Intl.DateTimeFormat(locale, { timeStyle: 'short' });
  let when: string;
  if (Number.isNaN(start.getTime())) {
    when = item.startedAt;
  } else if (!end || Number.isNaN(end.getTime())) {
    when = time.format(start);
  } else if (sameDay(start, end)) {
    when = time.formatRange(start, end);
  } else {
    when = formatRange(t, item.startedAt, item.endedAt!, locale);
  }

  const day =
    withDay && !Number.isNaN(start.getTime()) && (!end || sameDay(start, end))
      ? `${historyDay(t, start, locale)}, `
      : '';

  return [`${day}${when}`, actor, t('taskDetails.attempt', { count: item.attempt })]
    .filter(Boolean)
    .join(' · ');
}

/** The quiet time line of an agent attempt in the history ({@link attemptTimeLine}). */
export function AgentAttemptMeta({
  item,
  withDay = true,
}: {
  readonly item: AgentHistoryItem;
  readonly withDay?: boolean;
}) {
  const { t, i18n } = useTranslation();

  return (
    <Typography as="p" variant="body-sm" className="text-content-muted" data-attempt-time="">
      {attemptTimeLine(t, item, i18n.language, withDay)}
    </Typography>
  );
}

/**
 * Who worked on the attempt, as the Now block names it: the provider's mark, "Claude Code · Opus 5.5"
 * ({@link AgentName}: the model alone beside the mark where the line is too short), and Open
 * session at the end of the line. The name keeps to one line. The Session is
 * not named by its title: a Session continued from an earlier step keeps that step's title, which
 * would misname this one.
 */
export function AgentIdentityLine({
  item,
  specId,
}: {
  readonly item: AgentHistoryItem;
  readonly specId: string;
}) {
  const { t } = useTranslation();
  const session = useSessionFacts(specId, item.agent.sessionId);
  const catalogue = useAgentCatalogue(specId);
  // What the attempt recorded, else its actor's record, else its Session's: the Now block names it
  // by the actor, so both name one attempt alike.
  const actor = item.actor?.class === 'agent' ? item.actor.details : undefined;
  const agent = {
    provider: item.agent.provider,
    providerTitle: actor?.providerTitle ?? session.providerTitle,
    model: item.agent.model ?? actor?.model,
    modelTitle: actor?.modelTitle ?? session.modelTitle,
    catalogue,
  };

  return (
    <div className="flex min-w-0 items-center gap-2 text-body-sm" data-attempt-actor="">
      <SessionProviderIcon providerId={item.agent.provider} />
      <AgentName agent={agent} className="flex-1 text-content-secondary" />
      {item.agent.sessionId ? (
        <SessionLink
          sessionId={item.agent.sessionId}
          title={t('workflowExecution.attemptHistory.openSession')}
          className="inline-flex min-h-6 shrink-0 items-center whitespace-nowrap font-medium"
        />
      ) : null}
    </div>
  );
}

/** The step events that are worth saying in the history: the exceptions, not the lifecycle. */
const EXCEPTIONAL_EVENTS = new Set(['proposal-refused']);

/**
 * The exceptions of an attempt the entry's own lines do not say already: a result the Engine did
 * not accept. Interruption, take over, a failed commit and the owner's confirmation are the
 * outcome line and the commit note; the ordinary lifecycle (started, working, stopped, finished,
 * committed) stays in the data, for diagnosis, and is never listed.
 */
function ExceptionalEvents({ item }: { readonly item: AgentHistoryItem }) {
  const { t, i18n } = useTranslation();
  const events = item.agent.events.filter((event) => EXCEPTIONAL_EVENTS.has(event.kind));
  if (events.length === 0) {
    return null;
  }

  return (
    <ul className="grid gap-0.5 text-body-sm text-status-attention" data-agent-exceptions="">
      {events.map((event, index) => (
        <li key={`${event.kind}-${index}`} className="[overflow-wrap:anywhere]">
          {t(`workflowExecution.attemptHistory.event.${event.kind}`, {
            turn: event.turn,
            reason: event.code ? commitReason(t, event.code) : '',
            code: event.code ?? '',
          })}
          {event.at ? (
            <span className="text-content-muted"> · {formatWhen(t, event.at, i18n.language)}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * The notes the owner sent the agent with a Continue (or a start), in their order: what the owner
 * told the agent to do differently is part of what happened, so the history keeps it.
 */
function OwnerNotes({ item }: { readonly item: AgentHistoryItem }) {
  const { t, i18n } = useTranslation();
  const notes = item.agent.events.filter((event) => event.kind === 'turn-started' && event.note);
  if (notes.length === 0) {
    return null;
  }

  return (
    <ul className="grid gap-0.5 text-body-sm text-content-secondary" data-agent-owner-notes="">
      {notes.map((event, index) => (
        <li key={`note-${index}`} className="whitespace-pre-wrap [overflow-wrap:anywhere]">
          {t('workflowExecution.attemptHistory.ownerNote', { note: event.note })}
          {event.at ? (
            <span className="text-content-muted"> · {formatWhen(t, event.at, i18n.language)}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * What the agent achieved in one attempt, for the workflow history of a Task or a Specification
 * (workflow-execution.md, "Activity history"): how it ended when the entry's own lines do not say
 * it (`showOutcome`), the exceptions worth knowing, who worked on it with Open session, what it
 * changed as collapsed rows, the owner's Confirm or Reject of its result ("Confirmed by you · 5:09
 * PM"), its commit as one row (a failed commit shows the Now block's note with Retry commit) and
 * View feedback, which opens the shared Feedback view, when its result left feedback. History shows
 * what was achieved, not every event recorded.
 */
export function AgentAttemptHistory({
  item,
  items,
  subject,
  openDocument,
  onOpenFeedback,
  showOutcome = true,
  groupedByDay = false,
}: {
  readonly item: AgentHistoryItem;
  /** The whole history: the attempt that took this one over names who did. */
  readonly items: readonly HistoryItem[];
  readonly subject: WorkflowSubjectRef;
  readonly openDocument?: (path: string) => boolean;
  /** Opens the attempt's feedback in the Feedback view; absent: no View feedback. */
  readonly onOpenFeedback?: (() => void) | undefined;
  /** Whether to say how the attempt ended (the Specification's entry says it in its own line). */
  readonly showOutcome?: boolean;
  /** The history groups its entries by day: the owner's decision says its time of day only. */
  readonly groupedByDay?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const viewer = useViewer();
  const commands = useAgentAttemptCommands(subject);
  const { agent } = item;
  const { work } = agent;
  const commit = commitOf(item);
  const outcome = attemptOutcome(t, item, items, viewer);
  const stoppedAt = [...agent.events].reverse().find((event) => event.kind === 'turn-ended')?.at;
  const stopped =
    (agent.ended === 'taken-over' || agent.ended === 'abandoned') && !agent.proposal
      ? t('workflowExecution.attemptHistory.stopped', {
          at: stoppedAt ? formatWhen(t, stoppedAt, i18n.language) : '',
        })
      : undefined;
  const changes = work.changes;
  const changed =
    changes !== undefined &&
    changes.documents.length + changes.tasks.length + changes.files.length > 0;
  // Work an attempt that ended without its own result left in the checkout, uncommitted (D19).
  const kept = changed && work.commit.state === 'none' && agent.ended !== 'active';

  return (
    <div className="grid min-w-0 gap-1.5" data-agent-attempt={agent.ended}>
      {showOutcome && agent.ended !== 'finished' ? (
        <Typography as="p" variant="body-sm" className="text-content-primary">
          <span className="mr-1 inline-flex h-[1lh] items-center align-top">
            <Icon name={outcome.icon} size="sm" aria-hidden="true" />
          </span>
          {outcome.label}
        </Typography>
      ) : null}
      {stopped ? (
        <Typography as="p" variant="body-sm" className="text-content-secondary">
          {stopped}
        </Typography>
      ) : null}
      <ExceptionalEvents item={item} />
      <OwnerNotes item={item} />
      <AgentIdentityLine item={item} specId={subject.specId} />
      {item.confirmation ? (
        <DecisionLine confirmation={item.confirmation} withDay={!groupedByDay} />
      ) : null}
      {changes ? (
        <AttemptChanges changes={changes} specId={subject.specId} openDocument={openDocument} />
      ) : null}
      {commit?.state === 'committed' ? (
        <CommittedRow sha={commit.sha} />
      ) : commit ? (
        <AttemptCommitNote
          commit={commit}
          retrying={commands.retryCommit.isPending}
          error={commands.retryCommit.error}
          onRetry={() => commands.retryCommit.mutate({ step: item.step, attempt: item.attempt })}
        />
      ) : kept ? (
        <Typography as="p" variant="body-sm" className="text-content-muted">
          {t('workflowExecution.attemptHistory.notCommitted')}
        </Typography>
      ) : null}
      {onOpenFeedback ? <FeedbackLink onOpen={onOpenFeedback} /> : null}
    </div>
  );
}

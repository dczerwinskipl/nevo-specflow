import { useState } from 'react';
import { Link, useRouter } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Icon, Typography } from '@nevo/ui';
import type { WorkflowHistory } from '@nevo/specflow-contracts/workflow';
import {
  formatRange,
  formatWhen,
  humanizeId,
  personLabel,
  providerFallbackName,
} from '../presentation';
import { useSessionFacts } from './useSessionFacts';
import { useViewer } from '../useViewer';
import type { WorkflowSubjectRef } from '../api';
import { InlineAction } from '../InlineAction';
import { AttemptSession } from './AgentAttemptNow';
import { AttemptCommitNote, commitReason, type AttemptCommitView } from './AttemptCommitNote';
import { KeptDocuments } from './KeptDocuments';
import { committedFacts } from './useAttemptCommit';
import { useAgentAttemptCommands } from './useAgentAttemptCommands';

export type HistoryItem = WorkflowHistory['items'][number];
export type AgentHistoryItem = Extract<HistoryItem, { kind: 'attempt' }> & {
  readonly agent: NonNullable<Extract<HistoryItem, { kind: 'attempt' }>['agent']>;
};

const MONO = 'font-mono text-content-primary [overflow-wrap:anywhere]';

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

  if (work.commit.state !== 'failed') {
    return undefined;
  }

  return {
    state: 'failed',
    step: item.step,
    attempt: item.attempt,
    stepTitle: item.stepTitle || item.step,
    code: work.commit.code ?? 'COMMIT_FAILED',
    paths: [...new Set([...work.documents, ...work.mixed, ...work.declared])],
  };
}

/**
 * The quiet line of an agent attempt in the history: its time span, the agent (the provider as the
 * Sessions list names it, and the model) and the attempt number: "Nov 13, 12:52 PM – 1:15 PM ·
 * Claude · Sonnet 5 · Attempt 2".
 */
export function AgentAttemptMeta({
  item,
  specId,
}: {
  readonly item: AgentHistoryItem;
  readonly specId: string;
}) {
  const { t, i18n } = useTranslation();
  const session = useSessionFacts(specId, item.agent.sessionId);
  const parts = [
    item.endedAt
      ? formatRange(t, item.startedAt, item.endedAt, i18n.language)
      : formatWhen(t, item.startedAt, i18n.language),
    session.providerTitle ?? providerFallbackName(item.agent.provider),
    session.modelTitle ?? item.agent.model,
    t('taskDetails.attempt', { count: item.attempt }),
  ];

  return (
    <Typography as="p" variant="body-sm" className="text-content-muted">
      {parts.filter(Boolean).join(' · ')}
    </Typography>
  );
}

/** A Task draft the attempt produced: its Full Task page where a router exists. */
function TaskDraftLink({ specId, taskId }: { readonly specId: string; readonly taskId: string }) {
  const router = useRouter({ warn: false });
  if (!router) {
    return <span className={MONO}>{taskId}</span>;
  }

  return (
    <Link
      to="/specs/$specId/tasks/$taskId"
      params={{ specId, taskId }}
      search={{ collection: 'current' }}
      className="text-content-link underline-offset-2 hover:underline"
    >
      {taskId}
    </Link>
  );
}

/** The events of the attempt, oldest first, in plain words. */
function Events({ item }: { readonly item: AgentHistoryItem }) {
  const { t, i18n } = useTranslation();

  return (
    <ol className="grid gap-0.5 text-body-sm" data-agent-events="">
      {item.agent.events.map((event, index) => (
        <li key={`${event.kind}-${index}`} className="[overflow-wrap:anywhere]">
          {event.at ? (
            <span className="text-content-muted">{formatWhen(t, event.at, i18n.language)} · </span>
          ) : null}
          {t(`workflowExecution.attemptHistory.event.${event.kind}`, {
            turn: event.turn,
            reason: event.code ? commitReason(t, event.code) : '',
            code: event.code ?? '',
          })}
        </li>
      ))}
    </ol>
  );
}

/**
 * What the agent did in one attempt, for the workflow history of a Task or a Specification
 * (workflow-execution.md, "Run with agent"): how the attempt ended when the entry's own result does
 * not say it (taken over, returned, abandoned), the work it left (documents and Task drafts linked,
 * files, the commit), its Session, and its events on request. A failed commit offers Retry commit,
 * as the Now block of the step does.
 */
export function AgentAttemptHistory({
  item,
  items,
  subject,
  openDocument,
  defaultShowEvents = false,
}: {
  readonly item: AgentHistoryItem;
  /** The whole history: the attempt that took this one over names who did. */
  readonly items: readonly HistoryItem[];
  readonly subject: WorkflowSubjectRef;
  readonly openDocument?: (path: string) => boolean;
  readonly defaultShowEvents?: boolean;
}) {
  const { t, i18n } = useTranslation();
  const viewer = useViewer();
  const commands = useAgentAttemptCommands(subject);
  const [showEvents, setShowEvents] = useState(defaultShowEvents);
  const { agent } = item;
  const { work } = agent;
  const commit = commitOf(item);
  const stoppedAt = [...agent.events].reverse().find((event) => event.kind === 'turn-ended')?.at;
  const takenOverBy = agent.takenOverBy
    ? items.find(
        (candidate) =>
          candidate.kind === 'attempt' &&
          candidate.step === item.step &&
          candidate.attempt === agent.takenOverBy?.attempt,
      )
    : undefined;
  const who =
    takenOverBy?.kind === 'attempt' && takenOverBy.actor?.class === 'human'
      ? personLabel(t, takenOverBy.actor.details.actorId, viewer)
      : undefined;
  const outcome =
    agent.ended === 'taken-over'
      ? who
        ? t('workflowExecution.attemptHistory.outcome.takenOverBy', { who })
        : t('workflowExecution.attemptHistory.outcome.takenOver')
      : agent.ended === 'abandoned'
        ? t('workflowExecution.attemptHistory.outcome.abandoned')
        : agent.ended === 'returned'
          ? t('workflowExecution.attemptHistory.outcome.returned', {
              step: humanizeId(agent.returnRequest?.to ?? ''),
            })
          : agent.ended === 'active'
            ? t('workflowExecution.attemptHistory.outcome.active')
            : undefined;
  const stopped =
    (agent.ended === 'taken-over' || agent.ended === 'abandoned') && !agent.proposal
      ? t('workflowExecution.attemptHistory.stopped', {
          at: stoppedAt ? formatWhen(t, stoppedAt, i18n.language) : '',
        })
      : undefined;
  const files = [...new Set([...(work.changed?.paths ?? []), ...work.declared])].filter(
    (path) => !work.documents.includes(path) && !work.mixed.includes(path),
  );
  const hasWork = work.documents.length + work.tasks.length + files.length > 0;
  const kept = agent.ended !== 'finished' && agent.ended !== 'active';

  return (
    <div className="grid min-w-0 gap-1.5" data-agent-attempt={agent.ended}>
      {outcome ? (
        <Typography as="p" variant="body-sm" className="text-content-primary">
          {agent.ended === 'taken-over' || agent.ended === 'returned' ? (
            <span className="mr-1 inline-flex h-[1lh] items-center align-top">
              <Icon name="undo" size="sm" aria-hidden="true" />
            </span>
          ) : null}
          {outcome}
        </Typography>
      ) : null}
      {stopped ? (
        <Typography as="p" variant="body-sm" className="text-content-secondary">
          {stopped}
          {hasWork ? ` ${t('workflowExecution.attemptHistory.work.leadKept')}` : null}
        </Typography>
      ) : hasWork ? (
        <Typography as="p" variant="body-sm" className="text-content-secondary">
          {t(
            kept
              ? 'workflowExecution.attemptHistory.work.leadKept'
              : 'workflowExecution.attemptHistory.work.lead',
          )}
        </Typography>
      ) : null}
      {hasWork ? (
        <ul className="grid gap-0.5 text-body-sm" data-agent-work="">
          <li>
            {t('workflowExecution.attemptHistory.work.documents')}{' '}
            {work.documents.length > 0 ? (
              <KeptDocuments paths={work.documents} openDocument={openDocument} />
            ) : (
              t('workflowExecution.attemptHistory.work.none')
            )}
          </li>
          <li>
            {t('workflowExecution.attemptHistory.work.tasks')}{' '}
            {work.tasks.length > 0
              ? work.tasks.map((taskId, index) => (
                  <span key={taskId}>
                    {index > 0 ? ', ' : null}
                    <TaskDraftLink specId={subject.specId} taskId={taskId} />
                  </span>
                ))
              : t('workflowExecution.attemptHistory.work.none')}
          </li>
          {files.length > 0 ? (
            <li>
              {t('workflowExecution.attemptHistory.work.files')}{' '}
              {files.map((path, index) => (
                <span key={path}>
                  {index > 0 ? ', ' : null}
                  <span className={MONO}>{path}</span>
                </span>
              ))}
            </li>
          ) : null}
        </ul>
      ) : null}
      {commit ? (
        <AttemptCommitNote
          commit={commit}
          retrying={commands.retryCommit.isPending}
          error={commands.retryCommit.error}
          onRetry={() => commands.retryCommit.mutate({ step: item.step, attempt: item.attempt })}
        />
      ) : null}
      <Typography as="p" variant="body-sm" className="text-content-secondary">
        {t('workflowExecution.attemptHistory.session')}{' '}
        <AttemptSession
          specId={subject.specId}
          sessionId={agent.sessionId}
          provider={agent.provider}
        />
      </Typography>
      <div>
        <InlineAction
          className="text-body-sm"
          aria-expanded={showEvents}
          onClick={() => setShowEvents((open) => !open)}
        >
          {t(
            showEvents
              ? 'workflowExecution.attemptHistory.hideEvents'
              : 'workflowExecution.attemptHistory.showEvents',
          )}
        </InlineAction>
      </div>
      {showEvents ? <Events item={item} /> : null}
    </div>
  );
}

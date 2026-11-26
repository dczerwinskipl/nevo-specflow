import { useState, type ReactNode } from 'react';
import { useRouter } from '@tanstack/react-router';
import { Trans, useTranslation } from 'react-i18next';
import { CircleStop } from 'lucide-react';
import { Button, InlineNote, Typography } from '@nevo/ui';
import type { AgentAttemptView, WorkflowActionProjection } from '@nevo/specflow-contracts/workflow';
import { useAppServices } from '../../../../app/useAppServices';
import { useSpecificationWorkspace } from '../../../specs/read-model';
import { SessionProviderIcon } from '../../../sessions';
import type { WorkflowSubjectRef } from '../api';
import { actorLabel, formatWhen, humanizeId, transitionLabel } from '../presentation';
import { useAgentTitles } from './modelTitles';
import type { NowLinks } from '../StartBlockerLines';
import { WorkflowRefusalAlert } from '../WorkflowRefusalAlert';
import { workflowRefusalOf } from '../refusal';
import { InlineAction } from '../InlineAction';
import { KeptDocuments } from './KeptDocuments';
import { AgentBlocker, Paths } from './AgentBlocker';
import { SessionLink } from './AgentSession';
import { agentStageOf, continueRefusal, needsPolling, ownRefusal } from './agentAttempt';
import type { UnavailableAgent } from './agentOption';
import { usePolling } from './usePolling';
import { useSessionFacts } from './useSessionFacts';
import { AttemptCommitNote } from './AttemptCommitNote';
import { TakeOverDialog } from './TakeOverDialog';
import { ContinueDialog } from './ContinueDialog';
import {
  useConfirmationAttemptCommit,
  useFinishedAttemptCommit,
  useHeldAttemptCommit,
  type AttemptCommitHold,
} from './useAttemptCommit';
import { ConfirmApplies, RejectResultDialog } from './ConfirmationParts';
import { LastHandoff } from '../progress/LastHandoff';
import { commitLine } from '../progress/handoffView';
import { useAgentAttemptCommands } from './useAgentAttemptCommands';

const MONO = 'font-mono text-content-primary [overflow-wrap:anywhere]';
const STRONG = 'font-medium text-content-primary';
const CODE = <span className={MONO} />;

/** What the agent's working Turn waits for from the owner (`turn.waitingForOwner`). */
interface WaitingForOwner {
  readonly kind?: 'question' | 'permission';
}

/**
 * The Turn waits for the owner: the projection's `waitingForOwner`, else the Session's own state
 * (`attention`: a question or permission is pending) while the projection does not carry it.
 */
function waitingForOwnerOf(
  view: AgentAttemptView,
  sessionStatus: string | undefined,
): WaitingForOwner | undefined {
  const projected = view.turn.waitingForOwner;
  if (projected) {
    return { kind: projected.kind };
  }

  return sessionStatus === 'attention' ? {} : undefined;
}

/** Opens the agent's Session where the owner answers it (only where a router exists). */
function OpenSessionButton({
  sessionId,
  label,
}: {
  readonly sessionId: string;
  readonly label: string;
}) {
  const router = useRouter({ warn: false });
  if (!router) {
    return null;
  }

  return (
    <Button
      onClick={() =>
        void router.navigate({
          to: '/sessions/$sessionId',
          params: { sessionId },
          search: { collection: 'current' },
        })
      }
    >
      {label}
    </Button>
  );
}

/** What an agent's attempt (or its result waiting for the owner) adds to the Now block. */
export interface AgentNow {
  /** Replaces the quiet position line: the attempt, its state and the agent's Session. */
  readonly positionLine?: ReactNode;
  readonly note: ReactNode;
  readonly actions?: ReactNode;
  readonly dialogs?: ReactNode;
  /** The ⋯ menu stays only while the agent works or has stopped; a stop waiting for proof locks it. */
  readonly keepsMenu: boolean;
  /** The proposal replaces the last hand-off while the owner decides. */
  readonly showHandoff: boolean;
  /** What the attempt that handed over committed, said in the Last hand-off row. */
  readonly handoffCommit?: string;
}

/** The agent's Session in a position line: its mark and its title as a link. */
export function AttemptSession({
  specId,
  sessionId,
  provider,
  gone = false,
}: {
  readonly specId: string;
  readonly sessionId: string;
  readonly provider: string;
  /** The Session no longer exists: its title is struck through, never a link. */
  readonly gone?: boolean;
}) {
  const { title } = useSessionFacts(specId, sessionId);

  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="inline-flex h-[1lh] items-center self-start">
        <SessionProviderIcon providerId={provider} />
      </span>
      {gone ? (
        <span className="text-content-muted line-through">{title}</span>
      ) : (
        <SessionLink sessionId={sessionId} title={title} />
      )}
    </span>
  );
}

/** The take-over dialog with the title of the agent's Session. */
function TakeOverDialogFor({
  specId,
  sessionId,
  gone,
  ...dialog
}: Omit<React.ComponentProps<typeof TakeOverDialog>, 'session' | 'sessionGone'> & {
  readonly specId: string;
  readonly sessionId: string;
  readonly gone: boolean;
}) {
  const { t } = useTranslation();
  const { specificationApi } = useAppServices();
  const workspace = useSpecificationWorkspace(specId, specificationApi).data;
  const sessionTitle =
    workspace?.sessions.find((session) => session.id === sessionId)?.title ??
    t('workflowExecution.agentAttempt.sessionFallback');

  return (
    <TakeOverDialog
      {...dialog}
      sessionGone={gone}
      session={
        gone ? (
          <span className="text-content-muted line-through">{sessionTitle}</span>
        ) : (
          <SessionLink sessionId={sessionId} title={sessionTitle} />
        )
      }
    />
  );
}

/** Why SpecFlow did not accept the agent's result, one reason per line in plain words. */
function RefusalReasons({
  refusal,
}: {
  readonly refusal: NonNullable<NonNullable<AgentAttemptView['proposal']>['refusal']>;
}) {
  const { t } = useTranslation();
  const paths = refusal.paths ?? [];
  const key = (
    {
      WORKFLOW_UNDECLARED_CHANGES: 'undeclared',
      WORKFLOW_UNREGISTERED_DOCUMENTS: 'unregistered',
      WORKFLOW_ENGINE_FILE_EDITED: 'engineFile',
      WORKFLOW_NESTED_REPOSITORY: 'nested',
    } as const
  )[refusal.code as 'WORKFLOW_UNDECLARED_CHANGES'];
  const general = (
    {
      WORKFLOW_GATE_UNSATISFIED: 'gate',
      WORKFLOW_TASKS_OPEN: 'tasksOpen',
    } as const
  )[refusal.code as 'WORKFLOW_GATE_UNSATISFIED'];

  return (
    <ul className="mt-1 grid list-disc gap-0.5 pl-5">
      {key && paths.length > 0 ? (
        paths.map((path) => (
          <li key={path}>
            <Trans
              i18nKey={`workflowExecution.agentAttempt.refused.${key}`}
              values={{ path }}
              components={{ code: CODE }}
            />
          </li>
        ))
      ) : (
        <li>
          {general ? (
            t(`workflowExecution.agentAttempt.refused.${general}`)
          ) : (
            <>
              {t('workflowExecution.agentAttempt.refused.other')}{' '}
              <span className={MONO}>({refusal.code})</span>
            </>
          )}
        </li>
      )}
    </ul>
  );
}

function ContinueRefused({
  refusal,
  specId,
  step,
  onCheckAgain,
}: {
  /** Why Continue is refused: the projection's, or the one a refused Continue answered with. */
  readonly refusal: UnavailableAgent;
  readonly specId: string;
  readonly step: string;
  readonly onCheckAgain: () => void;
}) {
  const { t } = useTranslation();
  const own = ownRefusal(refusal);

  if (own === 'baseline-changed') {
    return (
      <InlineNote tone="attention" role="alert">
        <span className={STRONG}>
          {t('workflowExecution.agentAttempt.changed.title', {
            count: refusal.count ?? refusal.paths?.length ?? 0,
          })}
        </span>
        <Paths option={refusal} />
        <span className="mt-1 block">{t('workflowExecution.agentAttempt.changed.body')}</span>
        <div className="mt-2">
          <Button size="sm" variant="secondary" leadingIcon="refresh" onClick={onCheckAgain}>
            {t('workflowExecution.agent.checkAgain')}
          </Button>
        </div>
      </InlineNote>
    );
  }

  if (own === 'session-gone') {
    return (
      <InlineNote tone="attention" role="alert">
        <span className={STRONG}>{t('workflowExecution.agentAttempt.gone.title')}</span>{' '}
        {t('workflowExecution.agentAttempt.gone.body')}
      </InlineNote>
    );
  }

  return (
    <AgentBlocker
      option={refusal}
      specId={specId}
      step={step}
      role={undefined}
      checking={false}
      onCheckAgain={onCheckAgain}
    />
  );
}

/**
 * The Now block of a step an agent runs (workflow-execution.md "While the agent works", "After the
 * agent stops" and "Pending owner confirmation"): the position line with the agent's Session, the
 * note that explains the state, and the actions the owner has: Stop agent, Check outcome, Continue
 * or Retry start, Confirm and Reject. The note puts what resolves a blocker inside it; the action row
 * holds the main action and at most one secondary.
 *
 * A Return during the attempt is a request (`returnRequest`): the step goes back once the agent's
 * process is proven ended. Take over (`takeOver`) joins Continue once it is.
 */
export function useAgentAttemptNow({
  subject,
  projection,
  links,
  headingId,
}: {
  readonly headingId: string;
  readonly subject: WorkflowSubjectRef;
  readonly projection: WorkflowActionProjection;
  readonly links: NowLinks;
}): AgentNow | undefined {
  const { position, agentAttempt: view, actions } = projection;
  const attemptCommit = useFinishedAttemptCommit(subject, projection);
  const confirmationCommit = useConfirmationAttemptCommit(subject, projection);
  const { t, i18n } = useTranslation();
  const commands = useAgentAttemptCommands(subject, headingId);
  const titles = useAgentTitles(subject.specId);
  const sessionFacts = useSessionFacts(subject.specId, view?.sessionId ?? '');
  // The attempt whose commit holds the specification's workflow: this subject's or another's.
  const heldStepTitle = (hold: AttemptCommitHold) =>
    hold.subject.taskId !== undefined && hold.subject.taskId !== subject.taskId
      ? t('workflowExecution.attemptCommit.stepOfTask', {
          step: hold.stepTitle || hold.step,
          task: hold.subject.taskId,
        })
      : hold.stepTitle || hold.step;
  const held = useHeldAttemptCommit(projection, heldStepTitle);
  const holdTarget: WorkflowSubjectRef = held
    ? {
        specId: held.hold.subject.specId,
        ...(held.hold.subject.taskId !== undefined ? { taskId: held.hold.subject.taskId } : {}),
      }
    : subject;
  const holdCommands = useAgentAttemptCommands(holdTarget, headingId);
  const heldNote = held ? (
    <AttemptCommitNote
      commit={held.view}
      retrying={holdCommands.retryCommit.isPending}
      error={holdCommands.retryCommit.error}
      onRetry={() =>
        holdCommands.retryCommit.mutate({ step: held.hold.step, attempt: held.hold.attempt })
      }
    />
  ) : null;
  // The confirmation's own note already speaks for its attempt's commit.
  const heldElsewhere =
    held !== undefined &&
    !(
      position.kind === 'awaiting-confirmation' &&
      held.hold.subject.taskId === subject.taskId &&
      held.hold.step === position.step.id &&
      held.hold.attempt === position.attempt.number
    );
  usePolling(needsPolling(projection), commands.refresh);
  const [rejecting, setRejecting] = useState(false);
  const [takingOver, setTakingOver] = useState(false);
  const [continuingWithNote, setContinuingWithNote] = useState(false);
  const when = (at: string, timeOnlyToday = false) =>
    formatWhen(t, at, i18n.language, { timeOnlyToday });
  const line = (text: string, view: AgentAttemptView) => (
    <>
      {text} ·{' '}
      <AttemptSession
        specId={subject.specId}
        sessionId={view.sessionId}
        provider={view.provider}
        gone={ownRefusal(view.continue) === 'session-gone'}
      />
    </>
  );

  if (position.kind === 'awaiting-confirmation') {
    const { attempt, proposal } = position;
    const sessionId = attempt.actor.class === 'agent' ? attempt.actor.details.sessionId : undefined;
    const provider = attempt.actor.class === 'agent' ? attempt.actor.details.provider : undefined;
    const finished = when(attempt.endedAt ?? attempt.startedAt);
    const result = transitionLabel(proposal.transition);
    const text = t('workflowExecution.confirmation.line', { at: finished });
    // Confirm and Reject wait while the commit of the agent's work runs or failed; the one note says
    // why for both. A Confirm refused for it (the projection had not said so yet) is answered by the
    // re-read, not an alert.
    const commitWaits =
      actions.confirm?.unavailable !== undefined || actions.reject?.unavailable !== undefined;
    const confirmError =
      commands.confirm.isError &&
      workflowRefusalOf(commands.confirm.error).code !== 'WORKFLOW_ATTEMPT_COMMIT_REQUIRED'
        ? commands.confirm.error
        : undefined;
    const failed = confirmError ?? (commands.reject.isError ? commands.reject.error : undefined);
    // A made commit is one line of the result; a running or failed one keeps its own note.
    const committedLine = commitLine(t, confirmationCommit);

    return {
      positionLine:
        sessionId && provider ? (
          <>
            {text} ·{' '}
            <AttemptSession specId={subject.specId} sessionId={sessionId} provider={provider} />
          </>
        ) : (
          text
        ),
      note: (
        <div className="grid gap-3">
          {/* The agent's result is the hand-off waiting for the owner: open, in the info tone. */}
          <LastHandoff
            heading={t('workflowExecution.confirmation.resultHeading')}
            outcome={result}
            meta={[
              attempt.actor.class === 'agent' ? actorLabel(t, attempt.actor, {}, titles) : '',
              finished,
            ]
              .filter(Boolean)
              .join(' · ')}
            {...(proposal.feedback ? { feedback: proposal.feedback } : {})}
            {...(committedLine ? { commit: committedLine } : {})}
            tone="waiting"
            {...(links.attempt ? { onOpenDetails: links.attempt } : {})}
          />
          <ConfirmApplies confirmation={position} links={links} />
          {heldElsewhere ? heldNote : null}
          {confirmationCommit && !committedLine ? (
            <AttemptCommitNote
              commit={confirmationCommit}
              retrying={commands.retryCommit.isPending}
              error={commands.retryCommit.error}
              onRetry={() =>
                commands.retryCommit.mutate({ step: position.step.id, attempt: attempt.number })
              }
            />
          ) : null}
          {failed && !rejecting ? <WorkflowRefusalAlert error={failed} /> : null}
        </div>
      ),
      actions: (
        <>
          {actions.confirm ? (
            <Button
              onClick={() =>
                commands.confirm.mutate({
                  step: position.step.id,
                  attempt: attempt.number,
                  confirmsDigest: position.confirmsDigest,
                })
              }
              disabled={commands.confirm.isPending || commitWaits}
              aria-busy={commands.confirm.isPending}
            >
              {commands.confirm.isPending
                ? t('workflowExecution.confirmation.confirming')
                : t('workflowExecution.confirmation.confirm')}
            </Button>
          ) : null}
          {actions.reject ? (
            <Button
              variant="secondary"
              onClick={() => {
                commands.reject.reset();
                setRejecting(true);
              }}
              disabled={commands.confirm.isPending || commitWaits}
            >
              {t('workflowExecution.confirmation.reject')}
            </Button>
          ) : null}
        </>
      ),
      dialogs: actions.reject ? (
        <RejectResultDialog
          open={rejecting}
          onOpenChange={setRejecting}
          stepTitle={position.step.title}
          result={result}
          keepsDrafts={(position.confirms.approvesDrafts ?? []).length > 0}
          pending={commands.reject.isPending}
          error={commands.reject.error}
          onSubmit={(feedback) =>
            commands.reject.mutate(
              { step: position.step.id, attempt: attempt.number, feedback },
              { onSuccess: () => setRejecting(false) },
            )
          }
        />
      ) : null,
      keepsMenu: true,
      showHandoff: false,
    };
  }

  if (heldElsewhere && (!view || position.kind !== 'active')) {
    // One notice for the whole block: nothing of the workflow changes until the commit ran.
    return { note: heldNote, keepsMenu: true, showHandoff: true };
  }

  if (!view || position.kind !== 'active') {
    // A made commit is a line of the Last hand-off; a failed one keeps its note and Retry commit.
    const handoffCommit = commitLine(t, attemptCommit);
    if (handoffCommit) {
      return { note: null, keepsMenu: true, showHandoff: true, handoffCommit };
    }

    return attemptCommit
      ? {
          note: (
            <AttemptCommitNote
              commit={attemptCommit}
              retrying={commands.retryCommit.isPending}
              error={commands.retryCommit.error}
              onRetry={() =>
                attemptCommit.state === 'failed'
                  ? commands.retryCommit.mutate({
                      step: attemptCommit.step,
                      attempt: attemptCommit.attempt,
                    })
                  : undefined
              }
            />
          ),
          keepsMenu: true,
          showHandoff: true,
        }
      : undefined;
  }

  const stepTitle = position.step.title;
  const stage = agentStageOf(view);
  const attempt = position.attempt.number;
  const sent = { step: view.step, attempt: view.attempt };
  const failed = commands.stop.isError
    ? commands.stop.error
    : commands.continueAttempt.isError
      ? commands.continueAttempt.error
      : commands.checkOutcome.isError
        ? commands.checkOutcome.error
        : undefined;
  const refusal = continueRefusal(view);
  const returnRequest = view.returnRequest;
  // The target's title, never its id; the Return menu is gone while the request waits.
  const returnTarget =
    actions.return?.targets.find((target) => target.step === returnRequest?.to)?.title ??
    t('workflowExecution.agentAttempt.earlierStep');

  if (returnRequest?.state === 'requested') {
    // The Return waits for proof that the agent's process ended; Stop again only when stopping failed.
    const stopFailed = returnRequest.stop === 'failed';
    const applies = returnRequest.appliesOn === 'next-action';

    return {
      positionLine: line(
        t(
          applies
            ? 'workflowExecution.agentAttempt.line.returnStopped'
            : 'workflowExecution.agentAttempt.line.returnRequested',
          { attempt },
        ),
        view,
      ),
      note: (
        <div className="grid gap-2">
          {stopFailed ? (
            <InlineNote tone="attention" role="alert">
              {t('workflowExecution.agentAttempt.returnStopFailed', { target: returnTarget })}
            </InlineNote>
          ) : (
            <InlineNote tone="info" icon={applies ? undefined : 'loader'}>
              {t(
                applies
                  ? 'workflowExecution.agentAttempt.returnNextAction'
                  : 'workflowExecution.agentAttempt.returnNote',
                { target: returnTarget },
              )}
            </InlineNote>
          )}
          {failed ? <WorkflowRefusalAlert error={failed} /> : null}
        </div>
      ),
      actions: stopFailed ? (
        <Button
          variant="secondary"
          leadingIcon={CircleStop}
          onClick={() => commands.stop.mutate(view.attemptId)}
          disabled={commands.stop.isPending}
          aria-busy={commands.stop.isPending}
        >
          {t('workflowExecution.agentAttempt.stopAgain')}
        </Button>
      ) : applies ? undefined : (
        <Button variant="secondary" disabled aria-busy>
          {t('workflowExecution.agentAttempt.returning')}
        </Button>
      ),
      // Once the agent stopped, the owner's next action applies the return: Return stays in the menu.
      keepsMenu: applies,
      showHandoff: true,
    };
  }

  switch (stage.stage) {
    case 'working': {
      // A pending question or permission: the agent does nothing until the owner answers it, so
      // the note never says there is nothing to do (dogfood #189, N4).
      const waiting = waitingForOwnerOf(view, sessionFacts.status);
      const stopButton = (
        <Button
          variant="secondary"
          leadingIcon={CircleStop}
          onClick={() => commands.stop.mutate(view.attemptId)}
          disabled={commands.stop.isPending}
          aria-busy={commands.stop.isPending}
        >
          {commands.stop.isPending
            ? t('workflowExecution.agentAttempt.stopping')
            : t('workflowExecution.agentAttempt.stop')}
        </Button>
      );
      if (waiting && !failed) {
        const what = waiting.kind ?? 'input';

        return {
          positionLine: line(
            t('workflowExecution.agentAttempt.line.waiting', {
              attempt,
              since: when(view.turn.boundAt, true),
            }),
            view,
          ),
          note: (
            <InlineNote tone="attention" role="status">
              <span className={STRONG}>
                {t(`workflowExecution.agentAttempt.waiting.title.${what}`)}
              </span>{' '}
              {t('workflowExecution.agentAttempt.waiting.body')}
            </InlineNote>
          ),
          actions: (
            <>
              <OpenSessionButton
                sessionId={view.sessionId}
                label={t(`workflowExecution.agentAttempt.waiting.open.${what}`)}
              />
              {stopButton}
            </>
          ),
          dialogs: null,
          keepsMenu: true,
          showHandoff: true,
        };
      }

      return {
        positionLine: line(
          t('workflowExecution.agentAttempt.line.working', {
            attempt,
            since: when(view.turn.boundAt, true),
          }),
          view,
        ),
        note: failed ? (
          <WorkflowRefusalAlert error={failed} />
        ) : (
          <Typography as="p" variant="body-sm" className="text-content-secondary">
            {t('workflowExecution.agentAttempt.workingNote')}
          </Typography>
        ),
        actions: stopButton,
        dialogs: null,
        keepsMenu: true,
        showHandoff: true,
      };
    }

    case 'stopping':
      return {
        positionLine: line(t('workflowExecution.agentAttempt.line.stopping', { attempt }), view),
        note: (
          <InlineNote tone="info" icon="loader">
            {t('workflowExecution.agentAttempt.stoppingNote', { step: stepTitle })}
          </InlineNote>
        ),
        actions: (
          <Button variant="secondary" disabled aria-busy>
            {t('workflowExecution.agentAttempt.stopping')}
          </Button>
        ),
        dialogs: null,
        keepsMenu: false,
        showHandoff: true,
      };
    case 'unknown':
      return {
        positionLine: line(t('workflowExecution.agentAttempt.line.unknown', { attempt }), view),
        note: (
          <div className="grid gap-2">
            <InlineNote tone="danger" role="alert">
              <span className={STRONG}>{t('workflowExecution.agentAttempt.unknown.title')}</span>{' '}
              {t('workflowExecution.agentAttempt.unknown.body')}
            </InlineNote>
            {failed ? <WorkflowRefusalAlert error={failed} /> : null}
          </div>
        ),
        actions: (
          <Button
            leadingIcon="refresh"
            onClick={() =>
              commands.checkOutcome.mutate({ sessionId: view.sessionId, turnId: view.turn.turnId })
            }
            disabled={commands.checkOutcome.isPending}
            aria-busy={commands.checkOutcome.isPending}
          >
            {commands.checkOutcome.isPending
              ? t('workflowExecution.agent.checkingAgain')
              : t('workflowExecution.agentAttempt.checkOutcome')}
          </Button>
        ),
        dialogs: null,
        keepsMenu: false,
        showHandoff: true,
      };
    case 'session-missing':
    case 'stopped': {
      const missing = stage.stage === 'session-missing';
      const proposal = stage.stage === 'stopped' ? stage.proposal : undefined;
      const exit = position.exits.find((candidate) => candidate.id === proposal?.transition);
      const result = exit ? transitionLabel(exit) : proposal ? humanizeId(proposal.transition) : '';
      const text = missing
        ? t('workflowExecution.agentAttempt.line.sessionMissing', { attempt })
        : proposal?.state === 'refused'
          ? t('workflowExecution.agentAttempt.line.refused', { attempt })
          : proposal?.state === 'pending'
            ? t('workflowExecution.agentAttempt.line.applying', { attempt })
            : t('workflowExecution.agentAttempt.line.stopped', {
                attempt,
                at: when(view.turn.endedAt ?? view.turn.boundAt, true),
              });
      const explanation = missing ? (
        <InlineNote tone="attention">
          <span className={STRONG}>{t('workflowExecution.agentAttempt.missing.title')}</span>{' '}
          {t('workflowExecution.agentAttempt.missing.body')}
        </InlineNote>
      ) : proposal?.state === 'refused' && proposal.refusal ? (
        <InlineNote tone="danger" role="alert">
          <span className={STRONG}>
            {t('workflowExecution.agentAttempt.refused.title', { result })}
          </span>
          <RefusalReasons refusal={proposal.refusal} />
          <span className="mt-1 block">{t('workflowExecution.agentAttempt.refused.next')}</span>
        </InlineNote>
      ) : proposal?.state === 'pending' ? (
        <InlineNote tone="info" icon="loader">
          {t('workflowExecution.agentAttempt.applying', { result })}
        </InlineNote>
      ) : refusal ? null : (
        <InlineNote tone="attention">
          <span className={STRONG}>{t('workflowExecution.agentAttempt.noResult.title')}</span>{' '}
          {t('workflowExecution.agentAttempt.noResult.body')}
        </InlineNote>
      );
      const continuing = commands.continueAttempt.isPending;
      // The projection does not read the checkout: a Continue the start refused (its baseline)
      // answers with the reason, shown here in place of a generic refusal.
      const answered = commands.continueAttempt.isError
        ? workflowRefusalOf(commands.continueAttempt.error).agent
        : undefined;
      const answeredRefusal = answered?.kind === 'unavailable' ? answered : undefined;
      const shownRefusal = refusal ?? answeredRefusal;
      const { work } = view;
      const docNames = work.documents.map((path) => path.split('/').at(-1) ?? path);
      const filePaths = [...new Set([...(work.changed?.paths ?? []), ...work.declared])].filter(
        (path) => !work.documents.includes(path) && !work.mixed.includes(path),
      );
      const kept =
        docNames.length > 0 || filePaths.length > 0 ? (
          <Typography as="p" variant="body-sm" className="text-content-secondary">
            {t('workflowExecution.agentAttempt.keptLead')}{' '}
            <KeptDocuments paths={work.documents} openDocument={links.document} />
            {filePaths.length > 0
              ? t(
                  docNames.length > 0
                    ? 'workflowExecution.agentAttempt.keptFiles'
                    : 'workflowExecution.agentAttempt.keptFilesOnly',
                  { count: filePaths.length },
                )
              : null}
            {links.attempt ? (
              <>
                {' '}
                <InlineAction onClick={links.attempt}>
                  {t('workflowExecution.agentAttempt.seeAttempt')}
                </InlineAction>
              </>
            ) : null}
          </Typography>
        ) : null;
      const canTakeOver = view.takeOver.kind === 'available';
      const takeOverPaths = [...new Set([...work.documents, ...work.mixed, ...filePaths])];

      return {
        positionLine: line(text, view),
        note: (
          <div className="grid gap-2">
            {explanation}
            {returnRequest?.state === 'refused' ? (
              <InlineNote tone="attention">
                {t('workflowExecution.agentAttempt.returnRefused', {
                  target: returnTarget,
                  reason: returnRequest.refusal?.message ?? '',
                  code: returnRequest.refusal?.code ?? '',
                })}
              </InlineNote>
            ) : null}
            {shownRefusal ? (
              <ContinueRefused
                refusal={shownRefusal}
                specId={subject.specId}
                step={stepTitle}
                onCheckAgain={() => void commands.refresh()}
              />
            ) : null}
            {kept}
            {failed && !answeredRefusal ? <WorkflowRefusalAlert error={failed} /> : null}
          </div>
        ),
        actions: (
          <>
            <Button
              onClick={() => {
                // A missing Turn is retried as it was; a Continue asks for an optional note first.
                if (missing) {
                  commands.continueAttempt.mutate(sent);
                } else {
                  commands.continueAttempt.reset();
                  setContinuingWithNote(true);
                }
              }}
              disabled={refusal !== undefined || continuing || proposal?.state === 'pending'}
              aria-busy={continuing}
            >
              {continuing
                ? t('workflowExecution.agent.submitting')
                : missing
                  ? t('workflowExecution.agentAttempt.retryStart')
                  : t('workflowExecution.agentAttempt.continue')}
            </Button>
            {canTakeOver ? (
              <Button variant="secondary" onClick={() => setTakingOver(true)}>
                {t('workflowExecution.agentAttempt.takeOver')}
              </Button>
            ) : null}
          </>
        ),
        dialogs: (
          <>
            <ContinueDialog
              open={continuingWithNote}
              onOpenChange={setContinuingWithNote}
              stepTitle={stepTitle}
              attempt={attempt}
              {...(sessionFacts.providerModeTitle
                ? { workMode: sessionFacts.providerModeTitle }
                : {})}
              pending={continuing}
              // Answered or refused, the Now block says what happened, as for a Continue without a
              // note (a refusal's reason is shown there, with Check again).
              onContinue={(note) =>
                commands.continueAttempt.mutate(
                  { ...sent, ...(note !== undefined ? { note } : {}) },
                  { onSettled: () => setContinuingWithNote(false) },
                )
              }
            />
            {canTakeOver ? (
              <TakeOverDialogFor
                specId={subject.specId}
                sessionId={view.sessionId}
                gone={ownRefusal(view.continue) === 'session-gone'}
                open={takingOver}
                onOpenChange={setTakingOver}
                stepTitle={stepTitle}
                nextAttempt={attempt + 1}
                paths={takeOverPaths}
                pending={commands.takeOver.isPending}
                error={commands.takeOver.error}
                onConfirm={() =>
                  commands.takeOver.mutate(sent, { onSuccess: () => setTakingOver(false) })
                }
              />
            ) : null}
          </>
        ),
        keepsMenu: true,
        showHandoff: true,
      };
    }
  }
}

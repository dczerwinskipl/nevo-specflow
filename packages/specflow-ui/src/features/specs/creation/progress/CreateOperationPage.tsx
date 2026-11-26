import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, InlineNote, Separator, Typography } from '@nevo/ui';
import type { CreatedSpec } from '@nevo/specflow-contracts/specs';
import { productIcons } from '../../../../shared/product-icons';
import { useNotify } from '../../../../shared/notifications/notifications';
import { AgentBlocker, AgentStartDialog } from '../../../tasks';
import { FlowParentBack } from '../../../../app/navigation/ApplicationLocation';
import { useMessage } from '../../../../i18n/message';
import { useAnnouncer } from '../../../../shared/a11y/useAnnouncer';
import {
  OperationStatusTile,
  type OperationStatusTone,
} from '../../../../shared/operations/panel/OperationStatusTile';
import { CreateFailurePanel } from '../errors/CreateFailurePanel';
import { CreateOperationProgress } from './CreateOperationProgress';
import { createRunningStepTitle } from './createProgress';
import { CreateShell } from '../CreateShell';
import type { CreateFailure } from '../errors/createFailure';
import { useCreateOperationStorage } from '../operation/createOperationStorage';
import {
  createPageHeading,
  createPageStatus,
  createPageView,
  createSettingsModel,
  type CreatePageView,
} from './createPageView';
import { CreateSettingsList } from './CreateSettingsList';
import { CreateTechnicalDetails } from './CreateTechnicalDetails';
import { useCreateOperationProgress } from './useCreateOperationProgress';
import { useCreateProjectSpecification } from '../operation/useCreateProjectSpecification';
import { useStillWorking } from './useStillWorking';
import { initialWorkspaceChoice, type WorkspaceChoice } from '../workspace/model/workspaceChoice';

/** How long the finished checklist stays in view before the new specification opens. */
export const openAfterCreatedMs = 1500;

const toneOf = {
  working: 'running',
  completed: 'success',
  refused: 'danger',
  unknown: 'attention',
  'not-found': 'attention',
} as const satisfies Record<CreatePageView, OperationStatusTone>;

const withoutSnapshot = ({
  snapshot: _snapshot,
  ...failure
}: CreateFailure & { snapshot: string }) => failure;

/** What "Back to form" carries to the form on top of the draft the form left. */
type FormPatch = { choice: (choice: WorkspaceChoice) => WorkspaceChoice } | undefined;

/**
 * The page of one Create operation (`/specs/new/creating/:operationId`): it executes and monitors
 * the operation the form handed over (sends it when the server has not seen it, follows the live
 * stream and polls the inspection through `useCreateProjectSpecification`), and tells the owner
 * clearly what is going on. Opened for an operation this browser holds no request for, it shows
 * what the server knows. It owns no operation rule: the reducer decides the state, the hook does
 * the I/O, and this component only presents the result and routes the way out.
 */
export function CreateOperationPage({
  operationId,
  onOpen,
  onBackToForm,
  onBackToSpecifications,
  onOpenSession,
}: {
  operationId: string;
  /** Opens the created specification (automatically after a short moment, or on the button). */
  onOpen: (created: CreatedSpec) => void;
  /**
   * Returns to the Create form. A given operation id is the explicit "Back to form" path: the form
   * restores the draft kept for that operation. Without it the form opens empty.
   */
  onBackToForm: (restoreDraftOf?: string) => void;
  /** Leaves for the specification list; the operation goes on and is shown there. */
  onBackToSpecifications: () => void;
  /** Opens the agent's Session (Create with an agent, once the agent started). */
  onOpenSession?: (sessionId: string) => void;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const storage = useCreateOperationStorage();
  const { announce, region } = useAnnouncer();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const configurationId = useId();
  const [created, setCreated] = useState<CreatedSpec>();
  const [runWithAgent, setRunWithAgent] = useState(false);
  const notify = useNotify();

  // The request this browser sent, if any; a direct link has none and shows what the server knows.
  const [stored] = useState(() => {
    return storage.load(operationId);
  });
  const [ownDraft] = useState(() => storage.loadDraft(operationId));

  const onCreated = useCallback((result: CreatedSpec) => setCreated(result), []);
  const { state, flags, unknownOperation, actions } = useCreateProjectSpecification({
    stored,
    operationId,
    snapshot: '',
    onCreated,
    announce,
  });
  const view = createPageView(state, unknownOperation);
  const working = view === 'working';
  const stillWorking = useStillWorking(working && flags.monitoring);
  const { progress, reportedFailure } = useCreateOperationProgress({
    operationId,
    working,
    onStreamHint: actions.setStreamHint,
  });
  // Create with an agent: the step the agent starts and, once Create completed, what became of it.
  const agentPath =
    Boolean(stored?.request.firstStep) || Boolean(ownDraft?.agent) || Boolean(created?.firstStep);
  const firstStepTitle =
    created?.firstStep?.step.title ?? ownDraft?.agent?.firstStepTitle ?? undefined;
  const agentResult = created?.firstStep;
  const agentNotStarted = agentResult?.status === 'not-started' ? agentResult : undefined;
  // The step that runs now: the subtitle names it instead of a generic line.
  const runningStep = working ? createRunningStepTitle(progress.steps, firstStepTitle) : undefined;

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // The finished checklist is seen for a moment, then the specification opens (the button is faster).
  // The timer starts once, when the result arrives: the host passes a new `onOpen` on every render
  // and the page keeps re-rendering (progress, announcements), which must not restart it.
  const openLatest = useRef({ onOpen, onOpenSession, notify, t });
  useLayoutEffect(() => {
    openLatest.current = { onOpen, onOpenSession, notify, t };
  });
  useEffect(() => {
    // Files left uncommitted stay on this page: what to do about them is read before it opens. An
    // agent that did not start stays too: the page says why and how to go on.
    if (!created || created.uncommitted || created.firstStep?.status === 'not-started') {
      return;
    }

    const started = created.firstStep;
    const timer = setTimeout(() => {
      const latest = openLatest.current;
      if (started?.status === 'started' && latest.onOpenSession) {
        latest.notify(latest.t('create.page.agentStarted', { step: started.step.title }));
        latest.onOpenSession(started.sessionId);
      } else {
        latest.onOpen(created);
      }
    }, openAfterCreatedMs);

    return () => clearTimeout(timer);
  }, [created]);

  const sent = state.sent ?? stored?.request;
  const title = [sent?.title, ownDraft?.title].map((value) => value?.trim()).find(Boolean);
  const target = sent?.target;
  const settings = createSettingsModel(
    stored?.request,
    ownDraft?.goal,
    ownDraft?.facts,
    ownDraft?.title,
    { title: ownDraft?.archetypeTitle, documents: ownDraft?.documentFiles },
    ownDraft?.agent,
  );
  const failure = state.failure;
  // A failure that kept the operation (a lost session) is tried again here; a refusal ends it.
  const retainable = view === 'refused' && state.retained;

  const backToForm = (patch: FormPatch = undefined, keepFailure = true) => {
    const base = storage.loadDraft(operationId);
    if (base) {
      const { failure: _previous, ...rest } = base;
      const refusal = keepFailure && failure ? withoutSnapshot(failure) : undefined;
      storage.saveDraft({
        ...rest,
        choice: patch ? patch.choice(base.choice) : base.choice,
        ...(refusal ? { failure: refusal } : {}),
      });
    }

    onBackToForm(operationId);
  };

  // One heading carries the state and the name (the full name is in the configuration list).
  const headingText = text(createPageHeading(view, view === 'not-found' ? undefined : title));
  const newWorkspace =
    (settings?.place ?? (target?.kind === 'new-worktree' ? 'new' : 'main')) === 'new';
  // The one status line of the page; it is also what is announced, once per change.
  const status = createPageStatus({
    view,
    failure,
    stillWorking,
    runningStep,
    monitoring: flags.monitoring,
    reading: Boolean(state.sent && state.resumedFrom),
    newWorkspace,
    uncommitted: created?.uncommitted === true,
    firstStep: agentResult && {
      title: agentResult.step.title,
      started: agentResult.status === 'started',
    },
  });
  const statusText = status ? text(status) : undefined;
  useEffect(() => {
    if (statusText) {
      announce(statusText);
    }
  }, [announce, statusText]);

  const checkLabel = state.checking
    ? t('create.submit.checking')
    : failure?.kind === 'recovery-required'
      ? t('create.submit.checkOperation')
      : t('create.submit.checkResult');

  return (
    <CreateShell title={t('create.page.location')}>
      {/* The flow Back takes the Create screens' one gap (gap-6); the page keeps its own rhythm. */}
      <div className="grid gap-6">
        <FlowParentBack view="new-specification" />
        <div className="grid gap-8">
          <header className="flex min-w-0 items-start gap-4">
            {/* Static while running: the active step of the checklist carries the page's only spinner. */}
            <OperationStatusTile
              tone={created?.uncommitted || agentNotStarted ? 'attention' : toneOf[view]}
              animated={false}
            />
            <div className="grid min-w-0 gap-1">
              <Typography
                as="h1"
                variant="title-lg"
                ref={headingRef}
                tabIndex={-1}
                className="line-clamp-3 min-w-0 outline-none [overflow-wrap:anywhere]"
              >
                {headingText}
              </Typography>
              <Typography as="p" variant="body-md" className="min-h-6 text-content-secondary">
                {statusText}
              </Typography>
            </div>
          </header>

          {(working || created) && (
            <div>
              <CreateOperationProgress
                progress={progress}
                reportedFailure={reportedFailure}
                target={target}
                working={working}
                completed={Boolean(created)}
                commits={settings?.commit === true && !created?.uncommitted}
                newWorkspace={newWorkspace}
                monitoring={flags.monitoring}
                firstStep={
                  agentPath && firstStepTitle
                    ? {
                        title: firstStepTitle,
                        ...(agentResult ? { started: agentResult.status === 'started' } : {}),
                      }
                    : undefined
                }
              />
            </div>
          )}

          {created?.uncommitted && (
            <Alert role="status" tone="attention" title={t('create.page.uncommitted.title')}>
              <p>{t('create.page.uncommitted.body')}</p>
            </Alert>
          )}

          {created &&
            agentNotStarted &&
            (agentNotStarted.agent?.kind === 'unavailable' ? (
              <AgentBlocker
                option={agentNotStarted.agent}
                specId={created.specId}
                step={agentNotStarted.step.title}
                role={undefined}
                checking={false}
                urgent
              />
            ) : (
              <Alert role="alert" tone="attention" title={t('create.page.agentNotStarted.title')}>
                <p>{t('create.page.agentNotStarted.body', { step: agentNotStarted.step.title })}</p>
              </Alert>
            ))}

          {view === 'not-found' && (
            <Alert role="status" tone="info" title={t('create.page.notFound.title')}>
              <p>{t('create.page.notFound.body')}</p>
            </Alert>
          )}

          {(view === 'refused' || view === 'unknown') && failure && (
            <CreateFailurePanel
              failure={failure}
              state={state}
              workspaceOptions={undefined}
              showDiagnostics={false}
              typedTitle={title ?? ''}
              refreshing={false}
              announce={announce}
              onRefresh={() => backToForm()}
              onUseAutomaticName={() =>
                backToForm(
                  { choice: (choice) => ({ ...choice, branch: initialWorkspaceChoice.branch }) },
                  false,
                )
              }
              onUseCustomName={() =>
                backToForm(
                  {
                    choice: (choice) => ({
                      ...choice,
                      branch: choice.branch.on
                        ? choice.branch
                        : { on: true, name: '', edited: false },
                    }),
                  },
                  false,
                )
              }
            />
          )}

          {view !== 'not-found' && (
            <section
              className="grid gap-4"
              aria-labelledby={settings ? configurationId : undefined}
            >
              <Separator />
              {settings && (
                <>
                  <Typography as="h2" variant="title-sm" id={configurationId}>
                    {t('create.page.configuration')}
                  </Typography>
                  <CreateSettingsList settings={settings} />
                </>
              )}
              <CreateTechnicalDetails settings={settings} operationId={operationId} />
            </section>
          )}

          {(working || view === 'unknown') && (
            <InlineNote>
              {agentPath ? t('create.page.leaveNoteAgent') : t('create.page.leaveNote')}
            </InlineNote>
          )}

          <div className="flex flex-col gap-3 @lg:flex-row">
            {created && agentNotStarted && (
              <Button leadingIcon={productIcons.agent} onClick={() => setRunWithAgent(true)}>
                {`${t('workflowExecution.now.runWithAgent')}…`}
              </Button>
            )}
            {created && (
              <Button
                variant={agentNotStarted ? 'secondary' : 'primary'}
                onClick={() => onOpen(created)}
              >
                {t('create.page.openSpecification')}
              </Button>
            )}
            {view === 'unknown' && (
              <Button disabled={state.checking} onClick={() => void actions.check()}>
                {checkLabel}
              </Button>
            )}
            {view === 'refused' &&
              (retainable ? (
                <Button onClick={() => void actions.retry()}>{t('create.page.tryAgain')}</Button>
              ) : (
                <Button onClick={() => backToForm()}>{t('create.page.backToForm')}</Button>
              ))}
            {created &&
              agentNotStarted &&
              (agentNotStarted.agent?.kind === 'unavailable' ? (
                <AgentBlocker
                  option={agentNotStarted.agent}
                  specId={created.specId}
                  step={agentNotStarted.step.title}
                  role={undefined}
                  checking={false}
                  urgent
                />
              ) : (
                <Alert role="alert" tone="attention" title={t('create.page.agentNotStarted.title')}>
                  <p>
                    {t('create.page.agentNotStarted.body', { step: agentNotStarted.step.title })}
                  </p>
                </Alert>
              ))}

            {view === 'not-found' && (
              <Button variant="secondary" onClick={() => onBackToForm()}>
                {t('create.page.backToCreate')}
              </Button>
            )}
            {!created && (
              <Button variant="secondary" onClick={onBackToSpecifications}>
                {t('create.page.backToSpecifications')}
              </Button>
            )}
          </div>
          {region}
        </div>
      </div>
      {created && agentNotStarted && (
        // The existing Run with agent dialog: it checks again and sends a new request, with the
        // agent chosen in the form preselected (it can be changed).
        <AgentStartDialog
          subject={{ specId: created.specId }}
          step={agentNotStarted.step}
          open={runWithAgent}
          onOpenChange={setRunWithAgent}
          initialChoice={
            ownDraft?.agent && {
              providerId: ownDraft.agent.providerId,
              modelId: ownDraft.agent.modelId,
              ...(ownDraft.agent.effort ? { effort: ownDraft.agent.effort } : {}),
            }
          }
          onStarted={(result) => {
            if ('sessionId' in result && onOpenSession) {
              onOpenSession(result.sessionId);
            } else {
              onOpen(created);
            }
          }}
        />
      )}
    </CreateShell>
  );
}

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Button, InlineNote, Separator, Typography } from '@nevo/ui';
import type { CreatedSpec } from '@nevo/specflow-contracts/specs';
import { ApplicationContextLine } from '../../../app/navigation/ApplicationLocation';
import { useAnnouncer } from '../../../shared/a11y/useAnnouncer';
import {
  OperationStatusTile,
  type OperationStatusTone,
} from '../../../shared/operations/OperationStatusTile';
import { CreateFailurePanel } from './CreateFailurePanel';
import { CreateOperationProgress } from './CreateOperationProgress';
import { CreateShell } from './CreateShell';
import type { CreateFailure } from './createFailure';
import { useCreateOperationStorage } from './createOperationStorage';
import { createPageView, createSettingsModel, type CreatePageView } from './createPageView';
import { CreateSettingsList } from './CreateSettingsList';
import { CreateTechnicalDetails } from './CreateTechnicalDetails';
import { useCreateProjectSpecification } from './useCreateProjectSpecification';
import { useStillWorking } from './useStillWorking';
import { initialWorkspaceChoice, type WorkspaceChoice } from './workspace/workspaceChoice';

/** How long the finished checklist stays in view before the new specification opens. */
export const openAfterCreatedMs = 1500;

const headingKeys = {
  working: 'create.page.heading.working',
  completed: 'create.page.heading.completed',
  refused: 'create.page.heading.refused',
  unknown: 'create.page.heading.unknown',
  'not-found': 'create.page.heading.notFound',
} as const satisfies Record<CreatePageView, string>;

/** The same headings with the specification name; the page uses them whenever the name is known. */
const namedHeadingKeys = {
  working: 'create.page.heading.workingNamed',
  completed: 'create.page.heading.completedNamed',
  refused: 'create.page.heading.refusedNamed',
  unknown: 'create.page.heading.unknownNamed',
} as const satisfies Partial<Record<CreatePageView, string>>;

/** Refusals that happen before anything is done: the page may say nothing was created. */
const nothingCreatedKinds: ReadonlySet<CreateFailure['kind']> = new Set([
  'branch-exists',
  'branch-invalid',
  'stale',
  'name-conflict',
  'offline',
  'forbidden',
  'unauthenticated',
]);

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
}: {
  operationId: string;
  /** Opens the created specification (automatically after a short moment, or on the button). */
  onOpen: (created: CreatedSpec) => void;
  /** Returns to the Create form; it finds the draft the page kept. */
  onBackToForm: () => void;
  /** Leaves for the specification list; the operation goes on and is shown there. */
  onBackToSpecifications: () => void;
}) {
  const { t } = useTranslation();
  const storage = useCreateOperationStorage();
  const { announce, region } = useAnnouncer();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const configurationId = useId();
  const [created, setCreated] = useState<CreatedSpec>();

  // The request this browser sent, if any; a direct link has none and shows what the server knows.
  const [stored] = useState(() => {
    const operation = storage.load();
    return operation?.request.operationId === operationId ? operation : undefined;
  });
  const [draft] = useState(() => storage.loadDraft());
  const ownDraft = draft?.operationId === operationId ? draft : undefined;

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

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // The finished checklist is seen for a moment, then the specification opens (the button is faster).
  useEffect(() => {
    if (!created) return;
    announce(t('create.page.status.completed'));
    const timer = setTimeout(() => onOpen(created), openAfterCreatedMs);
    return () => clearTimeout(timer);
  }, [announce, created, onOpen, t]);

  const sent = state.sent ?? stored?.request;
  const title = [sent?.title, ownDraft?.title].map((value) => value?.trim()).find(Boolean);
  const target = sent?.target;
  const settings = createSettingsModel(stored?.request, ownDraft?.goal, ownDraft?.facts);
  const failure = state.failure;
  // A failure that kept the operation (a lost session) is tried again here; a refusal ends it.
  const retainable = view === 'refused' && storage.load()?.request.operationId === operationId;

  const backToForm = (patch: FormPatch = undefined, keepFailure = true) => {
    const base = storage.loadDraft();
    if (base) {
      const { failure: _previous, ...rest } = base;
      const refusal = keepFailure && failure ? withoutSnapshot(failure) : undefined;
      storage.saveDraft({
        ...rest,
        choice: patch ? patch.choice(base.choice) : base.choice,
        ...(refusal ? { failure: refusal } : {}),
      });
    }
    onBackToForm();
  };

  // One heading carries the state and the name; the full name stays available as the tooltip.
  const headingView = created ? 'completed' : view;
  const headingName = title && view !== 'not-found' ? title : undefined;
  const headingText =
    headingName && headingView !== 'not-found'
      ? t(namedHeadingKeys[headingView], { name: headingName })
      : t(headingKeys[headingView]);

  const newWorkspace =
    (settings?.place ?? (target?.kind === 'new-worktree' ? 'new' : 'main')) === 'new';
  // What is going on now (subtitle), or, for a refusal that changed nothing, what was NOT created.
  const statusText = created
    ? t('create.page.status.completed')
    : view === 'refused' && failure && nothingCreatedKinds.has(failure.kind)
      ? t('create.page.notCreated')
      : working
        ? stillWorking
          ? t('create.page.status.stillWorking')
          : flags.monitoring
            ? t(newWorkspace ? 'create.page.status.workingNew' : 'create.page.status.working')
            : state.sent && state.resumedFrom
              ? t('create.page.status.reading')
              : t('create.page.status.sending')
        : undefined;

  const checkLabel = state.checking
    ? t('create.submit.checking')
    : failure?.kind === 'recovery-required'
      ? t('create.submit.checkOperation')
      : t('create.submit.checkResult');

  return (
    <CreateShell width="narrow" title={t('create.page.location')}>
      <div className="grid gap-8">
        <ApplicationContextLine className="mb-0" view="new-specification" />
        <header className="flex min-w-0 items-start gap-4">
          <OperationStatusTile tone={created ? 'success' : toneOf[view]} />
          <div className="grid min-w-0 gap-1">
            <Typography
              as="h1"
              variant="title-lg"
              ref={headingRef}
              tabIndex={-1}
              className="line-clamp-3 min-w-0 outline-none [overflow-wrap:anywhere]"
              title={headingName}
            >
              {headingText}
            </Typography>
            <Typography
              as="p"
              variant="body-md"
              role="status"
              aria-live="polite"
              className="min-h-6 text-content-secondary"
            >
              {statusText}
            </Typography>
          </div>
        </header>

        {(working || created) && (
          <section aria-label={t('create.progress.label')}>
            <CreateOperationProgress
              operationId={operationId}
              target={target}
              working={working}
              completed={Boolean(created)}
              monitoring={flags.monitoring}
              onStreamHint={actions.setStreamHint}
            />
          </section>
        )}

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
                    settingsOpen: true,
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
          <section className="grid gap-4" aria-labelledby={settings ? configurationId : undefined}>
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

        {(working || view === 'unknown') && <InlineNote>{t('create.page.leaveNote')}</InlineNote>}

        <div className="flex flex-col gap-3 @lg:flex-row">
          {created && (
            <Button onClick={() => onOpen(created)}>{t('create.page.openSpecification')}</Button>
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
          {view === 'not-found' && (
            <Button variant="secondary" onClick={onBackToForm}>
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
    </CreateShell>
  );
}

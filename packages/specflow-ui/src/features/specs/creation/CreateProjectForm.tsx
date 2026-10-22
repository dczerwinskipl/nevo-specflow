import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useVisitFreshOptions } from './visitFreshOptions';
import { Alert, Field, Separator, TextArea, TextInput, Typography } from '@nevo/ui';
import type { CreatedSpec } from '@nevo/specflow-contracts/specs';
import type { CreateFailure } from './createFailure';
import { isApiError } from '../../../api';
import { ApplicationContextLine } from '../../../app/navigation/ApplicationLocation';
import { useAppServices } from '../../../app/useAppServices';
import { useMessage } from '../../../i18n/message';
import { OperationProgress } from '../../../shared/operations/OperationProgress';
import { useOperationProgress } from '../../../shared/operations/useOperationProgress';
import { projectCreationKeys } from './api.project';
import { CreateFailureAlert, type CopyKind } from './CreateFailureAlert';
import { CreateFooter } from './CreateFooter';
import { CreateLeaveDialog } from './CreateLeaveDialog';
import { CreateShell } from './CreateShell';
import { buildOperationDetails } from './createOperationDetails';
import {
  createProgressLabel,
  createProgressPlaceholderRows,
  createProgressSteps,
} from './createProgress';
import { useCreateOperationStorage } from './createOperationStorage';
import {
  createGoalMaxLength,
  createTitleMaxLength,
  projectCreateReadiness,
} from './createProjectReadiness';
import { useCreateLeaveGuard } from './useCreateLeaveGuard';
import { useCreateProjectSpecification } from './useCreateProjectSpecification';
import type { StreamHint } from './watchCreateOperation';
import { useRevealFailure } from './useRevealFailure';
import {
  WorkspaceSection,
  type WorkspaceOptionsState,
  type WorkspaceSectionHandle,
} from './WorkspaceSection';
import {
  activeTile,
  buildCreateSlug,
  buildCreateTarget,
  initialWorkspaceChoice,
  requestChoiceSnapshot,
  revalidate,
  type WorkspaceChoice,
} from './workspaceChoice';

/**
 * The Create form of a project Runtime: the specification name, an optional goal and where it
 * lives (new worktree, main workspace or an existing one). The agent session, workflow and initial
 * documents of the demo are not part of the real Create. The operation itself (retained id,
 * watching, check, resume) is `useCreateProjectSpecification`.
 */
export function CreateProjectForm({ onCreated }: { onCreated: (created: CreatedSpec) => void }) {
  const { t, i18n } = useTranslation();
  const text = useMessage();
  const { projectCreationApi, operationsApi } = useAppServices();
  const storage = useCreateOperationStorage();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const workspaceHandle = useRef<WorkspaceSectionHandle>(null);
  const gitHeadingId = useId();

  // An operation the previous page left unconfirmed: the form starts from what was sent.
  const [stored] = useState(() => storage.load());

  const createOptions = useQuery({
    queryKey: projectCreationKeys.createOptions,
    queryFn: ({ signal }) => projectCreationApi.createOptions(signal),
    // The Git state changes outside the UI, and the answer is a snapshot, not a reservation.
    staleTime: 0,
    refetchOnMount: 'always',
    // Each fetch inspects Git state (slow); the visit-fresh refetch on mount stays, focus does not.
    refetchOnWindowFocus: false,
    retry: false,
  });
  const workspaceOptions = useVisitFreshOptions(createOptions);

  const [title, setTitle] = useState(stored?.request.title ?? ''),
    [goal, setGoal] = useState(stored?.request.goal ?? ''),
    [choice, setChoice] = useState<WorkspaceChoice>(initialWorkspaceChoice);
  const [announcement, setAnnouncement] = useState(''),
    [branchConflict, setBranchConflict] = useState<string | undefined>(),
    [focusBranchSignal, setFocusBranchSignal] = useState(0),
    [slugConflict, setSlugConflict] = useState<string | undefined>(),
    [focusSlugSignal, setFocusSlugSignal] = useState(0),
    [refreshFocusPending, setRefreshFocusPending] = useState(false);

  const configurationSnapshot = JSON.stringify({
    title,
    goal,
    choice: requestChoiceSnapshot(choice),
  });
  const [initialConfiguration] = useState(configurationSnapshot);
  const configurationDirty = configurationSnapshot !== initialConfiguration;

  const { state, flags, actions } = useCreateProjectSpecification({
    stored,
    snapshot: configurationSnapshot,
    onCreated,
    announce: setAnnouncement,
  });
  const { busy, monitoring, uncertain, recovery, forbidden: forbiddenCreate } = flags;
  const failure = state.failure;
  // Display only: named steps while the Runtime works. The operation's own state (reducer, POST,
  // inspection polling) never depends on this stream, which just falls silent if it fails.
  const progress = useOperationProgress({
    api: operationsApi,
    streamUrl: state.sent
      ? projectCreationApi.operationEventsUrl(state.sent.operationId)
      : undefined,
    enabled: busy,
  });

  // The stream only hastens the next inspection read (completed event) or switches the poll to the
  // regular backoff (stream lost); the inspection endpoint stays the single source of truth.
  const { setStreamHint } = actions;
  const streamHint: StreamHint =
    progress.outcome !== null && progress.outcome !== 'running'
      ? 'terminal'
      : progress.lost
        ? 'lost'
        : 'live';
  useEffect(() => {
    setStreamHint(streamHint);
  }, [setStreamHint, streamHint]);

  const leaveGuard = useCreateLeaveGuard({
    blocksLeave: flags.blocksLeave,
    dirty: configurationDirty,
    isNavigationAllowed: actions.isNavigationAllowed,
  });
  const reveal = useRevealFailure(state.submitFailed, state.errorSeq, failure);

  const workspaceForbidden =
    createOptions.isError &&
    isApiError(createOptions.error) &&
    createOptions.error.kind === 'forbidden';
  const workspaceState: WorkspaceOptionsState = workspaceOptions
    ? { status: 'ready', options: workspaceOptions }
    : createOptions.isError
      ? { status: workspaceForbidden ? 'forbidden' : 'error' }
      : { status: 'loading' };
  const locked = busy || uncertain || recovery || forbiddenCreate || workspaceForbidden;
  const { prerequisite, canSubmit } = projectCreateReadiness({
    title,
    goal,
    workspaceState,
    choice,
    forbidden: forbiddenCreate || workspaceForbidden,
  });

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  // A refetch (window focus, manual refresh) can invalidate a value that sits in the collapsed
  // settings panel; open it so the flagged field is visible instead of a silently blocked Create.
  useEffect(() => {
    if (!workspaceOptions) return;
    setChoice((current) => {
      if (current.settingsOpen || activeTile(current, workspaceOptions) !== 'new') return current;
      const { existing: _existing, ...settingsErrors } = revalidate(current, workspaceOptions);
      return Object.keys(settingsErrors).length > 0 ? { ...current, settingsOpen: true } : current;
    });
  }, [workspaceOptions]);

  // The alert (and the button that was focused in it) is gone: after the re-render, continue at
  // the first field the refreshed options flagged, else at the submit button.
  useEffect(() => {
    if (!refreshFocusPending || failure) return;
    setRefreshFocusPending(false);
    if (!workspaceHandle.current?.focusFirstInvalid()) submitRef.current?.focus();
  }, [refreshFocusPending, failure]);

  const refreshOptions = async () => {
    if (createOptions.isFetching) return;
    const result = await createOptions.refetch();
    // A failed refetch still resolves with the previous data: branch on the status, not on data.
    if (result.isError || !result.data) {
      setAnnouncement(t('create.announce.refreshFailed'));
      return;
    }
    const stale = Object.keys(revalidate(choice, result.data)).length > 0;
    setAnnouncement(stale ? t('create.announce.refreshedStale') : t('create.announce.refreshed'));
    // The failure described the old options; the refreshed ones are validated field by field.
    if (failure?.kind === 'stale' || failure?.kind === 'name-conflict') {
      setRefreshFocusPending(true);
      actions.dismissFailure();
    }
  };

  const submission = () => ({
    title,
    goal,
    slug: workspaceOptions ? buildCreateSlug(choice, workspaceOptions, title) : undefined,
    buildTarget: () =>
      workspaceOptions ? buildCreateTarget(choice, workspaceOptions, title) : undefined,
    snapshot: configurationSnapshot,
    onFailed: (next: CreateFailure) => {
      if (next.kind === 'name-conflict') {
        // A slug the owner typed may be the taken name: say so at the field, keep the form.
        const sentSlug = workspaceOptions
          ? buildCreateSlug(choice, workspaceOptions, title)
          : undefined;
        if (sentSlug) {
          setSlugConflict(sentSlug);
          setChoice((current) => ({ ...current, settingsOpen: true }));
          setFocusSlugSignal((value) => value + 1);
        }
        return;
      }
      if (next.kind !== 'branch-exists') return;
      if (next.automatic) setBranchConflict(undefined);
      else {
        setBranchConflict(choice.branch.name.trim());
        setChoice((current) => ({ ...current, settingsOpen: true }));
        setFocusBranchSignal((value) => value + 1);
      }
    },
  });

  const operationDetails = () =>
    buildOperationDetails({
      sent: state.sent,
      status: state.status,
      workspaceOptions,
      typedTitle: title.trim(),
      language: i18n.language,
      t,
      text,
    });
  const copyDetails = (kind: CopyKind) => {
    const copied = operationDetails()
      .map(({ id, value }) => `${t(`create.operation.detail.${id}`)}: ${value}`)
      .join('\n');
    void navigator.clipboard?.writeText(copied);
    setAnnouncement(
      t('create.announce.copied', {
        label:
          kind === 'operation'
            ? t('create.operation.copyLabelOperation')
            : t('create.operation.copyLabelDiagnostics'),
      }),
    );
  };

  const working = busy || state.checking;
  const showPrerequisite = Boolean(prerequisite) && !uncertain && !recovery;
  const submitLabel = working
    ? uncertain || recovery
      ? t('create.submit.checking')
      : t('create.submit.preparing')
    : recovery
      ? t('create.submit.checkOperation')
      : uncertain
        ? t('create.submit.checkResult')
        : t('create.submit.create');
  const note =
    uncertain || recovery ? t('create.footer.operationKept') : t('create.project.footNote');

  return (
    <CreateShell>
      <form
        className="grid gap-8"
        onSubmit={(event) => {
          event.preventDefault();
          if (recovery) {
            void actions.submit(submission());
            return;
          }
          if (!busy && (uncertain || canSubmit)) {
            reveal.captureSubmit(event);
            void actions.submit(submission());
          }
        }}
      >
        <div className="grid gap-6">
          <ApplicationContextLine className="mb-0" view="new-specification" />
          <header className="grid gap-2">
            <Typography
              as="h1"
              variant="title-lg"
              ref={headingRef}
              tabIndex={-1}
              className="outline-none"
            >
              {t('create.heading.specification')}
            </Typography>
            <Typography as="p" variant="body-md" className="text-content-secondary">
              {t('create.project.subheading')}
            </Typography>
          </header>
        </div>
        <Separator />
        <div className="grid gap-4">
          <Field>
            <Field.Label>{t('create.nameLabel')}</Field.Label>
            <TextInput
              value={title}
              maxLength={createTitleMaxLength}
              disabled={locked}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('create.namePlaceholder')}
            />
          </Field>
          <Field>
            <Field.Label>{t('create.project.goalLabel')}</Field.Label>
            <TextArea
              value={goal}
              maxLength={createGoalMaxLength}
              disabled={locked}
              onChange={(event) => setGoal(event.target.value)}
              placeholder={t('create.project.goalPlaceholder')}
            />
            <Field.Description>{t('create.project.goalHelp')}</Field.Description>
          </Field>
        </div>
        <Separator />
        <WorkspaceSection
          headingId={gitHeadingId}
          state={workspaceState}
          refreshing={createOptions.isFetching && Boolean(workspaceOptions)}
          refreshFailed={createOptions.isRefetchError}
          choice={choice}
          update={setChoice}
          locked={locked}
          onRefresh={() => void refreshOptions()}
          announcement={announcement}
          onAnnounce={setAnnouncement}
          title={title}
          branchConflict={branchConflict}
          focusBranchSignal={focusBranchSignal}
          slugConflict={slugConflict}
          focusSlugSignal={focusSlugSignal}
          handleRef={workspaceHandle}
        />
        <Separator />
        <CreateFooter
          actionRegion={reveal.actionRegion}
          submitRef={submitRef}
          configurationUnavailable={false}
          onRefreshConfiguration={() => undefined}
          failureAlert={
            <>
              {busy && !failure && (
                <OperationProgress
                  steps={createProgressSteps(progress.steps)}
                  label={createProgressLabel}
                  placeholderRows={
                    progress.available ? createProgressPlaceholderRows(state.sent?.target) : 0
                  }
                />
              )}
              {/* The calm note only when there is no live checklist to look at. */}
              {monitoring && !failure && progress.lost && progress.steps.length === 0 && (
                <Alert role="status" tone="info" title={t('create.monitoring.title')}>
                  <p>{t('create.monitoring.body')}</p>
                </Alert>
              )}
              {failure && (
                <CreateFailureAlert
                  failure={failure}
                  details={operationDetails()}
                  status={state.status}
                  statusUnreadable={state.statusUnreadable}
                  connectionLost={state.connectionLost}
                  refreshing={createOptions.isFetching}
                  onCopy={copyDetails}
                  onRefresh={() => void refreshOptions()}
                  onUseAutomaticName={() => {
                    setChoice((current) => ({
                      ...current,
                      branch: initialWorkspaceChoice.branch,
                    }));
                    actions.dismissFailure();
                  }}
                  onUseCustomName={() => {
                    setChoice((current) => ({
                      ...current,
                      settingsOpen: true,
                      branch: current.branch.on
                        ? current.branch
                        : { on: true, name: '', edited: false },
                    }));
                    setFocusBranchSignal((value) => value + 1);
                    actions.dismissFailure();
                  }}
                />
              )}
              <CreateLeaveDialog guard={leaveGuard} />
            </>
          }
          prerequisite={showPrerequisite && prerequisite ? text(prerequisite) : undefined}
          note={note}
          submitLabel={submitLabel}
          submitDisabled={working || (!uncertain && !recovery && !canSubmit)}
        />
      </form>
    </CreateShell>
  );
}

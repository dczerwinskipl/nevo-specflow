import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { isHttpClientError } from '@nevo/http-client';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { useVisitFreshOptions } from './visitFreshOptions';
import { Separator, Typography, useWorkspaceCapabilities } from '@nevo/ui';
import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import {
  ApplicationContextLine,
  ApplicationFlowBack,
} from '../../../app/navigation/ApplicationLocation';
import { useAppServices } from '../../../app/useAppServices';
import { useMessage } from '../../../i18n/message';
import { initialAgentChoice, providerDefaultEffort, type AgentChoice } from './agentChoice';
import { CreateAgentSection } from './CreateAgentSection';
import { CreateBasicsSection } from './CreateBasicsSection';
import { CreateFailureAlert, type CopyKind } from './CreateFailureAlert';
import { CreateFooter } from './CreateFooter';
import { CreateLeaveDialog } from './CreateLeaveDialog';
import { CreateMethodChoice } from './CreateMethodChoice';
import { CreateShell } from './CreateShell';
import { buildOperationDetails } from './createOperationDetails';
import { createReadiness } from './createReadiness';
import { creationKeys } from './api';
import { SessionWorkspaceSummary } from './SessionWorkspaceSummary';
import { useCreateLeaveGuard } from './useCreateLeaveGuard';
import { useCreateSpecification, type CreateSubmission } from './useCreateSpecification';
import { useRevealFailure } from './useRevealFailure';
import {
  WorkspaceSection,
  type WorkspaceOptionsState,
  type WorkspaceSectionHandle,
} from './WorkspaceSection';
import {
  activeTile,
  buildCreateTarget,
  initialWorkspaceChoice,
  requestChoiceSnapshot,
  revalidate,
  type WorkspaceChoice,
} from './workspaceChoice';

export interface CreateSpecificationFormProps {
  catalogue: DemoCatalogue;
  /** Present when only a Session is created for an existing specification. */
  specId?: string;
  onCreated: (id: string, document?: string) => void;
  onSession: (spec: string, session: string) => void;
  configurationUnavailable: boolean;
  onRefresh: () => void;
}

/**
 * The Create form: owns the values the user edits and composes the sections. The operation itself
 * (submit, replay, status check) is `useCreateSpecification`; this component only reports the form
 * to it and renders its state.
 */
export function CreateSpecificationForm({
  catalogue,
  specId,
  onCreated,
  onSession,
  configurationUnavailable,
  onRefresh,
}: CreateSpecificationFormProps) {
  const { t, i18n } = useTranslation();
  const text = useMessage();
  const { creationApi } = useAppServices();
  const { supportsSplit } = useWorkspaceCapabilities();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const workspaceHandle = useRef<WorkspaceSectionHandle>(null);
  const gitHeadingId = useId();

  const createOptions = useQuery({
    queryKey: creationKeys.createOptions,
    queryFn: ({ signal }) => creationApi.createOptions(signal),
    enabled: !specId,
    retry: false,
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
  });
  const workspaceOptions = useVisitFreshOptions(createOptions);

  const [method, setMethod] = useState(specId ? 'ai' : ''),
    [title, setTitle] = useState(''),
    [archetypeId, setArchetypeId] = useState(
      catalogue.defaultArchetypeId ?? catalogue.archetypes[0]?.id ?? '',
    ),
    [agent, setAgent] = useState<AgentChoice>(() => initialAgentChoice(catalogue)),
    [choice, setChoice] = useState<WorkspaceChoice>(initialWorkspaceChoice);
  const [announcement, setAnnouncement] = useState(''),
    [branchConflict, setBranchConflict] = useState<string | undefined>(),
    [focusBranchSignal, setFocusBranchSignal] = useState(0),
    [refreshFocusPending, setRefreshFocusPending] = useState(false);

  const configurationSnapshot = JSON.stringify({
    title,
    archetypeId,
    providerId: agent.providerId,
    modelId: agent.modelId,
    effort: agent.effort,
    mode: agent.mode,
    choice: requestChoiceSnapshot(choice),
  });
  const [initialConfiguration] = useState(configurationSnapshot);
  const configurationDirty = configurationSnapshot !== initialConfiguration;

  const { state, flags, actions } = useCreateSpecification({
    specId,
    catalogueRevision: catalogue.revision,
    snapshot: configurationSnapshot,
    onCreated,
    onSession,
    announce: setAnnouncement,
  });
  const { busy, uncertain, recovery, forbidden: forbiddenCreate } = flags;
  const failure = state.failure;

  const leaveGuard = useCreateLeaveGuard({
    blocksLeave: flags.blocksLeave,
    dirty: configurationDirty,
    isNavigationAllowed: actions.isNavigationAllowed,
  });
  const reveal = useRevealFailure(state.submitFailed, state.errorSeq, failure);

  const workspaceForbidden =
    !specId &&
    createOptions.isError &&
    isHttpClientError(createOptions.error) &&
    createOptions.error.status === 403;
  const workspaceState: WorkspaceOptionsState = workspaceOptions
    ? { status: 'ready', options: workspaceOptions }
    : createOptions.isError
      ? { status: workspaceForbidden ? 'forbidden' : 'error' }
      : { status: 'loading' };
  const locked =
    busy ||
    uncertain ||
    recovery ||
    forbiddenCreate ||
    configurationUnavailable ||
    workspaceForbidden;
  const { prerequisite, canSubmit } = createReadiness({
    specId,
    method,
    title,
    catalogue,
    archetypeId,
    agent,
    workspaceState,
    choice,
    configurationUnavailable,
    forbiddenCreate,
  });

  useEffect(() => {
    if (method && !supportsSplit) headingRef.current?.focus();
  }, [method, supportsSplit]);

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
    // The conflict described the old options; the refreshed ones are validated field by field.
    if (failure?.kind === 'stale') {
      setRefreshFocusPending(true);
      actions.dismissFailure();
    }
  };

  const submission = (): CreateSubmission => {
    const archetype = catalogue.archetypes.find((a) => a.id === archetypeId)!;
    return {
      title,
      archetype: { id: archetype.id, version: archetype.version },
      buildTarget: () =>
        workspaceOptions ? buildCreateTarget(choice, workspaceOptions) : undefined,
      ...(method === 'ai'
        ? {
            session: {
              providerId: agent.providerId,
              modelId: agent.modelId,
              ...(agent.effort !== providerDefaultEffort ? { effort: agent.effort } : {}),
              mode: agent.mode,
            },
          }
        : {}),
      snapshot: configurationSnapshot,
      onFailed: (next) => {
        if (next.kind !== 'branch-exists') return;
        if (next.automatic) setBranchConflict(undefined);
        else {
          setBranchConflict(choice.branch.name.trim());
          setChoice((current) => ({ ...current, settingsOpen: true }));
          setFocusBranchSignal((value) => value + 1);
        }
      },
    };
  };

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

  const leaveDialog = <CreateLeaveDialog guard={leaveGuard} />;
  if (!method && !specId)
    return (
      <CreateShell>
        <CreateMethodChoice onChoose={setMethod} />
        {leaveDialog}
      </CreateShell>
    );

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
        : specId
          ? t('create.submit.openSession')
          : method === 'ai'
            ? t('create.submit.createAndOpen')
            : t('create.submit.create');
  const note =
    uncertain || recovery
      ? t('create.footer.operationKept')
      : method === 'ai'
        ? t('create.footer.aiNote')
        : t('create.footer.manualNote');

  const sections: ReactNode[] = [
    !specId && (
      <CreateBasicsSection
        key="basics"
        catalogue={catalogue}
        title={title}
        archetypeId={archetypeId}
        locked={locked}
        onTitleChange={setTitle}
        onArchetypeChange={setArchetypeId}
      />
    ),
    method === 'ai' && (
      <CreateAgentSection
        key="agent"
        catalogue={catalogue}
        specId={specId}
        choice={agent}
        locked={locked}
        onChange={setAgent}
      />
    ),
    specId ? (
      <SessionWorkspaceSummary key="git" location={catalogue.currentLocation} />
    ) : (
      <WorkspaceSection
        key="git"
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
        branchConflict={branchConflict}
        focusBranchSignal={focusBranchSignal}
        handleRef={workspaceHandle}
      />
    ),
    <CreateFooter
      key="footer"
      actionRegion={reveal.actionRegion}
      submitRef={submitRef}
      configurationUnavailable={configurationUnavailable}
      onRefreshConfiguration={onRefresh}
      failureAlert={
        <>
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
                setChoice((current) => ({ ...current, branch: { ...current.branch, on: false } }));
                actions.dismissFailure();
              }}
              onUseCustomName={() => {
                setChoice((current) => ({
                  ...current,
                  settingsOpen: true,
                  branch: { ...current.branch, on: true },
                }));
                setFocusBranchSignal((value) => value + 1);
                actions.dismissFailure();
              }}
            />
          )}
          {leaveDialog}
        </>
      }
      prerequisite={showPrerequisite && prerequisite ? text(prerequisite) : undefined}
      note={note}
      submitLabel={submitLabel}
      submitDisabled={working || (!uncertain && !recovery && !canSubmit)}
    />,
  ].filter(Boolean);

  return (
    <CreateShell specId={specId}>
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
          {specId ? (
            <ApplicationContextLine className="mb-0" specId={specId} view="new-session" />
          ) : (
            <ApplicationFlowBack
              label={t('create.changeMethod')}
              disabled={locked}
              onBack={() => setMethod('')}
            />
          )}
          <header className="grid gap-2">
            <Typography
              as="h1"
              variant="title-lg"
              ref={headingRef}
              tabIndex={-1}
              className="outline-none"
            >
              {specId ? t('create.heading.session') : t('create.heading.specification')}
            </Typography>
            <Typography as="p" variant="body-md" className="text-content-secondary">
              {specId ? t('create.subheading.session') : t('create.subheading.specification')}
            </Typography>
          </header>
        </div>
        {sections.flatMap((section, index) => [
          index > 0 ? <Separator key={`separator-${index}`} /> : null,
          section,
        ])}
      </form>
    </CreateShell>
  );
}

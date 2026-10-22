import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { isHttpClientError } from '@nevo/http-client';
import { useTranslation } from 'react-i18next';
import { Separator, Typography, useWorkspaceCapabilities } from '@nevo/ui';
import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import {
  ApplicationContextLine,
  ApplicationFlowBack,
} from '../../../app/navigation/ApplicationLocation';
import { useAppServices } from '../../../app/useAppServices';
import { useMessage } from '../../../i18n/message';
import { useAnnouncer } from '../../../shared/a11y/useAnnouncer';
import { initialAgentChoice, providerDefaultEffort, type AgentChoice } from './agentChoice';
import { CreateAgentSection } from './CreateAgentSection';
import { CreateBasicsSection } from './CreateBasicsSection';
import { CreateConfigurationNotice } from './CreateConfigurationNotice';
import { CreateFailurePanel } from './CreateFailurePanel';
import { CreateFooter } from './CreateFooter';
import { CreateLeaveDialog } from './CreateLeaveDialog';
import { CreateMethodChoice } from './CreateMethodChoice';
import { CreateShell } from './CreateShell';
import { createReadiness } from './createReadiness';
import { creationKeys } from './api';
import { SessionWorkspaceSummary } from './SessionWorkspaceSummary';
import { useCreateLeaveGuard } from './useCreateLeaveGuard';
import { useCreateOptions } from './useCreateOptions';
import { useCreateSpecification, type CreateSubmission } from './useCreateSpecification';
import { useRevealFailure } from './useRevealFailure';
import { WorkspacePlaceSection } from './workspace/WorkspacePlaceSection';
import { buildCreateSlug, buildCreateTarget } from './workspace/createRequest';
import { requestChoiceSnapshot } from './workspace/workspaceChoice';
import { useWorkspacePlace } from './workspace/useWorkspacePlace';

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
  const { t } = useTranslation();
  const text = useMessage();
  const { creationApi } = useAppServices();
  const { supportsSplit } = useWorkspaceCapabilities();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const gitHeadingId = useId();
  const { announce, region } = useAnnouncer();

  const createOptions = useCreateOptions({
    queryKey: creationKeys.createOptions,
    fetch: (signal) => creationApi.createOptions(signal),
    isForbidden: (error) => isHttpClientError(error) && error.status === 403,
    refetchOnWindowFocus: true,
    enabled: !specId,
  });
  const { options: workspaceOptions } = createOptions;
  const place = useWorkspacePlace(createOptions, announce);

  const [method, setMethod] = useState(specId ? 'ai' : ''),
    [title, setTitle] = useState(''),
    [archetypeId, setArchetypeId] = useState(
      catalogue.defaultArchetypeId ?? catalogue.archetypes[0]?.id ?? '',
    ),
    [agent, setAgent] = useState<AgentChoice>(() => initialAgentChoice(catalogue));

  const configurationSnapshot = JSON.stringify({
    title,
    archetypeId,
    providerId: agent.providerId,
    modelId: agent.modelId,
    effort: agent.effort,
    mode: agent.mode,
    choice: requestChoiceSnapshot(place.choice),
  });
  const [initialConfiguration] = useState(configurationSnapshot);
  const configurationDirty = configurationSnapshot !== initialConfiguration;

  const { state, flags, actions } = useCreateSpecification({
    specId,
    catalogueRevision: catalogue.revision,
    snapshot: configurationSnapshot,
    onCreated,
    onSession,
    announce,
  });
  const { busy, uncertain, recovery, forbidden: forbiddenCreate } = flags;
  const failure = state.failure;

  const leaveGuard = useCreateLeaveGuard({
    unfinished: flags.unfinished,
    dirty: configurationDirty,
    isNavigationAllowed: actions.isNavigationAllowed,
  });
  const reveal = useRevealFailure(state.submitFailed, state.errorSeq, failure);

  const locked =
    busy ||
    uncertain ||
    recovery ||
    forbiddenCreate ||
    configurationUnavailable ||
    (!specId && createOptions.forbidden);
  const { prerequisite, canSubmit } = createReadiness({
    specId,
    method,
    title,
    catalogue,
    archetypeId,
    agent,
    workspaceState: createOptions.state,
    choice: place.choice,
    configurationUnavailable,
    forbiddenCreate,
  });

  useEffect(() => {
    if (method && !supportsSplit) headingRef.current?.focus();
  }, [method, supportsSplit]);

  const refreshOptions = () =>
    void place.refresh({
      failure,
      dismissFailure: actions.dismissFailure,
      fallbackFocus: () => submitRef.current?.focus(),
    });

  const submission = (): CreateSubmission => {
    const archetype = catalogue.archetypes.find((a) => a.id === archetypeId)!;
    const slug = workspaceOptions
      ? buildCreateSlug(place.choice, workspaceOptions, title)
      : undefined;
    return {
      title,
      archetype: { id: archetype.id, version: archetype.version },
      slug,
      buildTarget: () =>
        workspaceOptions ? buildCreateTarget(place.choice, workspaceOptions, title) : undefined,
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
      onFailed: (next) => place.reportFailure(next, { slug }),
    };
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
      <WorkspacePlaceSection
        key="git"
        headingId={gitHeadingId}
        state={createOptions.state}
        refreshing={createOptions.fetching && Boolean(workspaceOptions)}
        refreshFailed={createOptions.refreshFailed}
        choice={place.choice}
        update={place.setChoice}
        locked={locked}
        onRefresh={refreshOptions}
        onAnnounce={announce}
        title={title}
        conflicts={place.conflicts}
        handleRef={place.handleRef}
      />
    ),
    <CreateFooter
      key="footer"
      actionRegion={reveal.actionRegion}
      submitRef={submitRef}
      failureAlert={
        <>
          {configurationUnavailable && <CreateConfigurationNotice onRefresh={onRefresh} />}
          {failure && (
            <CreateFailurePanel
              failure={failure}
              state={state}
              workspaceOptions={workspaceOptions}
              typedTitle={title.trim()}
              refreshing={createOptions.fetching}
              announce={announce}
              onRefresh={refreshOptions}
              onUseAutomaticName={() => {
                place.chooseAutomaticBranch();
                actions.dismissFailure();
              }}
              onUseCustomName={() => {
                place.chooseCustomBranch();
                actions.dismissFailure();
              }}
            />
          )}
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
        {region}
      </form>
      {leaveDialog}
    </CreateShell>
  );
}

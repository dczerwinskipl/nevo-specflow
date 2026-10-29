import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { isHttpClientError } from '@nevo/http-client';
import { useTranslation } from 'react-i18next';
import { Separator, useWorkspaceCapabilities } from '@nevo/ui';
import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import {
  ApplicationContextLine,
  ApplicationFlowBack,
} from '../../../../app/navigation/ApplicationLocation';
import { useAppServices } from '../../../../app/useAppServices';
import { useMessage } from '../../../../i18n/message';
import { useAnnouncer } from '../../../../shared/a11y/useAnnouncer';
import {
  initialAgentChoice,
  providerDefaultEffort,
  type AgentChoice,
} from '../options/agentChoice';
import { CreateAgentSection } from '../options/CreateAgentSection';
import { CreateBasicsSection } from '../options/CreateBasicsSection';
import { ArchetypeSection } from '../options/ArchetypeSection';
import {
  initialArchetypeChoice,
  refreshedArchetypeChoice,
  selectedArchetype,
  tickedTemplates,
  type ArchetypeChoice,
} from '../options/archetypeChoice';
import { CreateConfigurationNotice } from './CreateConfigurationNotice';
import { CreateFailurePanel } from '../errors/CreateFailurePanel';
import { CreateFooter } from './CreateFooter';
import { CreateFormHeader } from './CreateFormHeader';
import { CreateLeaveDialog } from './CreateLeaveDialog';
import { CreateMethodChoice } from '../options/CreateMethodChoice';
import { CreateShell } from '../CreateShell';
import { createReadiness } from './createReadiness';
import { demoCreationKeys } from '../api/api.demo';
import { SessionWorkspaceSummary } from './SessionWorkspaceSummary';
import { useCreateLeaveGuard } from './useCreateLeaveGuard';
import { useCreateOptions } from '../options/useCreateOptions';
import {
  useCreateDemoSpecification,
  type CreateSubmission,
} from '../operation/useCreateDemoSpecification';
import { useRevealFailure } from '../errors/useRevealFailure';
import { CreateWorkspaceSection } from './CreateWorkspaceSection';
import { buildCreateSlug, buildCreateTarget } from '../workspace/model/createRequest';
import { requestChoiceSnapshot } from '../workspace/model/workspaceChoice';
import { useWorkspacePlace } from '../workspace/useWorkspacePlace';

export interface CreateDemoFormProps {
  catalogue: DemoCatalogue;
  /** Present when only a Session is created for an existing specification. */
  specId?: string;
  onCreated: (id: string, document?: string) => void;
  onSession: (spec: string, session: string) => void;
  configurationUnavailable: boolean;
  onRefresh: () => void;
  /** Reads the catalogue again (after the archetypes changed under the form). */
  onRefreshCatalogue: () => Promise<DemoCatalogue | undefined>;
}

/**
 * The Create form: owns the values the user edits and composes the sections. The operation itself
 * (submit, replay, status check) is `useCreateDemoSpecification`; this component only reports the form
 * to it and renders its state.
 */
export function CreateDemoForm({
  catalogue,
  specId,
  onCreated,
  onSession,
  configurationUnavailable,
  onRefresh,
  onRefreshCatalogue,
}: CreateDemoFormProps) {
  const { t } = useTranslation();
  const text = useMessage();
  const { demoCreationApi } = useAppServices();
  const { supportsSplit } = useWorkspaceCapabilities();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const submitRef = useRef<HTMLButtonElement>(null);
  const gitHeadingId = useId();
  const { announce, region } = useAnnouncer();

  const createOptions = useCreateOptions({
    queryKey: demoCreationKeys.createOptions,
    fetch: (signal) => demoCreationApi.createOptions(signal),
    isForbidden: (error) => isHttpClientError(error) && error.status === 403,
    refetchOnWindowFocus: true,
    enabled: !specId,
  });
  const { options: workspaceOptions } = createOptions;
  const place = useWorkspacePlace(createOptions, announce);

  const [method, setMethod] = useState(specId ? 'ai' : ''),
    [title, setTitle] = useState(''),
    [archetypeChoice, setArchetypeChoice] = useState<ArchetypeChoice>(initialArchetypeChoice),
    [agent, setAgent] = useState<AgentChoice>(() => initialAgentChoice(catalogue));

  const archetype = selectedArchetype(catalogue, archetypeChoice);
  const optionalDocumentIds = archetype ? tickedTemplates(archetype, archetypeChoice) : [];
  const configurationSnapshot = JSON.stringify({
    title,
    archetypeId: archetype?.id,
    optionalDocumentIds,
    providerId: agent.providerId,
    modelId: agent.modelId,
    effort: agent.effort,
    mode: agent.mode,
    choice: requestChoiceSnapshot(place.choice),
  });
  const [initialConfiguration] = useState(configurationSnapshot);
  const configurationDirty = configurationSnapshot !== initialConfiguration;

  const { state, flags, actions } = useCreateDemoSpecification({
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
    archetype,
    agent,
    workspaceState: createOptions.state,
    choice: place.choice,
    configurationUnavailable,
    forbiddenCreate,
  });

  useEffect(() => {
    if (method && !supportsSplit) {
      headingRef.current?.focus();
    }
  }, [method, supportsSplit]);

  const refreshOptions = () =>
    void place.refresh({
      failure,
      dismissFailure: actions.dismissFailure,
      fallbackFocus: () => submitRef.current?.focus(),
    });

  const submission = (): CreateSubmission => {
    const chosen = archetype!;
    const slug = workspaceOptions
      ? buildCreateSlug(place.choice, workspaceOptions, title)
      : undefined;

    return {
      title,
      archetype: { id: chosen.id, version: chosen.version, optionalDocumentIds },
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
  if (!method && !specId) {
    return (
      <CreateShell>
        <CreateMethodChoice onChoose={setMethod} />
        {leaveDialog}
      </CreateShell>
    );
  }

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
      <CreateBasicsSection key="basics" title={title} locked={locked} onTitleChange={setTitle} />
    ),
    !specId && (
      <ArchetypeSection
        key="archetype"
        state={{ status: 'ready', catalogue }}
        choice={archetypeChoice}
        locked={locked}
        onChange={setArchetypeChoice}
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
      <CreateWorkspaceSection
        key="git"
        headingId={gitHeadingId}
        createOptions={createOptions}
        place={place}
        locked={locked}
        title={title}
        onRefresh={refreshOptions}
        onAnnounce={announce}
      />
    ),
  ].filter(Boolean);
  // Under the last section, in the scrolling form: what went wrong and how to go on. The pinned
  // footer stays one line; a failure is revealed here (`useRevealFailure`).
  const failureRegion = (
    <div ref={reveal.actionRegion} className="grid gap-4 empty:hidden">
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
          onRefreshArchetypes={() =>
            void (async () => {
              const code = failure.kind === 'catalogue-stale' ? failure.code : undefined;
              const fresh = await onRefreshCatalogue();
              if (!fresh || !code) {
                return;
              }

              setArchetypeChoice((current) => refreshedArchetypeChoice(current, code));
              actions.dismissFailure();
              announce(t('create.archetype.refreshed'));
            })()
          }
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
    </div>
  );

  return (
    <CreateShell
      specId={specId}
      form={{
        onSubmit: (event) => {
          event.preventDefault();
          if (recovery) {
            void actions.submit(submission());

            return;
          }

          if (!busy && (uncertain || canSubmit)) {
            reveal.captureSubmit(event);
            void actions.submit(submission());
          }
        },
      }}
      footer={
        <CreateFooter
          submitRef={submitRef}
          prerequisite={showPrerequisite && prerequisite ? text(prerequisite) : undefined}
          note={note}
          submitLabel={submitLabel}
          submitDisabled={working || (!uncertain && !recovery && !canSubmit)}
        />
      }
    >
      <div className="grid gap-8">
        <CreateFormHeader
          headingRef={headingRef}
          lead={
            specId ? (
              <ApplicationContextLine className="mb-0" specId={specId} view="new-session" />
            ) : (
              <ApplicationFlowBack
                label={t('create.changeMethod')}
                disabled={locked}
                onBack={() => setMethod('')}
              />
            )
          }
          heading={specId ? t('create.heading.session') : t('create.heading.specification')}
          subheading={
            specId ? t('create.subheading.session') : t('create.subheading.withArchetype')
          }
        />
        {sections.flatMap((section, index) => [
          index > 0 ? <Separator key={`separator-${index}`} /> : null,
          section,
        ])}
        {failureRegion}
        {region}
      </div>
      {leaveDialog}
    </CreateShell>
  );
}

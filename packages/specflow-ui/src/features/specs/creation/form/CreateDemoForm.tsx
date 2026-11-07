import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { isHttpClientError } from '@nevo/http-client';
import { useTranslation } from 'react-i18next';
import { Separator, cn, useWorkspaceCapabilities } from '@nevo/ui';
import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import { ApplicationFlowBack } from '../../../../app/navigation/ApplicationLocation';
import { useAppServices } from '../../../../app/useAppServices';
import { useMessage } from '../../../../i18n/message';
import { useAnnouncer } from '../../../../shared/a11y/useAnnouncer';
import {
  initialAgentChoice,
  providerDefaultEffort,
  startCatalogueFromDemo,
  type AgentChoice,
} from '../../../sessions';
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
import { useCreateLeaveGuard } from './useCreateLeaveGuard';
import { useCreateOptions } from '../options/useCreateOptions';
import {
  useCreateDemoSpecification,
  type CreateSubmission,
} from '../operation/useCreateDemoSpecification';
import { useRevealFailure } from '../errors/useRevealFailure';
import { CreateWorkspaceSection } from './CreateWorkspaceSection';
import { createFormColumn, createFormColumns, createFormWidth } from '../createFormLayout';
import { firstChoiceControl } from './createGuide';
import { revealControl, useCreateGuide } from './useCreateGuide';
import { buildCreateSlug, buildCreateTarget } from '../workspace/model/createRequest';
import { requestChoiceSnapshot } from '../workspace/model/workspaceChoice';
import { useWorkspacePlace } from '../workspace/useWorkspacePlace';

export interface CreateDemoFormProps {
  catalogue: DemoCatalogue;
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
  });
  const { options: workspaceOptions } = createOptions;
  const place = useWorkspacePlace(createOptions, announce);

  const [method, setMethod] = useState(''),
    [title, setTitle] = useState(''),
    [archetypeChoice, setArchetypeChoice] = useState<ArchetypeChoice>(initialArchetypeChoice),
    [agent, setAgent] = useState<AgentChoice>(() =>
      initialAgentChoice(startCatalogueFromDemo(catalogue)),
    );

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
    createOptions.forbidden;
  const { prerequisite, problemField, canSubmit } = createReadiness({
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

  // A blocked Create leads to the first faulty field in the form's order (`createReadiness`).
  const nameRef = useRef<HTMLInputElement>(null);
  const archetypeRef = useRef<HTMLDivElement>(null);
  const providersRef = useRef<HTMLDivElement>(null);
  const modelRef = useRef<HTMLElement | null>(null);
  const showPrerequisite = Boolean(prerequisite) && !uncertain && !recovery;
  const reason = showPrerequisite && prerequisite ? text(prerequisite) : undefined;
  const { tried, guide } = useCreateGuide({
    problemField,
    reason,
    announce,
    focusField: (field) => {
      if (field === 'name') {
        revealControl(nameRef.current);
      } else if (field === 'archetype') {
        revealControl(firstChoiceControl(archetypeRef.current));
      } else if (field === 'provider') {
        revealControl(firstChoiceControl(providersRef.current));
      } else if (field === 'model' || field === 'mode') {
        // The work modes follow the model: a missing or unsupported mode is fixed from the model.
        revealControl(modelRef.current);
      } else {
        place.handleRef.current?.focusProblem(field);
      }
    },
  });
  const provider = catalogue.providers.find((p) => p.id === agent.providerId);
  const modelMissing =
    method === 'ai' &&
    Boolean(provider?.models.length) &&
    !provider?.models.some((m) => m.id === agent.modelId);

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
  if (!method) {
    return (
      <CreateShell>
        <CreateMethodChoice onChoose={setMethod} />
        {leaveDialog}
      </CreateShell>
    );
  }

  const working = busy || state.checking;
  // Only the form's own values block Create in place (focusable, `aria-disabled`); an operation in
  // progress, a forbidden Create or a stale configuration disable it.
  const settled = !uncertain && !recovery;
  const submitDisabled =
    working ||
    (settled && (forbiddenCreate || configurationUnavailable || createOptions.forbidden));
  const submitBlocked = settled && !canSubmit;
  const submitLabel = working
    ? uncertain || recovery
      ? t('create.submit.checking')
      : t('create.submit.preparing')
    : recovery
      ? t('create.submit.checkOperation')
      : uncertain
        ? t('create.submit.checkResult')
        : method === 'ai'
          ? t('create.submit.createAndOpen')
          : t('create.submit.create');
  const note =
    uncertain || recovery
      ? t('create.footer.operationKept')
      : method === 'ai'
        ? t('create.footer.aiNote')
        : t('create.footer.manualNote');

  // What is created (left), then who starts it and where (right). DOM order is the reading and
  // Tab order; below the threshold the same sections stack in that order.
  const whatSections: ReactNode[] = [
    <CreateBasicsSection
      key="basics"
      title={title}
      locked={locked}
      onTitleChange={setTitle}
      tried={tried}
      inputRef={nameRef}
    />,
    <div key="archetype" ref={archetypeRef} className="min-w-0">
      <ArchetypeSection
        state={{ status: 'ready', catalogue }}
        choice={archetypeChoice}
        locked={locked}
        onChange={setArchetypeChoice}
        error={tried && !archetype ? t('create.prerequisite.archetype') : undefined}
      />
    </div>,
  ];
  const whoAndWhereSections: ReactNode[] = [
    method === 'ai' && (
      <CreateAgentSection
        key="agent"
        catalogue={catalogue}
        choice={agent}
        locked={locked}
        onChange={setAgent}
        modelError={tried && modelMissing ? t('create.prerequisite.model') : undefined}
        providersRef={providersRef}
        modelControlRef={modelRef}
      />
    ),
    <CreateWorkspaceSection
      key="git"
      headingId={gitHeadingId}
      createOptions={createOptions}
      place={place}
      locked={locked}
      title={title}
      onRefresh={refreshOptions}
      onAnnounce={announce}
      showRequired={tried}
    />,
  ].filter(Boolean);
  const separated = (sections: ReactNode[], column: string) =>
    sections.flatMap((section, index) => [
      index > 0 ? <Separator key={`separator-${column}-${index}`} /> : null,
      section,
    ]);
  // Under the last section, in the scrolling form: what went wrong and how to go on. The pinned
  // footer stays one line; a failure is revealed here (`useRevealFailure`).
  const failureRegion = (
    <div ref={reveal.actionRegion} className="grid max-w-content-form gap-4 empty:hidden">
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
      columns
      form={{
        onSubmit: (event) => {
          event.preventDefault();
          if (recovery) {
            void actions.submit(submission());

            return;
          }

          if (busy) {
            return;
          }

          if (uncertain || canSubmit) {
            reveal.captureSubmit(event);
            void actions.submit(submission());

            return;
          }

          // Blocked by the form's values (a click, Enter or Space on Create, Enter in a field):
          // nothing is sent; lead to the first faulty field instead.
          if (!locked) {
            guide();
          }
        },
      }}
      footer={
        <CreateFooter
          submitRef={submitRef}
          prerequisite={reason}
          note={note}
          submitLabel={submitLabel}
          submitDisabled={submitDisabled}
          submitBlocked={submitBlocked}
          onGuide={problemField && reason && !locked ? guide : undefined}
        />
      }
    >
      <div className={cn('grid gap-8', createFormWidth)}>
        <CreateFormHeader
          headingRef={headingRef}
          lead={
            <ApplicationFlowBack
              label={t('create.changeMethod')}
              disabled={locked}
              onBack={() => setMethod('')}
            />
          }
          heading={t('create.heading.specification')}
          subheading={t('create.subheading.withArchetype')}
        />
        <div className={createFormColumns}>
          <div className={createFormColumn}>{separated(whatSections, 'what')}</div>
          {/* Between the stacked columns only: side by side, the gap separates them. */}
          <Separator className="@min-[62rem]:hidden" />
          <div className={createFormColumn}>{separated(whoAndWhereSections, 'who')}</div>
        </div>
        {failureRegion}
        {region}
      </div>
      {leaveDialog}
    </CreateShell>
  );
}

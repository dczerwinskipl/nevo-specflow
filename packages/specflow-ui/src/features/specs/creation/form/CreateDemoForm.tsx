import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { isHttpClientError } from '@nevo/http-client';
import { useTranslation } from 'react-i18next';
import { Separator, Typography, cn, useWorkspaceCapabilities } from '@nevo/ui';
import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import { FlowBack } from '../../../../app/navigation/ApplicationLocation';
import { useAppServices } from '../../../../app/useAppServices';
import { useMessage } from '../../../../i18n/message';
import { useAnnouncer } from '../../../../shared/a11y/useAnnouncer';
import { AgentSession, type FreshChoice } from '../../../tasks';
import { demoAgentCatalogue, demoWorkMode, initialDemoAgent } from '../start/demoAgents';
import { demoEntryPoints, type CreateEntryPointId } from '../start/entryPoints';
import { AgentEntryUnavailable, agentEntryUnavailable } from '../start/AgentEntryUnavailable';
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
import { agentProblem, createReadiness } from './createReadiness';
import { demoCreationKeys } from '../api/api.demo';
import { useCreateLeaveGuard } from './useCreateLeaveGuard';
import { useCreateOptions } from '../options/useCreateOptions';
import {
  useCreateDemoSpecification,
  type CreateSubmission,
} from '../operation/useCreateDemoSpecification';
import { useRevealFailure } from '../errors/useRevealFailure';
import { CreateWorkspaceSection } from './CreateWorkspaceSection';
import {
  createControlWidth,
  createFormColumn,
  createFormColumns,
  createFormWidth,
} from '../createFormLayout';
import { firstChoiceControl } from './createGuide';
import { revealControl, useCreateGuide } from './useCreateGuide';
import {
  buildCreateSlug,
  buildCreateTarget,
  requestChoiceSnapshot,
} from '../workspace/model/createRequest';
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

  const [method, setMethod] = useState<CreateEntryPointId | ''>(''),
    [title, setTitle] = useState(''),
    [archetypeChoice, setArchetypeChoice] = useState<ArchetypeChoice>(initialArchetypeChoice),
    [agent, setAgent] = useState<FreshChoice>(() => initialDemoAgent(catalogue));
  // The same agent picker as Run with agent, over the demo catalogue.
  const agentCatalogue = useMemo(() => demoAgentCatalogue(catalogue), [catalogue]);
  const workMode = demoWorkMode(catalogue, agent);

  const archetype = selectedArchetype(catalogue, archetypeChoice);
  const optionalDocumentIds = archetype ? tickedTemplates(archetype, archetypeChoice) : [];
  const configurationSnapshot = JSON.stringify({
    title,
    archetypeId: archetype?.id,
    optionalDocumentIds,
    providerId: agent.providerId,
    modelId: agent.modelId,
    effort: agent.effort,
    choice: requestChoiceSnapshot(place.choice, workspaceOptions, title),
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
      } else if (field === 'model') {
        // The picker's trigger (the model and its effort) follows the agent tiles.
        revealControl(
          providersRef.current?.querySelector<HTMLElement>('button[aria-haspopup]') ?? null,
        );
      } else {
        place.handleRef.current?.focusProblem(field);
      }
    },
  });
  // The agent's own problem is said under the picker once Create was tried.
  const agentIssue = tried && method === 'agent' ? agentProblem(catalogue, agent) : undefined;

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
      ...(method === 'agent'
        ? {
            session: {
              providerId: agent.providerId,
              modelId: agent.modelId,
              ...(agent.effort ? { effort: agent.effort } : {}),
              mode: workMode?.id ?? '',
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
        <CreateMethodChoice
          entryPoints={demoEntryPoints}
          onChoose={setMethod}
          unavailable={
            agentEntryUnavailable(agentCatalogue)
              ? {
                  agent: (
                    <AgentEntryUnavailable
                      agents={agentCatalogue}
                      refreshing={false}
                      onRefresh={onRefresh}
                    />
                  ),
                }
              : {}
          }
        />
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
        : method === 'agent'
          ? t('create.submit.createAndOpen')
          : t('create.submit.create');
  const note =
    uncertain || recovery
      ? t('create.footer.operationKept')
      : method === 'agent'
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
    method === 'agent' && (
      <fieldset key="agent" disabled={locked} className={cn('grid gap-4', createControlWidth)}>
        <div className="grid gap-1">
          <Typography as="legend" variant="title-md" className="p-0">
            {t('create.agent.initialTitle')}
          </Typography>
          <Typography as="p" variant="body-md" className="text-content-secondary">
            {t('create.agent.introInitial')}
          </Typography>
        </div>
        <div ref={providersRef} className="min-w-0">
          <AgentSession
            mode="fresh"
            independent={false}
            step={t('create.agent.initialTitle')}
            role={t('workflowExecution.agent.roleFallback')}
            launch={undefined}
            catalogue={agentCatalogue}
            choice={agent}
            preselected={false}
            workMode={workMode?.title}
            onChoice={setAgent}
          />
        </div>
        {agentIssue && (
          <p role="alert" className="m-0 text-body-sm text-content-error">
            {text(agentIssue.message)}
          </p>
        )}
      </fieldset>
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
          {...(problemField === 'name' ? { guideLabel: t('create.guide.enterName') } : {})}
        />
      }
    >
      <div className={cn('grid gap-8', createFormWidth)}>
        <CreateFormHeader
          headingRef={headingRef}
          lead={
            <FlowBack
              label={t('create.start.backToStart')}
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

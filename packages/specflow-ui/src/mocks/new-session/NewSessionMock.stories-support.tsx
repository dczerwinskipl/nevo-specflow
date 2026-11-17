import { Fragment, useId, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AppContent,
  AppWorkspace,
  AppWorkspaceBody,
  Button,
  Collapsible,
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  Field,
  Icon,
  InformationList,
  cn,
  InlineNote,
  SegmentedControl,
  StatusIndicator,
  choiceSurfaceCheckClassName,
  choiceSurfaceClassName,
  TextInput,
  Typography,
  WorkspaceHeader,
  useRegisterPinnedSecondaryTab,
  useSecondaryNavigation,
  useWorkspaceCapabilities,
  useWorkspaceLayout,
  type WorkspaceHeaderAction,
} from '@nevo/ui';
import { useWorkspaceLabels } from '../../app/navigation/useWorkspaceLabels';
import { StoryLocalization } from '../../i18n/StoryLocalization';
import { useMessage } from '../../i18n/message';
import { ChoiceTileGroup } from '../../shared/controls/ChoiceTile';
import { SessionProviderIcon } from '../../features/sessions/shared/SessionProviderIcon';
import { ContextExecutorSection } from '../../features/sessions/managed/context/ContextExecutorSection';
import { ContextNavigationRow } from '../../features/sessions/managed/context/ContextNavigationRow';
import { ContextSection } from '../../features/sessions/managed/context/ContextSectionFrame';
import { ContextSpecificationSection } from '../../features/sessions/managed/context/ContextSpecificationSection';
import { placeholderRootTabs } from '../../features/sessions/managed/context/SessionContextPlaceholderTabs';
import { sessionContextStack } from '../../features/sessions/managed/context/SessionContext';
import { SessionContextSourceProvider } from '../../features/sessions/managed/context/sessionContextValue';
import {
  useDropNarrowContextOnSplit,
  useSessionSidePanel,
} from '../../features/sessions/managed/context/useSessionSidePanel';
import type { SessionContextViewModel } from '../../features/sessions/managed/context/sessionContextTypes';
import { startCatalogueFromProviders } from '../../features/sessions/start/catalogue/fromProviderDescriptors';
import type {
  StartCatalogue,
  StartProvider,
} from '../../features/sessions/start/catalogue/startCatalogue';
import {
  initialAgentChoice,
  listedModes,
  offersModelChoice,
  selectModel,
  selectProvider,
  type AgentChoice,
} from '../../features/sessions/start/choice/agentChoice';
import { newSessionReadiness } from '../../features/sessions/start/choice/newSessionReadiness';
import { sessionNameMaxLength } from '../../features/sessions/start/choice/sessionName';
import { InertComposer } from '../../features/sessions/start/conversation/InertComposer';
import { SessionStartConversation } from '../../features/sessions/start/conversation/SessionStartConversation';
import { EffortField } from '../../features/sessions/start/fields/EffortField';
import { ModelField } from '../../features/sessions/start/fields/ModelField';
import { WorkModeField } from '../../features/sessions/start/fields/WorkModeField';
import { startContextValue } from '../../features/sessions/start/screen/startContext';
import {
  StartEnvironment,
  storySpecification,
} from '../../features/sessions/start/screen/sessionStart.stories-support';
import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import {
  availabilityOf,
  diagnosticsOf,
  type Availability,
  fill,
  mockCopy,
  agentWording,
  providersFor,
  shortStatus,
  type MockLocale,
  type NewSessionState,
  type ProviderDiagnostics,
} from './fixtures.stories-support';

/*
 * PRESENTATION MOCK ONLY (owner acceptance of the New session rework). Reuses the production
 * catalogue adapter, readiness policy, field components, ChoiceTile, Context sections and the start
 * conversation column; only the composition differs. No request is sent.
 */

type Copy = (typeof mockCopy)[MockLocale];

export interface NewSessionMockProps {
  state: NewSessionState;
  locale?: MockLocale;
  /** The "How to fix" panel (side panel; bottom sheet on narrow) starts open. */
  diagnosticsOpen?: boolean;
  /** The agent chosen at first (else the first available one). */
  selected?: string;
}

export function NewSessionMock(props: NewSessionMockProps) {
  const locale = props.locale ?? 'pl';

  return (
    <StoryLocalization locale={locale}>
      <WithMockStrings locale={locale}>
        <StartEnvironment>
          <MockScreen key={`${props.state}-${props.selected ?? ''}`} {...props} locale={locale} />
        </StartEnvironment>
      </WithMockStrings>
    </StoryLocalization>
  );
}

/**
 * One word for the thing being chosen: "Agent" (the start form, the Composer placeholder and the
 * English Context already say it). The production strings that still say "wykonawca" are
 * overridden here; implementation changes them in the locale files.
 */
function WithMockStrings({ locale, children }: { locale: MockLocale; children: ReactNode }) {
  const { i18n } = useTranslation();
  useState(() => i18n.addResourceBundle(locale, 'translation', agentWording[locale], true, true));

  return children;
}

const pendingSessionId = 'new-session';
const noop = () => undefined;

function MockScreen({
  state,
  locale = 'pl',
  diagnosticsOpen = false,
  selected,
}: NewSessionMockProps) {
  const { t } = useTranslation();
  const copy = mockCopy[locale];
  const { supportsSplit } = useWorkspaceCapabilities();
  const navigation = useSecondaryNavigation();
  const labels = useWorkspaceLabels(t('sessionStart.heading'));
  const [contextOpen, setContextOpen] = useState(true);
  const sidePanel = useSessionSidePanel(contextOpen, setContextOpen);
  useDropNarrowContextOnSplit(t('sessions.context.title'));
  useRegisterPinnedSecondaryTab(
    supportsSplit && contextOpen ? { title: t('sessions.context.title') } : null,
  );

  const descriptors = useMemo(() => providersFor(state), [state]);
  const catalogue = useMemo(() => startCatalogueFromProviders(descriptors), [descriptors]);
  const [agent, setAgent] = useState<AgentChoice>(() => {
    const initial = initialAgentChoice(catalogue);
    const chosen = catalogue.providers.find((p) => p.id === selected && p.available);

    return chosen ? selectProvider(initial, chosen) : initial;
  });
  const [name, setName] = useState('');

  const contextValue = useMemo<SessionContextViewModel>(
    () =>
      startContextValue({
        catalogue: { status: 'ready', catalogue, configurationUnavailable: false, refresh: noop },
        choice: agent,
        specification: { status: 'ready', value: storySpecification },
        notChosen: {
          agent: t('sessionStart.executor.notChosen'),
          model: t('sessionStart.executor.modelNotChosen'),
        },
      }),
    [catalogue, agent, t],
  );

  const contextAction: WorkspaceHeaderAction = !supportsSplit
    ? {
        id: 'context',
        label: t('sessions.context.title'),
        icon: 'file',
        direct: 'always',
        onPress: () => void navigation.open(sessionContextStack, {}),
      }
    : {
        id: 'context',
        label: t('managedSession.sidePanel'),
        icon: 'panel-right',
        presentation: 'icon',
        pressed: sidePanel.sidePanelOpen,
        direct: 'always',
        onPress: () => void sidePanel.toggle(),
      };

  const noAgent = !catalogue.providers.some((p) => p.available);

  return (
    <SessionContextSourceProvider sessionId={pendingSessionId} value={contextValue}>
      {/* With no agent the form is short: the stacked shell's full-height sheet would read as an
          empty card, so its surface steps back to the plain workbench background (mock-only
          override; production needs a shell option, see the handover). */}
      <div
        className={cn(
          'contents',
          noAgent &&
            '[&_.mobile-workspace-surface]:border-transparent [&_.mobile-workspace-surface]:![background:none] [&_.mobile-workspace-surface]:![box-shadow:none] [&_.mobile-workspace-surface]:before:hidden [&_.mobile-workspace-surface]:after:hidden',
        )}
      >
        <AppWorkspace scroll="workspace" fit="available" split="dynamic" labels={labels}>
          <AppWorkspace.Primary
            header={
              <WorkspaceHeader
                title={t('sessionStart.heading')}
                actions={[contextAction]}
                labels={{ moreActions: t('common.moreActions') }}
              />
            }
          >
            <StartColumn
              catalogue={catalogue}
              descriptors={descriptors}
              agent={agent}
              onAgentChange={setAgent}
              name={name}
              onNameChange={setName}
              copy={copy}
              locale={locale}
              diagnosticsOpen={diagnosticsOpen}
            />
          </AppWorkspace.Primary>
          <AppWorkspace.Secondary
            open={contextOpen}
            onOpenChange={setContextOpen}
            header={<WorkspaceHeader title={t('sessions.context.title')} headingLevel={2} />}
          >
            <StartContext value={contextValue} />
          </AppWorkspace.Secondary>
        </AppWorkspace>
      </div>
    </SessionContextSourceProvider>
  );
}

/**
 * Context before the Session exists: the agent (what will run), the Specification the Session is
 * created in, then only the planned areas that mean something before Start (Instructions the agent
 * will read, the Environment it will work in); those open a Context tab and leave the form as it
 * is. Files / changes, Handovers and Artifacts are produced by a running Session, so they are absent
 * until then. No Documents row: it navigates to the Specification's Documents route, which unmounts
 * this screen and loses the form.
 */
function StartContext({ value }: { value: SessionContextViewModel }) {
  const { t } = useTranslation();
  const beforeStart = placeholderRootTabs.filter(
    (tab) => tab.id === 'instructions' || tab.id === 'environment',
  );

  return (
    <AppContent className="h-full w-full">
      <AppWorkspaceBody scroll="area" contentClassName="flex min-h-full flex-col">
        <div className="grid w-full gap-6">
          <ContextExecutorSection executor={value.executor} scope={value.scope} />
          <ContextSpecificationSection value={value} onOpenSpecification={noop} />
          <ContextSection title={t('sessions.context.placeholders.sectionTitle')}>
            <InformationList>
              {beforeStart.map((tab) => (
                <ContextNavigationRow
                  key={tab.id}
                  icon={tab.icon}
                  label={t(tab.titleKey)}
                  onClick={noop}
                />
              ))}
            </InformationList>
          </ContextSection>
        </div>
      </AppWorkspaceBody>
    </AppContent>
  );
}

function StartColumn({
  catalogue,
  descriptors,
  agent,
  onAgentChange,
  name,
  onNameChange,
  copy,
  locale,
  diagnosticsOpen,
}: {
  catalogue: StartCatalogue;
  descriptors: ReturnType<typeof providersFor>;
  agent: AgentChoice;
  onAgentChange: (agent: AgentChoice) => void;
  name: string;
  onNameChange: (name: string) => void;
  copy: Copy;
  locale: MockLocale;
  diagnosticsOpen: boolean;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const isSplit = useWorkspaceLayout().mode === 'split';
  const legendId = useId();
  const noteId = useId();
  const diagnosticsId = useId();
  const nameChoice = { mode: name.trim() ? 'custom' : 'agent', value: name } as const;
  const { prerequisite, canStart } = newSessionReadiness({
    catalogue,
    agent,
    name: nameChoice,
    configurationUnavailable: false,
  });
  const noAgent = !catalogue.providers.some((p) => p.available);
  const availabilityFor = (providerId: string): Availability => {
    const descriptor = descriptors.find((d) => d.providerId === providerId);

    return descriptor ? availabilityOf(descriptor) : 'undetermined';
  };

  const statusOf = (providerId: string) => {
    const descriptor = descriptors.find((d) => d.providerId === providerId);

    return descriptor ? shortStatus(descriptor, locale) : '';
  };

  const anyUnavailable = catalogue.providers.some((p) => !p.available);
  // Only a blocker is said next to Start; a ready form needs no sentence.
  const note = noAgent ? copy.noneNote : prerequisite ? text(prerequisite) : '';
  const submit = (event: FormEvent<HTMLFormElement>) => event.preventDefault();

  const actions = (
    <StartActions
      noteId={noteId}
      note={note}
      // With no agent there is nothing to start: checking again is the one action.
      label={noAgent ? copy.checkAgain : t('sessionStart.submit.start')}
      action={noAgent ? 'check' : 'start'}
      disabled={!noAgent && !canStart}
    />
  );

  return (
    <SessionStartConversation
      composerOnlyIfFits
      composer={
        // No agent: nothing to start, so no bar; "Check again" sits in the message under the cards.
        noAgent && !isSplit ? undefined : isSplit ? (
          <InertComposer id="start-message" placeholder={t('sessionStart.composer.placeholder')} />
        ) : (
          // Narrow: the primary action is a bar fixed to the bottom of the visible area (the same
          // overlay the Composer uses, so it clears the safe area and the on-screen keyboard).
          <form
            onSubmit={submit}
            className="rounded-composite border border-border-default bg-surface-raised p-3 shadow-lg"
          >
            {actions}
          </form>
        )
      }
    >
      <form aria-label={t('sessionStart.heading')} onSubmit={submit} className="@container">
        <div className="grid gap-6">
          <fieldset className="grid min-w-0 gap-3">
            <Typography as="legend" variant="label-md" id={legendId} className="mb-1.5 p-0">
              {t('sessionStart.agent.heading')}
            </Typography>
            <ChoiceTileGroup
              aria-labelledby={legendId}
              columns={catalogue.providers.length === 3 ? '@2xl:grid-cols-3' : '@lg:grid-cols-2'}
              describedBy={anyUnavailable ? diagnosticsId : undefined}
            >
              {catalogue.providers.map((provider) => (
                <AgentCard
                  key={provider.id}
                  provider={provider}
                  status={statusOf(provider.id)}
                  availability={availabilityFor(provider.id)}
                  checked={agent.providerId === provider.id}
                  onSelect={() => onAgentChange(selectProvider(agent, provider))}
                />
              ))}
            </ChoiceTileGroup>
            {anyUnavailable && (
              <DiagnosticsLine
                id={diagnosticsId}
                catalogue={catalogue}
                descriptors={descriptors}
                copy={copy}
                locale={locale}
                statusOf={statusOf}
                defaultOpen={diagnosticsOpen}
              />
            )}
          </fieldset>
          <AgentSettings
            catalogue={catalogue}
            choice={agent}
            onChange={onAgentChange}
            copy={copy}
          />
          {!noAgent && (
            <Field>
              <Field.Label>
                {copy.nameLabel}{' '}
                <span className="font-normal text-content-muted">({copy.optional})</span>
              </Field.Label>
              <TextInput
                value={name}
                maxLength={sessionNameMaxLength}
                placeholder={copy.namePlaceholder}
                onChange={(event) => onNameChange(event.target.value)}
              />
              {sessionNameMaxLength - name.length <= 32 && (
                <Field.Description>
                  {t('sessionStart.name.remaining', {
                    remaining: sessionNameMaxLength - name.length,
                  })}
                </Field.Description>
              )}
            </Field>
          )}
          {isSplit && !noAgent && actions}
        </div>
      </form>
    </SessionStartConversation>
  );
}

/**
 * Variant A: a 28 px logo, the name over the status (never right-aligned) and a fixed slot for the
 * check mark, reserved while unselected, so selecting moves nothing. One geometry on every card, in
 * every state and at every width. Product-owned composition on the design system's choice-surface
 * recipe: `ChoiceTile`'s icon track is 18 px and top-aligned (see the handover).
 */
function AgentCard({
  provider,
  status,
  availability,
  checked,
  onSelect,
}: {
  provider: StartProvider;
  status: string;
  /** Undetermined (a check without a result) reads as pending, not as an error. */
  availability: Availability;
  checked: boolean;
  onSelect: () => void;
}) {
  const id = useId();
  const unavailable = !provider.available;

  return (
    <label
      className={cn(
        choiceSurfaceClassName,
        'grid grid-cols-[1.75rem_minmax(0,1fr)_var(--spacing-icon-md)] items-center gap-x-2.5 px-3.5 py-3.5',
      )}
    >
      <input
        className="sr-only"
        type="radio"
        name="provider"
        value={provider.id}
        checked={checked}
        disabled={unavailable}
        aria-labelledby={`${id}-name`}
        aria-describedby={`${id}-status`}
        onChange={() => {
          if (!unavailable) {
            onSelect();
          }
        }}
      />
      <span
        className={cn(
          'flex size-7 items-center justify-center [&>*]:!size-7',
          unavailable && 'text-content-muted opacity-60 grayscale',
        )}
      >
        <SessionProviderIcon providerId={provider.icon} />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span
          id={`${id}-name`}
          className={cn(
            'text-title-md',
            unavailable ? 'text-content-secondary' : 'text-content-primary',
          )}
        >
          {provider.title}
        </span>
        {/* One line by contract: the vocabulary is short enough at 375 and in three columns. */}
        <span
          id={`${id}-status`}
          data-status
          className="flex h-4 items-center gap-1.5 overflow-hidden text-body-sm whitespace-nowrap text-content-secondary"
        >
          {availability === 'available' ? (
            <StatusIndicator tone="success" />
          ) : (
            <Icon
              name={availability === 'undetermined' ? 'clock' : 'circle-alert'}
              size="sm"
              aria-hidden="true"
              className="text-content-muted"
            />
          )}
          {status}
        </span>
      </span>
      <span className={cn(choiceSurfaceCheckClassName, !checked && 'invisible')} aria-hidden="true">
        <Icon name="check" size="sm" />
      </span>
    </label>
  );
}

function lowerFirst(value: string) {
  // "Nie znaleziono CLI" -> "nie znaleziono CLI"; "CLI not found" keeps its acronym.
  return /^.\p{Ll}/u.test(value) ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

interface UnavailableAgent {
  provider: StartProvider;
  descriptor: ProviderDescriptor | undefined;
  availability: Availability;
  status: string;
}

/**
 * Under the cards: one line naming what is unavailable, or, with no agent available, the screen's
 * message. Confirmed unavailability leads with "How to fix"; a check without a result (undetermined)
 * leads with "Check again". The details open in a side panel (a bottom sheet on narrow layouts).
 */
function DiagnosticsLine({
  id,
  catalogue,
  descriptors,
  copy,
  locale,
  statusOf,
  defaultOpen,
}: {
  id: string;
  catalogue: StartCatalogue;
  descriptors: ReturnType<typeof providersFor>;
  copy: Copy;
  locale: MockLocale;
  statusOf: (providerId: string) => string;
  defaultOpen: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const items: UnavailableAgent[] = catalogue.providers
    .filter((p) => !p.available)
    .map((provider) => {
      const descriptor = descriptors.find((d) => d.providerId === provider.id);

      return {
        provider,
        descriptor,
        availability: descriptor ? availabilityOf(descriptor) : 'undetermined',
        status: statusOf(provider.id),
      };
    });
  const none = items.length === catalogue.providers.length;
  const anyUndetermined = items.some((item) => item.availability === 'undetermined');
  const onlyUndetermined = items.every((item) => item.availability === 'undetermined');
  const [first] = items;

  const openDetails = (primary: boolean) => (
    <Button
      type="button"
      variant={primary ? 'primary' : 'secondary'}
      size="sm"
      aria-describedby={id}
      aria-haspopup="dialog"
      onClick={() => setOpen(true)}
    >
      {onlyUndetermined ? copy.details : copy.howToFix}
    </Button>
  );
  const checkAgain = (primary: boolean) => (
    <Button type="button" variant={primary ? 'primary' : 'secondary'} size="sm">
      {copy.checkAgain}
    </Button>
  );
  const panel = (
    <DiagnosticsPanel
      open={open}
      onOpenChange={setOpen}
      items={items}
      copy={copy}
      locale={locale}
    />
  );

  if (none) {
    return (
      <>
        <div className="grid gap-3">
          <div className="flex items-start gap-2">
            <span className="flex h-5 items-center">
              <Icon
                name={anyUndetermined ? 'clock' : 'circle-alert'}
                size="sm"
                aria-hidden="true"
                className={anyUndetermined ? 'text-content-muted' : 'text-status-danger'}
              />
            </span>
            <div className="grid min-w-0 gap-0.5">
              <Typography as="h2" variant="title-sm" id={id}>
                {anyUndetermined ? copy.undeterminedHeading : copy.noneHeading}
              </Typography>
              <Typography as="p" variant="body-sm" className="text-content-secondary">
                {anyUndetermined ? copy.undeterminedLine : copy.noneLine}
              </Typography>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 pl-6">
            {anyUndetermined ? checkAgain(true) : openDetails(true)}
            {anyUndetermined ? openDetails(false) : checkAgain(false)}
          </div>
        </div>
        {panel}
      </>
    );
  }

  const summary =
    items.length === 1 && first
      ? fill(copy.oneUnavailable, {
          provider: first.provider.title,
          status: lowerFirst(first.status),
        })
      : fill(copy.someUnavailable, {
          providers: items.map((item) => item.provider.title).join(', '),
        });

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <InlineNote
          tone={onlyUndetermined ? 'info' : 'attention'}
          icon={onlyUndetermined ? 'clock' : undefined}
          className="min-w-0"
        >
          <span id={id}>{summary}</span>
        </InlineNote>
        <div className="flex items-center gap-2">
          {onlyUndetermined && checkAgain(false)}
          {openDetails(false)}
        </div>
      </div>
      {panel}
    </>
  );
}

/**
 * The details of the unavailable agents. One agent: its name is the title and its status the
 * description. Several: a segmented control switches between them. The body scrolls between the
 * fixed header and footer. The footer offers "Check again" only when a fix can be seen by it; a fix
 * that needs a restart says so instead (the UI cannot restart the Runtime).
 */
function DiagnosticsPanel({
  open,
  onOpenChange,
  items,
  copy,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  items: UnavailableAgent[];
  copy: Copy;
  locale: MockLocale;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const isSplit = useWorkspaceLayout().mode === 'split';
  const [selectedId, setSelectedId] = useState(items[0]?.provider.id ?? '');
  const selected = items.find((item) => item.provider.id === selectedId) ?? items[0];
  if (!selected) {
    return null;
  }

  const details = diagnosticsOf(locale, selected.descriptor, selected.provider.id);
  const canRecheck = details.fixes.some((fix) => fix.kind === 'recheck');
  const single = items.length === 1;

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent side={isSplit ? 'right' : 'bottom'} closeLabel={t('common.close')}>
        <DrawerHeader>
          <DrawerTitle>{single ? selected.provider.title : copy.howToFix}</DrawerTitle>
          {!single && (
            <SegmentedControl
              aria-label={copy.agents}
              className="mt-3 w-full"
              value={selected.provider.id}
              onValueChange={setSelectedId}
            >
              {items.map((item) => (
                <SegmentedControl.Item key={item.provider.id} value={item.provider.id}>
                  {item.provider.title}
                </SegmentedControl.Item>
              ))}
            </SegmentedControl>
          )}
          <DrawerDescription className={cn('flex items-center gap-1.5', !single && 'mt-3')}>
            <Icon
              name={selected.availability === 'undetermined' ? 'clock' : 'circle-alert'}
              size="sm"
              aria-hidden="true"
              className="text-content-muted"
            />
            {selected.status}
          </DrawerDescription>
        </DrawerHeader>
        <DrawerBody>
          <ProviderDiagnosticsBlock
            key={selected.provider.id}
            // The Runtime's own wording, only when the written diagnosis does not already say it.
            reason={
              !details.found &&
              selected.provider.reason &&
              selected.descriptor?.readiness !== 'authenticationRequired'
                ? text(selected.provider.reason)
                : ''
            }
            details={details}
            copy={copy}
          />
        </DrawerBody>
        <DrawerFooter>
          {canRecheck ? (
            <Button type="button" className="w-full sm:w-fit">
              {copy.checkAgain}
            </Button>
          ) : (
            // Nothing here can be seen by a recheck: no button, the restart is the next step.
            <div className="flex items-start gap-2">
              <span className="flex h-4 items-center">
                <Icon name="info" size="sm" aria-hidden="true" className="text-content-muted" />
              </span>
              <Prose>{copy.fixRestart}</Prose>
            </div>
          )}
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
}

function ProviderDiagnosticsBlock({
  reason,
  details,
  copy,
}: {
  /** The catalogue's precise reason, when no written diagnosis covers it. */
  reason: string;
  details: ProviderDiagnostics;
  copy: Copy;
}) {
  return (
    <div className="grid min-w-0 gap-5">
      {(reason || details.found) && (
        <div className="grid gap-2">
          {reason && <Prose>{reason}</Prose>}
          {details.found && <Prose>{details.found}</Prose>}
          {details.checkedPaths && (
            <Collapsible density="inline" className="text-body-sm text-content-secondary">
              <Collapsible.Trigger>
                {fill(copy.checkedPaths, { count: details.checkedPaths.length })}
              </Collapsible.Trigger>
              <Collapsible.Content>
                <ul className="mt-2 grid gap-1.5">
                  {details.checkedPaths.map((path) => (
                    <li key={path}>
                      <Code>{path}</Code>
                    </li>
                  ))}
                </ul>
              </Collapsible.Content>
            </Collapsible>
          )}
        </div>
      )}
      {details.fixes.map((fix, index) => (
        <section key={index} className="grid min-w-0 gap-2" aria-label={fix.title}>
          {fix.title && (
            <Typography as="h3" variant="label-md" className="text-content-primary">
              {fix.title}
            </Typography>
          )}
          <Prose>{fix.text}</Prose>
          {fix.yaml && <CodeBlock label={fix.yaml.file}>{fix.yaml.body}</CodeBlock>}
          {fix.command && <CodeBlock>{fix.command}</CodeBlock>}
          {/* What makes the Runtime see this fix: a recheck, or only a restart (said once, in
              the footer, when every fix needs a restart). */}
          {details.fixes.some((f) => f.kind === 'recheck') && (
            <div className="flex items-start gap-2 text-body-sm text-content-secondary">
              <span className="flex h-4 items-center">
                <Icon
                  name={fix.kind === 'recheck' ? 'refresh' : 'info'}
                  size="sm"
                  aria-hidden="true"
                  className="text-content-muted"
                />
              </span>
              <Prose>{fix.kind === 'recheck' ? copy.fixRecheck : copy.fixRestart}</Prose>
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

/** Supporting text where `code` is code and **text** is strong (the action named elsewhere). */
function Prose({ children }: { children: string }) {
  return (
    <Typography as="p" variant="body-sm" className="text-content-secondary">
      {children.split(/(`[^`]+`|\*\*[^*]+\*\*)/).map((part, index) =>
        part.startsWith('`') ? (
          <Code key={index}>{part.slice(1, -1)}</Code>
        ) : part.startsWith('**') ? (
          <strong key={index} className="font-medium text-content-primary">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </Typography>
  );
}

/** Inline code (MarkdownDocument's inline-code look) that breaks only after a path or key separator. */
function Code({ children }: { children: string }) {
  const parts = children.split(/(?<=[\\/._-])/);

  return (
    <Typography
      as="code"
      variant="code-md"
      className="rounded-control-inline border border-border-default bg-surface-control px-1 py-px text-[0.8125rem] text-content-primary"
    >
      {parts.map((part, index) => (
        <Fragment key={index}>
          {part}
          {index < parts.length - 1 && <wbr />}
        </Fragment>
      ))}
    </Typography>
  );
}

/**
 * A snippet (MarkdownDocument's code-block look). Long lines wrap with their indentation kept (a
 * hanging indent marks the continuation), so nothing is cut off and no sideways scroll is needed.
 */
function CodeBlock({ children, label }: { children: string; label?: string }) {
  return (
    <div className="min-w-0 rounded-composite border border-border-default bg-canvas">
      {label && (
        <div className="border-b border-border-subtle px-3 py-1.5 text-body-sm text-content-muted">
          <span className="font-mono">{label}</span>
        </div>
      )}
      <pre className="px-3 py-2 font-mono text-[0.8125rem] leading-5 text-content-primary">
        {children.split('\n').map((line, index) => {
          const indent = line.length - line.trimStart().length;

          return (
            <span
              key={index}
              className="block whitespace-pre-wrap [overflow-wrap:anywhere]"
              style={{ paddingLeft: `${indent + 2}ch`, textIndent: '-2ch' }}
            >
              {line.trimStart()}
            </span>
          );
        })}
      </pre>
    </div>
  );
}

/**
 * Model, Effort and Work mode as one group, following what the provider really offers: a provider
 * without a model choice shows the fact, not a disabled picker; Effort appears only for a provider
 * whose models have efforts. Within one provider the set never changes, so choosing a model adds no
 * rows. Wide: one row of natural widths; narrow: stacked.
 */
function AgentSettings({
  catalogue,
  choice,
  onChange,
  copy,
}: {
  catalogue: StartCatalogue;
  choice: AgentChoice;
  onChange: (choice: AgentChoice) => void;
  copy: Copy;
}) {
  const { t } = useTranslation();
  const provider = catalogue.providers.find((p) => p.id === choice.providerId);
  if (!provider?.available) {
    return null;
  }

  const model = provider.models.find((m) => m.id === choice.modelId);
  const choosesModel = offersModelChoice(provider);
  const hasEfforts = provider.models.some((m) => m.efforts.length > 0);
  const decidedByModel = choosesModel && !model;

  return (
    <div
      role="group"
      aria-label={copy.settings}
      className="grid gap-4 @xl:flex @xl:flex-wrap @xl:items-start @xl:gap-x-3"
    >
      <div className="min-w-0 @xl:flex-[1_1_14rem]">
        {choosesModel ? (
          <ModelField
            provider={provider}
            value={choice.modelId}
            disabled={false}
            onChange={(modelId) => onChange(selectModel(choice, provider, modelId))}
          />
        ) : (
          <div className="grid gap-1.5">
            <Typography as="span" variant="label-md" className="text-content-secondary">
              {t('managedSession.model.sectionLabel')}
            </Typography>
            <Typography
              as="p"
              variant="body-md"
              className="flex min-h-control-height-default items-center text-content-primary"
            >
              {copy.providerDefaultModel}
            </Typography>
          </div>
        )}
      </div>
      {hasEfforts && (
        <div className="min-w-0 @xl:w-40">
          <EffortField
            efforts={model?.efforts ?? []}
            value={choice.effort}
            disabled={decidedByModel}
            onChange={(effort) => onChange({ ...choice, effort })}
          />
        </div>
      )}
      <div className="min-w-0 @xl:shrink-0 @xl:[&_button]:whitespace-nowrap">
        <WorkModeField
          modes={listedModes(provider, model)}
          value={choice.mode}
          disabled={decidedByModel}
          onChange={(mode) => onChange({ ...choice, mode })}
        />
      </div>
    </div>
  );
}

/**
 * The form's last row (wide) or the bottom bar (narrow): the blocker, if any, beside the one primary
 * action. A ready form says nothing. With no agent the action is "Check again" (reads the catalogue)
 * instead of Start.
 */
function StartActions({
  noteId,
  note,
  label,
  action,
  disabled,
}: {
  noteId: string;
  note: string;
  label: string;
  action: 'start' | 'check';
  disabled: boolean;
}): ReactNode {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {note && (
        <Typography
          as="p"
          variant="body-sm"
          id={noteId}
          className="min-w-0 flex-[1_1_8rem] text-content-secondary"
        >
          {note}
        </Typography>
      )}
      <div className="ml-auto flex items-center gap-2">
        <Button
          type={action === 'start' ? 'submit' : 'button'}
          disabled={disabled}
          aria-describedby={note ? noteId : undefined}
        >
          {label}
        </Button>
      </div>
    </div>
  );
}

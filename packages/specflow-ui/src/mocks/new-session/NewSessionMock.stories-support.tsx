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
import {
  diagnosticsOf,
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

  return (
    <SessionContextSourceProvider sessionId={pendingSessionId} value={contextValue}>
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
  const statusOf = (providerId: string) => {
    const descriptor = descriptors.find((d) => d.providerId === providerId);

    return descriptor ? shortStatus(descriptor, locale) : '';
  };

  const anyUnavailable = catalogue.providers.some((p) => !p.available);
  // Only a blocker is said next to Start; a ready form needs no sentence.
  const note = noAgent ? copy.noneAvailable : prerequisite ? text(prerequisite) : '';
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
  checked,
  onSelect,
}: {
  provider: StartProvider;
  status: string;
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
          {provider.available ? (
            <StatusIndicator tone="success" />
          ) : (
            <Icon name="circle-alert" size="sm" aria-hidden="true" className="text-content-muted" />
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

/**
 * One shared line under the picker naming what is unavailable. "How to fix" opens the full
 * diagnostics in a side panel (a bottom sheet on narrow layouts) instead of growing the form. With
 * no agent at all the line is the screen's message and carries "Check again" itself.
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
  const { t } = useTranslation();
  const text = useMessage();
  const isSplit = useWorkspaceLayout().mode === 'split';
  const [open, setOpen] = useState(defaultOpen);
  const unavailable = catalogue.providers.filter((p) => !p.available);
  const none = unavailable.length === catalogue.providers.length;
  const [only] = unavailable;
  const summary = none
    ? copy.noneAvailable
    : unavailable.length === 1 && only
      ? fill(copy.oneUnavailable, { provider: only.title, status: lowerFirst(statusOf(only.id)) })
      : fill(copy.someUnavailable, { providers: unavailable.map((p) => p.title).join(', ') });

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <InlineNote tone={none ? 'danger' : 'attention'} className="min-w-0">
          <span id={id}>{summary}</span>
        </InlineNote>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            aria-describedby={id}
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
          >
            {copy.howToFix}
          </Button>
          {none && (
            <Button type="button" size="sm">
              {copy.checkAgain}
            </Button>
          )}
        </div>
      </div>
      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerContent side={isSplit ? 'right' : 'bottom'} closeLabel={t('common.close')}>
          <DrawerHeader>
            <DrawerTitle>{copy.panelTitle}</DrawerTitle>
            <DrawerDescription>{summary}</DrawerDescription>
          </DrawerHeader>
          <DrawerBody>
            <div className="grid gap-6">
              {unavailable.map((provider) => {
                const descriptor = descriptors.find((d) => d.providerId === provider.id);

                return (
                  <ProviderDiagnosticsBlock
                    key={provider.id}
                    provider={provider}
                    status={statusOf(provider.id)}
                    // The sign-in reason only restates the short status.
                    reason={
                      provider.reason && descriptor?.readiness !== 'authenticationRequired'
                        ? text(provider.reason)
                        : ''
                    }
                    details={diagnosticsOf(locale, descriptor, provider.id)}
                    copy={copy}
                  />
                );
              })}
            </div>
          </DrawerBody>
          <DrawerFooter>
            <Button type="button" className="w-full sm:w-fit">
              {copy.checkAgain}
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </>
  );
}

function ProviderDiagnosticsBlock({
  provider,
  status,
  reason,
  details,
  copy,
}: {
  provider: StartProvider;
  status: string;
  /** The catalogue's precise reason, when it says more than the short status. */
  reason: string;
  details: ProviderDiagnostics | undefined;
  copy: Copy;
}) {
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="grid min-w-0 gap-2">
      <Typography as="h2" variant="label-md" id={headingId} className="text-content-primary">
        {provider.title}
        <span className="font-normal text-content-secondary"> · {status}</span>
      </Typography>
      {reason && reason !== status && <Prose>{reason}</Prose>}
      {details?.found && <Prose>{details.found}</Prose>}
      {details && <Prose>{details.fix}</Prose>}
      {details?.yaml && <CodeBlock label={details.yaml.file}>{details.yaml.body}</CodeBlock>}
      {details?.command && <CodeBlock>{details.command}</CodeBlock>}
      {details?.after && <Prose>{details.after}</Prose>}
      {details?.checkedPaths && (
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
    </section>
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

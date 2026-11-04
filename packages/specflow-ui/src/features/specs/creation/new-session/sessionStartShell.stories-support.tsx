import { useEffect, useMemo, useRef, useState } from 'react';
import { Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
  AppContent,
  AppShell,
  AppWorkspace,
  AppWorkspaceProvider,
  IconButton,
  MessageComposer,
  cn,
  useRegisterPinnedSecondaryTab,
  useSecondaryNavigation,
  useWorkspaceCapabilities,
  useWorkspaceLayout,
  type WorkspaceHeaderAction,
  WorkspaceHeader,
} from '@nevo/ui';
import type { DemoCatalogue } from '@nevo/specflow-contracts/demo';
import { useMessage } from '../../../../i18n/message';
import { useWorkspaceLabels } from '../../../../app/navigation/useWorkspaceLabels';
import { ComposerModePicker, ModelEffortPicker, SessionReadyEmptyState } from '../../../sessions';
import {
  SessionContext,
  createSessionContextStack,
} from '../../../sessions/managed/context/SessionContext';
import type {
  ContextSpecification,
  SessionContextViewModel,
} from '../../../sessions/managed/context/sessionContextTypes';
import { useSessionActions } from '../../../sessions/managed/sessionActions/useSessionActions';
import {
  applyModelEffort,
  initialAgentChoice,
  initialSessionName,
  modelEffortValue,
  modeValue,
  pickerModes,
  pickerProvider,
  providerDefaultEffort,
  selectModel,
  selectProvider,
  SessionStartForm,
  startCatalogueFromDemo,
  type AgentChoice,
  type SessionNameChoice,
  type SessionStartStatus,
  type StartCatalogue,
} from '../../../sessions';
import { startCatalogue } from './sessionStartCatalogue.stories-support';

const sessionId = '00000000-0000-4000-8000-0000000000a1';
const specification: ContextSpecification = {
  id: 'api-integration',
  key: 'SPEC-1',
  title: 'Logowanie SSO',
};

type Phase = SessionStartStatus | 'started';

/** Where the preview begins: each state of the contract is reachable without any interaction. */
export type SessionStartPhase = 'open' | 'starting' | 'started' | 'failed';

export interface SessionStartInitialState {
  /** The chosen provider; the first available one when absent. */
  initialProviderId?: string;
  /** The chosen model of that provider; none when absent. */
  initialModelId?: string;
  /** A chosen effort of that model; the provider default when absent. */
  initialEffort?: string;
  /** The chosen work mode; the model's default when absent. */
  initialMode?: string;
  /** The user's own Session name; the agent names it when absent. */
  initialName?: string;
  phase?: SessionStartPhase;
}

function initialAgent(catalogue: StartCatalogue, state: SessionStartInitialState): AgentChoice {
  let agent = initialAgentChoice(catalogue);
  const { initialProviderId, initialModelId } = state;
  if (initialProviderId) {
    agent = selectProvider(
      agent,
      catalogue.providers.find((p) => p.id === initialProviderId),
    );
  }

  const provider = catalogue.providers.find((p) => p.id === agent.providerId);
  if (initialModelId) {
    agent = selectModel(agent, provider, initialModelId);
  }

  return {
    ...agent,
    ...(state.initialEffort ? { effort: state.initialEffort } : {}),
    ...(state.initialMode ? { mode: state.initialMode } : {}),
  };
}

/**
 * Story-only stand-in for the Session screen while a new Session is started in it
 * (`docs/ideas/specflow-ui/screens/new-session-ui-spec.md`, sections 5 and 8): the real shell,
 * workspace, header, Context and Composer around the start card. `ManagedSession` itself is not
 * used because it needs a started Session; the swap in the real screens is a later step.
 *
 * Start is simulated: after `startDelayMs` the Session is `started` (or `failed` when `outcome` says
 * so); `null` keeps it in "Starting…".
 */
export function SessionStartShellPreview({
  catalogue = startCatalogue,
  outcome = 'ok',
  startDelayMs = 800,
  ...initial
}: {
  catalogue?: DemoCatalogue;
  outcome?: 'ok' | 'failed';
  startDelayMs?: number | null;
} & SessionStartInitialState) {
  const start = useMemo(() => startCatalogueFromDemo(catalogue), [catalogue]);

  return (
    <div style={{ width: '100%', height: '100vh' }}>
      <AppWorkspaceProvider>
        <AppShell navigation={<div>Projekt</div>} style={{ height: '100%', width: '100%' }}>
          <SessionStartWorkspace
            catalogue={start}
            outcome={outcome}
            startDelayMs={startDelayMs}
            initial={initial}
          />
        </AppShell>
      </AppWorkspaceProvider>
    </div>
  );
}

function SessionStartWorkspace({
  catalogue,
  outcome,
  startDelayMs,
  initial,
}: {
  catalogue: StartCatalogue;
  outcome: 'ok' | 'failed';
  startDelayMs: number | null;
  initial: SessionStartInitialState;
}) {
  const { t } = useTranslation();
  const { supportsSplit } = useWorkspaceCapabilities();
  const navigation = useSecondaryNavigation();
  const labels = useWorkspaceLabels();
  const [contextOpen, setContextOpen] = useState(true);
  const [agent, setAgent] = useState<AgentChoice>(() => initialAgent(catalogue, initial));
  const [name, setName] = useState<SessionNameChoice>(() =>
    initial.initialName ? { mode: 'custom', value: initial.initialName } : initialSessionName,
  );
  const [phase, setPhase] = useState<Phase>(
    initial.phase && initial.phase !== 'open' ? initial.phase : 'idle',
  );
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  useRegisterPinnedSecondaryTab(
    supportsSplit && contextOpen ? { title: t('sessions.context.title') } : null,
  );

  const provider = catalogue.providers.find((p) => p.id === agent.providerId);
  const model = provider?.models.find((m) => m.id === agent.modelId);
  const started = phase === 'started';

  const start = () => {
    setPhase('starting');
    if (startDelayMs === null) {
      return;
    }

    timer.current = setTimeout(
      () => setPhase(outcome === 'failed' ? 'failed' : 'started'),
      startDelayMs,
    );
  };

  // Context's executor mirrors the choice as it is made: the provider, then its model (and a
  // chosen effort); "not chosen" stands in until there is one.
  const notChosen = t('sessionStart.executor.notChosen');
  const contextValue = useMemo<SessionContextViewModel>(
    () => ({
      scope: { kind: 'specification' },
      specification: { status: 'ready', value: specification },
      executor: {
        status: 'ready',
        value: {
          providerId: provider?.icon ?? '',
          providerTitle: provider?.title ?? notChosen,
          modelTitle: provider ? (model?.title ?? notChosen) : undefined,
          effort: model && agent.effort !== providerDefaultEffort ? agent.effort : undefined,
        },
      },
    }),
    [provider, model, agent.effort, notChosen],
  );
  const openSpecification = () => undefined;

  const sessionActions = useSessionActions({ title: undefined });
  const contextAction: WorkspaceHeaderAction = !supportsSplit
    ? {
        id: 'context',
        label: t('sessions.context.title'),
        icon: 'file',
        direct: 'always',
        onPress: () =>
          void navigation.open(
            createSessionContextStack(sessionId, contextValue, openSpecification),
            {},
          ),
      }
    : {
        id: 'context',
        label: t('managedSession.sidePanel'),
        icon: 'panel-right',
        presentation: 'icon',
        pressed: contextOpen,
        direct: 'always',
        onPress: () => setContextOpen((open) => !open),
      };

  return (
    <AppWorkspace scroll="workspace" fit="available" split="dynamic" labels={labels}>
      <AppWorkspace.Primary
        header={
          <WorkspaceHeader
            title={t('sessionStart.heading')}
            // The Session's own actions (rename, archive, delete) exist only after Start.
            actions={[contextAction, ...(started ? sessionActions.actions : [])]}
            labels={{ moreActions: t('common.moreActions') }}
          />
        }
      >
        <StartConversation
          catalogue={catalogue}
          agent={agent}
          onAgentChange={setAgent}
          name={name}
          onNameChange={setName}
          phase={phase}
          onStart={start}
        />
        {sessionActions.dialogs}
      </AppWorkspace.Primary>
      <AppWorkspace.Secondary
        open={contextOpen}
        onOpenChange={setContextOpen}
        header={<WorkspaceHeader title={t('sessions.context.title')} />}
      >
        <SessionContext
          sessionId={sessionId}
          value={contextValue}
          onOpenSpecification={openSpecification}
        />
      </AppWorkspace.Secondary>
    </AppWorkspace>
  );
}

/**
 * The conversation column: the start card (or, once started, the summary line) at the top and the
 * Composer docked at the bottom, positioned exactly as in `ManagedSession` (sticky in the local
 * scroller of the split layout, fixed on the stacked one).
 */
function StartConversation({
  catalogue,
  agent,
  onAgentChange,
  name,
  onNameChange,
  phase,
  onStart,
}: {
  catalogue: StartCatalogue;
  agent: AgentChoice;
  onAgentChange: (agent: AgentChoice) => void;
  name: SessionNameChoice;
  onNameChange: (name: SessionNameChoice) => void;
  phase: Phase;
  onStart: () => void;
}) {
  const { t } = useTranslation();
  const text = useMessage();
  const layout = useWorkspaceLayout();
  const isSplit = layout.mode === 'split';
  const localScroll = layout.primaryScrollOwner === 'local';
  const started = phase === 'started';
  // On a phone the inactive Composer only takes space from the form: it appears with Start.
  const showComposer = isSplit || started;
  const [draft, setDraft] = useState('');
  const [overlay, setOverlay] = useState<HTMLDivElement | null>(null);
  const [composerHeight, setComposerHeight] = useState(0);
  const editor = useRef<HTMLTextAreaElement>(null);
  const provider = catalogue.providers.find((p) => p.id === agent.providerId);

  // The fixed Composer of the stacked layout takes no space of its own: reserve it.
  useEffect(() => {
    if (!overlay || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(() => setComposerHeight(overlay.offsetHeight));
    observer.observe(overlay);

    return () => observer.disconnect();
  }, [overlay]);

  // After Start the only question is what to write: the message field takes focus.
  useEffect(() => {
    if (started) {
      editor.current?.focus();
    }
  }, [started]);

  // The start form sits directly on the conversation, from the top (owner, 2026-11-04: centred in
  // the free height looked odd); the ready empty state centres itself in the same column.
  const content = (
    <>
      <div className="mx-auto flex min-h-full w-full max-w-content-standard shrink-0 flex-col px-5 py-5">
        {started ? (
          <SessionReadyEmptyState
            providerId={provider?.icon}
            providerTitle={provider?.title ?? ''}
          />
        ) : (
          <SessionStartForm
            catalogue={catalogue}
            agent={agent}
            onAgentChange={onAgentChange}
            name={name}
            onNameChange={onNameChange}
            status={phase}
            onStart={onStart}
          />
        )}
      </div>
      {showComposer && !localScroll && (
        <div aria-hidden="true" style={{ height: composerHeight }} />
      )}
    </>
  );
  // Split layout: the Composer is a row of its own below the scroller, so the form scrolls fully
  // clear of it. Stacked layout: fixed to the viewport, with the space reserved above.
  const composerBar = showComposer && (
    <div
      ref={setOverlay}
      data-composer-overlay="true"
      className={cn(
        'z-10 flex flex-col items-center gap-2 px-4 pt-3 sm:px-5',
        localScroll
          ? 'shrink-0 pb-4 sm:pb-5'
          : 'scrollbar-subtle fixed inset-x-0 bottom-0 z-20 overflow-y-auto',
      )}
      style={
        localScroll
          ? undefined
          : {
              paddingBottom: 'calc(1rem + var(--workspace-overlay-bottom, 0.75rem))',
              maxHeight:
                'calc(var(--mobile-workspace-viewport-height, 100dvh) - ' +
                'var(--mobile-workspace-header-height, 3.5rem) - 1rem)',
            }
      }
    >
      <div
        className={cn(
          'grid w-full gap-3',
          isSplit ? 'max-w-content-narrow' : 'max-w-content-standard',
        )}
      >
        <label htmlFor="start-message" className="sr-only">
          {t('managedSession.message')}
        </label>
        <MessageComposer
          className="shadow-lg workspace-floating-pill"
          enterKeyBehavior={isSplit ? 'submit' : 'newline'}
          presentation="standalone"
          // Inactive until Start: nothing to write to yet.
          disabled={!started}
          onSubmit={() => setDraft('')}
        >
          <MessageComposer.Editor
            ref={editor}
            id="start-message"
            minRows={1}
            placeholder={started ? undefined : t('sessionStart.composer.placeholder')}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
          <MessageComposer.Toolbar>
            {started && (
              <div className="flex min-w-0 items-center gap-1">
                <ComposerModePicker
                  options={pickerModes(provider, agent.modelId, text)}
                  value={modeValue(agent)}
                  onChange={(mode) => onAgentChange({ ...agent, mode })}
                  compact={!isSplit}
                />
              </div>
            )}
            <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
              {started && (
                <ModelEffortPicker
                  provider={pickerProvider(provider)}
                  value={modelEffortValue(agent)}
                  onChange={(modelId, effort) =>
                    onAgentChange(applyModelEffort(agent, provider, modelId, effort))
                  }
                  compact={!isSplit}
                />
              )}
              <IconButton
                aria-label={t('managedSession.send')}
                disabled={!started || !draft.trim()}
                icon={Send}
                size="sm"
                type="submit"
                variant={started && draft.trim() ? 'primary' : 'secondary'}
              />
            </div>
          </MessageComposer.Toolbar>
        </MessageComposer>
      </div>
    </div>
  );

  return (
    <AppContent className="flex h-full min-h-0 w-full flex-col">
      {localScroll ? (
        <>
          <div
            // Keyboard access to a scrollable region whose content may be entirely locked.
            role="region"
            aria-label={t('managedSession.title')}
            tabIndex={0}
            className="scrollbar-subtle flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
          >
            {content}
          </div>
          {composerBar}
        </>
      ) : (
        <>
          {content}
          {composerBar}
        </>
      )}
    </AppContent>
  );
}

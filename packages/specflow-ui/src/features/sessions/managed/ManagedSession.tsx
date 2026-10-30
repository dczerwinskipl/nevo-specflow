import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Send, SlidersHorizontal, Square } from 'lucide-react';
import {
  Alert,
  AppContent,
  AppWorkspace,
  Button,
  Icon,
  IconButton,
  MessageComposer,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  StatusIndicator,
  TextArea,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  Typography,
  WorkspaceHeader,
  useRegisterPinnedSecondaryTab,
  useSecondaryNavigation,
  useWorkspaceCapabilities,
  cn,
} from '@nevo/ui';
import type {
  ConversationEntry,
  Interaction,
  ProviderDescriptor,
} from '@nevo/specflow-contracts/sessions';
import { createSessionFeed } from './feed';
import { ReadableText } from './MessageText';
import { createWorkInspector } from './WorkInspector';
import { SessionContext, createSessionContextStack } from './context/SessionContext';
import { unavailableSessionContext } from './context/sessionContextTypes';
import type { SessionContextViewModel } from './context/sessionContextTypes';
import { useWorkspaceLabels } from '../../../app/navigation/useWorkspaceLabels';
import type { ManagedSessionsApi } from './api';

function browserStorage() {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** Opaque Select value encoding a model+effort pair; modelId/effort are not guaranteed separator-safe. */
function encodeModelKey(modelId: string, effort?: string) {
  return JSON.stringify(effort ? [modelId, effort] : [modelId]);
}

function decodeModelKey(key: string): { modelId: string; effort?: string } {
  const [modelId, effort] = JSON.parse(key) as [string, string?];

  return effort ? { modelId, effort } : { modelId };
}

/**
 * Flattens the matched provider's models/efforts into one "Model · Effort" picker, per the
 * composer design's single combined selector. Honors the catalogue's own modelOverride/
 * effortOverride capability flags rather than assuming every listed model is overridable.
 */
function modelPickerItems(provider: ProviderDescriptor | undefined) {
  if (!provider?.capabilities.modelOverride || !provider.models.length) {
    return [];
  }

  const withEffort = provider.capabilities.effortOverride;

  return provider.models.flatMap((model) =>
    withEffort && model.efforts.length
      ? model.efforts.map((effort) => ({
          key: encodeModelKey(model.modelId, effort),
          label: model.title + ' · ' + effort,
        }))
      : [{ key: encodeModelKey(model.modelId), label: model.title }],
  );
}

function InteractionPrompt({
  interaction,
  busy,
  onRespond,
}: {
  interaction: Interaction;
  busy: boolean;
  onRespond: (answer: string, optionId?: string, allow?: boolean) => void;
}) {
  const { t } = useTranslation();
  const [answer, setAnswer] = useState('');
  const unsupported = interaction.kind === 'question' && (interaction.maxSelections ?? 1) > 1;

  return (
    <section
      aria-label={t('managedSession.responseRequired')}
      className="grid max-h-[40dvh] gap-3 overflow-y-auto rounded-control border border-border-subtle p-4"
    >
      <Typography as="h2" variant="title-sm">
        {t('managedSession.responseRequired')}
      </Typography>
      <p className="whitespace-pre-wrap break-words text-body-sm">{interaction.prompt}</p>
      {unsupported ? (
        <Alert tone="attention" title={t('managedSession.unsupportedQuestion')} />
      ) : interaction.kind === 'permission' ? (
        <>
          <p className="break-words text-body-sm">{interaction.actionSummary}</p>
          <div className="flex gap-2">
            <Button disabled={busy} onClick={() => onRespond('', undefined, true)}>
              {t('managedSession.allow')}
            </Button>
            <Button
              disabled={busy}
              variant="secondary"
              onClick={() => onRespond('', undefined, false)}
            >
              {t('managedSession.deny')}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {interaction.options?.map((option) => (
              <Button
                key={option.id}
                className="max-w-full whitespace-normal text-left"
                disabled={busy}
                variant="secondary"
                onClick={() => onRespond('', option.id)}
              >
                {option.label}
              </Button>
            ))}
          </div>
          {interaction.allowText && (
            <>
              <label htmlFor="managed-answer" className="text-body-sm">
                {t('managedSession.answer')}
              </label>
              <TextArea
                id="managed-answer"
                value={answer}
                onChange={(event) => setAnswer(event.target.value)}
              />
              <Button disabled={busy || !answer.trim()} onClick={() => onRespond(answer)}>
                {t('managedSession.respond')}
              </Button>
            </>
          )}
        </>
      )}
    </section>
  );
}

/**
 * One conversation entry, rendered per its semantic role (session-conversation-ui-spec.md §4-5).
 * V10 rule: do not prefix every entry with a repeated "Ty"/"Asystent" speaker label — the kind
 * stays available to assistive tech (`sr-only`) but visual role comes from alignment/surface/
 * typography/Markdown instead of a visible caption on every row.
 */
function EntryRow({
  entry,
  api,
  sessionId,
  outcomeLabels,
  onInspect,
}: {
  entry: ConversationEntry;
  api: ManagedSessionsApi;
  sessionId: string;
  outcomeLabels: Record<string, string>;
  onInspect: () => void;
}) {
  const { t } = useTranslation();
  const kindLabel = t(`managedSession.entry.${entry.kind}`);
  const srLabel = <span className="sr-only">{kindLabel}</span>;

  if (entry.kind === 'request') {
    return (
      <article data-entry-id={entry.id} className="grid justify-end">
        {srLabel}
        <div className="max-w-content-standard rounded-composite bg-surface-subtle px-4 py-3">
          <ReadableText api={api} sessionId={sessionId} value={entry.text} />
        </div>
      </article>
    );
  }

  if (entry.kind === 'answer') {
    return (
      <article data-entry-id={entry.id} className="grid min-w-0 gap-1">
        {srLabel}
        <ReadableText api={api} sessionId={sessionId} value={entry.text} markdown />
      </article>
    );
  }

  if (entry.kind === 'commentary') {
    return (
      <article data-entry-id={entry.id} className="grid min-w-0 gap-1 text-content-secondary">
        {srLabel}
        <ReadableText api={api} sessionId={sessionId} value={entry.text} />
      </article>
    );
  }

  if (entry.kind === 'work-summary') {
    return (
      <article data-entry-id={entry.id} className="grid min-w-0 gap-1 text-content-muted">
        {srLabel}
        <div className="flex flex-wrap items-center gap-2">
          <ReadableText api={api} sessionId={sessionId} value={entry.text} />
          <Button size="sm" variant="ghost" onClick={onInspect}>
            {t('managedSession.inspect')}
          </Button>
        </div>
      </article>
    );
  }

  // 'outcome': no celebratory chrome on completion; a quiet semantic marker on failure/cancel.
  const tone =
    entry.text.text === 'failed'
      ? 'danger'
      : entry.text.text === 'completed'
        ? undefined
        : 'neutral';

  return (
    <article
      data-entry-id={entry.id}
      className={cn(
        'grid min-w-0 gap-1',
        entry.text.text === 'failed' ? 'text-content-error' : 'text-content-secondary',
      )}
    >
      {srLabel}
      <div className="flex flex-wrap items-center gap-2">
        {tone && <StatusIndicator tone={tone} aria-label={kindLabel} decorative={false} />}
        <ReadableText
          api={api}
          sessionId={sessionId}
          value={{ ...entry.text, text: outcomeLabels[entry.text.text] ?? entry.text.text }}
        />
        <Button size="sm" variant="ghost" onClick={onInspect}>
          {t('managedSession.inspect')}
        </Button>
      </div>
    </article>
  );
}

export function ManagedSession({
  sessionId,
  owner,
  api,
  sessionContext = unavailableSessionContext,
}: {
  sessionId: string;
  owner: string;
  api: ManagedSessionsApi;
  /**
   * Context Secondary content (full-session-screen-structure.md §7). Optional because the real
   * managed-Sessions contract has no Specification/Task association projection yet: the default
   * is an honest "unavailable" Context, not a fabricated empty one. Callers with a real/mock
   * projection (Storybook fixtures today) pass it explicitly.
   */
  sessionContext?: SessionContextViewModel;
}) {
  const { t } = useTranslation();
  const { supportsSplit } = useWorkspaceCapabilities();
  const [contextOpen, setContextOpen] = useState(true);
  // Scoped W01-W04 adoption (demonstrated via Related Tasks only, see `SessionContext`'s
  // `openRelatedTask`): registers Context as the pinned Secondary tab only on the split-capable
  // (wide) layout where it is the default declarative Secondary. `supportsSplit` gates it off on
  // the narrow/mobile layout, where Context is instead a runtime flow pushed via `navigation.open`
  // (SessionContext's `openStack` fallback) and must stay exactly as it behaves today — registering
  // the pinned tab there too would make that runtime flow's tab count reach 2 and spuriously show
  // the root-tab strip on narrow layouts.
  useRegisterPinnedSecondaryTab(
    supportsSplit && contextOpen ? { title: t('sessions.context.title') } : null,
  );
  const feed = useMemo(
    () => createSessionFeed(api, sessionId, owner, browserStorage()),
    [api, sessionId, owner],
  );
  const state = useSyncExternalStore(feed.subscribe, feed.getSnapshot, feed.getSnapshot);
  useEffect(() => {
    feed.connect();

    return () => feed.disconnect();
  }, [feed]);
  const scroller = useRef<HTMLDivElement>(null),
    anchor = useRef<{ height: number; top: number } | undefined>(undefined);
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) {
      return;
    }

    if (anchor.current) {
      node.scrollTop = anchor.current.top + node.scrollHeight - anchor.current.height;
      anchor.current = undefined;
    } else if (!state.away) {
      node.scrollTop = node.scrollHeight;
    }
  }, [state.snapshot?.entries, state.away]);
  // The Composer floats over the scrollable conversation (owner feedback #1) instead of sitting
  // in normal flow below it. Its rendered height varies (auto-growing textarea, responsive
  // toolbar, the "jump to latest" pill appearing/disappearing), so it is measured rather than
  // given a fixed padding value, mirroring the ref+ResizeObserver measurement WorkspaceHeader's
  // own `useNarrowHeader` uses for a similar "respond to a real rendered size" need. The message
  // list reserves exactly that much bottom space so the last message is never hidden behind it.
  const composerOverlay = useRef<HTMLDivElement>(null);
  const [composerHeight, setComposerHeight] = useState(0);
  useLayoutEffect(() => {
    const node = composerOverlay.current;
    if (!node) {
      return undefined;
    }

    const update = () => setComposerHeight(node.getBoundingClientRect().height);
    update();
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(update);
    observer.observe(node);

    return () => observer.disconnect();
  }, []);
  const navigation = useSecondaryNavigation(),
    labels = useWorkspaceLabels();
  const workStack = useMemo(() => createWorkInspector(api, feed, owner), [api, feed, owner]);
  const providers = useQuery({
    queryKey: ['managed-session-providers', owner],
    queryFn: ({ signal }) => api.providers(signal),
  });
  const provider = providers.data?.items.find(
    (item) => item.providerId === state.snapshot?.session.providerId,
  );
  const modelItems = useMemo(() => modelPickerItems(provider), [provider]);
  const selectedModelId = state.modelOverride ?? state.snapshot?.session.modelId;
  const selectedEffort = state.modelOverride
    ? state.effortOverride
    : state.snapshot?.session.effort;
  // Always a defined string so Select stays controlled from its first render (never undefined),
  // even before the Session's current model/effort is known.
  const selectedModelKey = selectedModelId ? encodeModelKey(selectedModelId, selectedEffort) : '';
  function older() {
    if (scroller.current) {
      anchor.current = { height: scroller.current.scrollHeight, top: scroller.current.scrollTop };
    }

    void feed.older();
  }

  const snapshot = state.snapshot;
  // Mirrors the Send button's own disabled condition so MessageComposer's Enter-to-submit path
  // (which bypasses the button's `disabled` attribute entirely) cannot start a Turn the capability
  // gate, an empty draft, or an in-flight command would otherwise block.
  const canSend =
    !!snapshot &&
    !state.commandBusy &&
    (!!state.pending || snapshot.session.capabilities.start) &&
    (!!state.pending || !!state.draft.trim());
  // The composer shows one adaptive Send/Stop action (owner feedback #2), not two simultaneous
  // buttons: Stop only while a Turn is actually running and cancellable, Send/Retry otherwise.
  const canCancel = !!snapshot?.session.capabilities.cancel && !!snapshot?.activeTurn;
  const sendActionLabelKey = canCancel
    ? 'managedSession.cancel'
    : state.pending
      ? 'managedSession.retrySend'
      : 'managedSession.send';
  const handleComposerSubmit = () => {
    if (!canSend) {
      return;
    }

    void feed.send();
  };

  const outcomeLabels: Record<string, string> = {
    completed: t('managedSession.outcome.completed'),
    failed: t('managedSession.outcome.failed'),
    cancelled: t('managedSession.outcome.cancelled'),
    interrupted: t('managedSession.outcome.interrupted'),
  };

  return (
    <AppWorkspace scroll="content" fit="available" split="dynamic" labels={labels}>
      <AppWorkspace.Primary
        header={
          <WorkspaceHeader
            title={snapshot?.session.title ?? t('managedSession.title')}
            actions={
              !supportsSplit
                ? [
                    {
                      id: 'context',
                      label: t('sessions.context.title'),
                      icon: 'file',
                      onPress: () =>
                        void navigation.open(
                          createSessionContextStack(sessionId, sessionContext),
                          {},
                        ),
                    },
                  ]
                : !contextOpen
                  ? [
                      {
                        id: 'context',
                        label: t('sessions.context.title'),
                        icon: 'file',
                        onPress: () => setContextOpen(true),
                      },
                    ]
                  : undefined
            }
          />
        }
      >
        <AppContent className="flex h-full min-h-0 w-full flex-col">
          {!snapshot ? (
            <div className="grid gap-3 p-5">
              <p role="status">
                {t(
                  state.connection === 'error' ? 'managedSession.failed' : 'managedSession.loading',
                )}
              </p>
              {state.connection === 'error' && (
                <Button onClick={() => feed.connect()}>{t('common.retry')}</Button>
              )}
            </div>
          ) : (
            <>
              {snapshot.session.readiness === 'authenticationRequired' && (
                <Alert tone="attention" title={t('managedSession.authenticationRequired')}>
                  <p>{t('managedSession.authenticationHelp')}</p>
                  <Button disabled={state.commandBusy} onClick={() => void feed.recheckProvider()}>
                    {t('managedSession.recheckAuthentication')}
                  </Button>
                </Alert>
              )}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-subtle px-5 py-3">
                <p className="text-body-sm text-content-muted">
                  {snapshot.session.providerId === 'mock'
                    ? t('managedSession.mockNote')
                    : snapshot.session.providerId}
                </p>
                <span role="status" className="flex items-center gap-1.5 text-body-sm">
                  {state.connection === 'connected' &&
                    snapshot.currentActivity?.kind === 'waiting' && <Spinner size="sm" />}
                  {state.connection === 'connected'
                    ? (snapshot.currentActivity?.label ??
                      t(`managedSession.${snapshot.session.readiness}`))
                    : t(`managedSession.${state.connection}`)}
                </span>
                {state.connection === 'error' && (
                  <Button size="sm" onClick={() => feed.connect()}>
                    {t('common.retry')}
                  </Button>
                )}
              </div>
              {/* The Composer floats over the conversation (owner feedback #1) instead of sitting
                  in normal flow below it: this wrapper is the shared positioning context, the
                  scroller fills it and reserves `composerHeight` of bottom padding so the last
                  message is never hidden, and the overlay anchors to its bottom edge, growing
                  upward with the composer's own measured height. */}
              <div className="relative min-h-0 flex-1">
                <div
                  ref={scroller}
                  className="absolute inset-0 overflow-y-auto overscroll-contain"
                  style={{ paddingBottom: composerHeight || undefined }}
                  onScroll={(event) => {
                    const node = event.currentTarget;
                    feed.setAway(node.scrollHeight - node.scrollTop - node.clientHeight > 80);
                  }}
                >
                  <div className="mx-auto grid w-full max-w-content-standard gap-5 px-5 py-5">
                    {snapshot.history.hasOlder && (
                      <Button disabled={state.historyBusy} variant="ghost" onClick={older}>
                        {t('managedSession.older')}
                      </Button>
                    )}
                    {state.historyError && (
                      <Alert tone="attention" title={t('managedSession.historyFailed')}>
                        <Button size="sm" onClick={older}>
                          {t('common.retry')}
                        </Button>
                      </Alert>
                    )}
                    {!snapshot.entries.length && (
                      <p className="py-8 text-body-md text-content-muted">
                        {t('managedSession.empty')}
                      </p>
                    )}
                    {snapshot.entries.map((entry) => (
                      <EntryRow
                        key={entry.id}
                        entry={entry}
                        api={api}
                        sessionId={sessionId}
                        outcomeLabels={outcomeLabels}
                        onInspect={() =>
                          void navigation.open(workStack, { sessionId, turnId: entry.turnId })
                        }
                      />
                    ))}
                  </div>
                </div>
                <div
                  ref={composerOverlay}
                  className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-2 px-4 pb-4 pt-3 sm:px-5 sm:pb-5"
                >
                  {(state.hasNew || state.away) && (
                    <Button className="shadow-xl" variant="secondary" onClick={() => feed.latest()}>
                      {t('managedSession.latest')}
                    </Button>
                  )}
                  <div className="grid w-full max-w-content-standard gap-3">
                    {snapshot.interaction && (
                      <InteractionPrompt
                        key={snapshot.interaction.interactionId}
                        interaction={snapshot.interaction}
                        busy={state.commandBusy || !snapshot.session.capabilities.manage}
                        onRespond={(answer, optionId, allow) => {
                          const i = snapshot.interaction!;
                          void feed.respond(
                            i.interactionId,
                            i.kind === 'permission'
                              ? {
                                  requestId: crypto.randomUUID(),
                                  kind: 'permission',
                                  decision: allow ? 'allow' : 'deny',
                                }
                              : {
                                  requestId: crypto.randomUUID(),
                                  kind: 'question',
                                  answer: {
                                    optionIds: optionId ? [optionId] : [],
                                    ...(answer ? { text: answer } : {}),
                                  },
                                },
                          );
                        }}
                      />
                    )}
                    {state.commandError && (
                      <Alert tone="attention" title={t('managedSession.commandFailed')} />
                    )}
                    <label htmlFor="managed-message" className="text-body-sm">
                      {t('managedSession.message')}
                    </label>
                    <MessageComposer
                      className="shadow-2xl"
                      onSubmit={handleComposerSubmit}
                      presentation="standalone"
                    >
                      <MessageComposer.Editor
                        id="managed-message"
                        minRows={1}
                        value={state.draft}
                        onChange={(event) => feed.setDraft(event.target.value)}
                        disabled={!!state.pending || snapshot.session.readiness === 'unavailable'}
                      />
                      <MessageComposer.Toolbar>
                        {/* No left-side cluster yet: attachments/intent/operation-policy entries
                            (session-composer-design.md §6) remain out of scope. The action group
                            is pushed to the end of the toolbar's own flex row via `ml-auto` so it
                            keeps matching the right-aligned layout this screen already had. */}
                        <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                          {modelItems.length > 0 && (
                            <>
                              <label htmlFor="managed-model" className="sr-only">
                                {t('managedSession.model.label')}
                              </label>
                              <Select
                                disabled={state.commandBusy || !!state.pending}
                                value={selectedModelKey}
                                onValueChange={(key) => {
                                  const next = decodeModelKey(key);
                                  feed.setModel(next.modelId, next.effort);
                                }}
                              >
                                {/* `supportsSplit` is the same measured-width signal this screen
                                    already uses for the Context header action: on the narrow/
                                    mobile layout there is no room for the "Model · effort" text,
                                    so the trigger collapses to an icon; split-capable (wide)
                                    layouts keep showing the selected value as text. */}
                                <SelectTrigger
                                  id="managed-model"
                                  className={cn(
                                    'w-auto',
                                    supportsSplit
                                      ? 'max-w-56 gap-1.5 sm:max-w-72'
                                      : 'justify-center gap-0 px-0',
                                  )}
                                >
                                  <Icon
                                    className={cn('text-content-muted', supportsSplit && '-ml-0.5')}
                                    name={SlidersHorizontal}
                                    size="sm"
                                  />
                                  {supportsSplit && (
                                    <SelectValue
                                      placeholder={t('managedSession.model.placeholder')}
                                    />
                                  )}
                                </SelectTrigger>
                                <SelectContent>
                                  {modelItems.map((item) => (
                                    <SelectItem key={item.key} value={item.key}>
                                      {item.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </>
                          )}
                          <TooltipProvider delayDuration={400}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <IconButton
                                  aria-label={t(sendActionLabelKey)}
                                  disabled={canCancel ? state.commandBusy : !canSend}
                                  icon={canCancel ? Square : Send}
                                  type={canCancel ? 'button' : 'submit'}
                                  variant={canCancel ? 'secondary' : 'primary'}
                                  onClick={canCancel ? () => void feed.cancel() : undefined}
                                />
                              </TooltipTrigger>
                              <TooltipContent>{t(sendActionLabelKey)}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </MessageComposer.Toolbar>
                    </MessageComposer>
                  </div>
                </div>
              </div>
            </>
          )}
        </AppContent>
      </AppWorkspace.Primary>
      {/* Context is the default split-capable Secondary (full-session-screen-structure.md §3.1,
          §3.4): open by default, stays closed once the user explicitly closes it, and is restored
          by the Primary "Context" action — on narrow layouts it opens the Context Secondary stack;
          on split-capable layouts it reappears whenever Context is closed, so there is always a
          way back in regardless of `supportsSplit` (§24.2). */}
      <AppWorkspace.Secondary
        open={contextOpen}
        onOpenChange={setContextOpen}
        header={<WorkspaceHeader title={t('sessions.context.title')} />}
      >
        <SessionContext sessionId={sessionId} value={sessionContext} />
      </AppWorkspace.Secondary>
    </AppWorkspace>
  );
}

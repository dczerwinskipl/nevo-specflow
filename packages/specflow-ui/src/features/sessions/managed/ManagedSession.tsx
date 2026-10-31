import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Send, Square } from 'lucide-react';
import {
  Alert,
  AppContent,
  AppWorkspace,
  Button,
  IconButton,
  MessageComposer,
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
import type { ConversationEntry, Interaction } from '@nevo/specflow-contracts/sessions';
import { createSessionFeed } from './feed';
import { ReadableText, type ReadableTextHandle } from './MessageText';
import { ModelEffortPicker } from './ModelEffortPicker';
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
              {/* A structured interaction response, not free prose — the main message composer
                  below keeps native spellcheck; this one does not need the red squiggly
                  underlines (owner audit). */}
              <TextArea
                id="managed-answer"
                spellCheck={false}
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
 * Copy action for a specific authored message (session-chat-v10-design.md §2: "Copy and Quote
 * belong to their specific authored message"). Desktop reveals it only on hover/focus of the
 * message (the `group/message` on its `EntryRow` article below); coarse pointers always show it,
 * since hover does not exist on touch — the same `pointer-fine:opacity-0` /
 * `pointer-fine:group-hover/<name>:opacity-100` convention `treeRowActionClassName` already
 * establishes for a trailing row action in this Design System (`treeRecipes.ts`).
 *
 * Quote (quoting a message into the composer draft) is deferred: session-chat-v10-design.md only
 * says Copy and Quote "belong to" the message, without deciding whether Quote replaces or appends
 * to an existing draft, its exact quoted format, or focus handling afterward — material product
 * decisions, not implementation detail, so they are left to a follow-up rather than guessed here.
 */
function MessageCopyAction({ onCopy }: { onCopy: () => Promise<boolean> }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const resetTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(resetTimer.current), []);

  return (
    <span className="inline-flex items-center gap-1.5">
      <TooltipProvider delayDuration={400}>
        <Tooltip>
          <TooltipTrigger asChild>
            <IconButton
              aria-label={t('managedSession.copy.action')}
              className={cn(
                'shrink-0',
                'pointer-fine:opacity-0',
                'pointer-fine:group-hover/message:opacity-100',
                'pointer-fine:group-focus-within/message:opacity-100',
                'pointer-fine:focus-visible:opacity-100',
              )}
              icon={status === 'copied' ? Check : Copy}
              size="xs"
              variant="ghost"
              onClick={() => {
                clearTimeout(resetTimer.current);
                void onCopy().then((ok) => {
                  setStatus(ok ? 'copied' : 'failed');
                  resetTimer.current = setTimeout(() => setStatus('idle'), 2000);
                });
              }}
            />
          </TooltipTrigger>
          <TooltipContent>{t('managedSession.copy.action')}</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <span role="status" aria-live="polite" className="sr-only">
        {status === 'copied'
          ? t('managedSession.copy.copied')
          : status === 'failed'
            ? t('managedSession.copy.failed')
            : ''}
      </span>
    </span>
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
  onGrow,
}: {
  entry: ConversationEntry;
  api: ManagedSessionsApi;
  sessionId: string;
  outcomeLabels: Record<string, string>;
  onInspect: () => void;
  /** Forwarded to every `ReadableText` below — see its own doc comment in `MessageText.tsx`. */
  onGrow: () => void;
}) {
  const { t } = useTranslation();
  const kindLabel = t(`managedSession.entry.${entry.kind}`);
  const srLabel = <span className="sr-only">{kindLabel}</span>;
  const textRef = useRef<ReadableTextHandle>(null);
  const handleCopy = () => textRef.current?.copy() ?? Promise.resolve(false);

  if (entry.kind === 'request') {
    return (
      <article data-entry-id={entry.id} className="group/message grid justify-end gap-1">
        {srLabel}
        <div className="max-w-content-standard rounded-composite bg-surface-subtle px-4 py-3">
          <ReadableText
            ref={textRef}
            api={api}
            sessionId={sessionId}
            value={entry.text}
            onGrow={onGrow}
          />
        </div>
        <div className="flex justify-end">
          <MessageCopyAction onCopy={handleCopy} />
        </div>
      </article>
    );
  }

  if (entry.kind === 'answer') {
    return (
      <article data-entry-id={entry.id} className="group/message grid min-w-0 gap-1">
        {srLabel}
        <ReadableText
          ref={textRef}
          api={api}
          sessionId={sessionId}
          value={entry.text}
          markdown
          onGrow={onGrow}
        />
        <MessageCopyAction onCopy={handleCopy} />
      </article>
    );
  }

  if (entry.kind === 'commentary') {
    return (
      <article data-entry-id={entry.id} className="grid min-w-0 gap-1 text-content-secondary">
        {srLabel}
        <ReadableText api={api} sessionId={sessionId} value={entry.text} onGrow={onGrow} />
      </article>
    );
  }

  if (entry.kind === 'work-summary') {
    return (
      <article data-entry-id={entry.id} className="grid min-w-0 gap-1 text-content-muted">
        {srLabel}
        <div className="flex flex-wrap items-center gap-2">
          <ReadableText api={api} sessionId={sessionId} value={entry.text} onGrow={onGrow} />
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
        {/* The icon's accessible name names the specific outcome ("Niepowodzenie"/"Zatrzymano"/
            "Przerwano"), not the generic entry-kind label ("Wynik tury") every outcome entry
            shared before — the same resolved label the adjacent text already renders. */}
        {tone && (
          <StatusIndicator
            tone={tone}
            aria-label={outcomeLabels[entry.text.text] ?? kindLabel}
            decorative={false}
          />
        )}
        <ReadableText
          api={api}
          sessionId={sessionId}
          value={{ ...entry.text, text: outcomeLabels[entry.text.text] ?? entry.text.text }}
          onGrow={onGrow}
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
  // Scroll-triggered auto-loading of older history (owner feedback #5), replacing the old manual
  // "Load older messages" button: `maybeLoadOlder` (declared below, a hoisted function
  // declaration) is called both from the scroller's own `onScroll` handler (interactive scroll)
  // and from this effect, which re-checks after every entries/busy/error change — so a page that
  // was just prepended and still leaves the scroller at/near the top keeps loading until
  // `history.hasOlder` is false, and a short conversation that never overflows (so the user has
  // no scrollbar to drive) still gets its older history pulled in once mounted. Runs after the
  // anchor-restoring effect above (same commit, later in declaration order), so it reads the
  // scroll position that effect just restored, not a stale one.
  useLayoutEffect(() => {
    const node = scroller.current;
    if (node) {
      maybeLoadOlder(node);
    }
    // `maybeLoadOlder` is a hoisted function declaration (defined below, deliberately so it is
    // also reachable from this effect) that closes over the same `state.snapshot`/`historyBusy`/
    // `historyError` already listed: it has a new identity every render but no behavior beyond
    // what those listed values already determine, so adding it here would only make the effect
    // re-run on every unrelated render instead of just these.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    state.snapshot?.entries,
    state.snapshot?.history.hasOlder,
    state.historyBusy,
    state.historyError,
  ]);
  // The Composer floats over the scrollable conversation (owner feedback #1) instead of sitting
  // in normal flow below it. Its rendered height varies (auto-growing textarea, responsive
  // toolbar, the "jump to latest" pill and the pending-interaction card appearing/disappearing),
  // so it is measured rather than given a fixed padding value, mirroring the ref+ResizeObserver
  // measurement WorkspaceHeader's own `useNarrowHeader` uses for a similar "respond to a real
  // rendered size" need. The message list reserves exactly that much bottom space so the last
  // message is never hidden behind it.
  //
  // A callback ref (not `useRef` + a `[]`-dependency effect) owns attachment: the overlay only
  // exists in the DOM once `snapshot` is loaded (it sits in the `!snapshot ? ... : (...)` branch
  // below), which is typically still `undefined` on the very first render/layout-effect pass. A
  // one-shot effect would find `composerOverlay.current` null then, observe nothing, and never
  // run again once the overlay actually mounts — the real bug this fixes, not merely a timing
  // nit: `ResizeObserver` was never attached to begin with, so `composerHeight` stayed `0` and
  // `paddingBottom` stayed unset for the lifetime of the component. The callback ref instead fires
  // exactly when the node mounts/unmounts, however late that is, so the observer always attaches.
  const [composerOverlayNode, setComposerOverlayNode] = useState<HTMLDivElement | null>(null);
  const [composerHeight, setComposerHeight] = useState(0);
  // Measures and corrects in one synchronous pass. Called directly — not merely from a
  // `useLayoutEffect` keyed on state some other callback sets — from three places below: each
  // `ResizeObserver` callback (itself guaranteed to run before the browser's next paint of the
  // same frame, per spec), and `MessageText.tsx`'s own `onGrow` (guaranteed to run in the exact
  // commit that grew a message's text, via its `useLayoutEffect`, since that is the one growth
  // path a `ResizeObserver` is not a tight enough guarantee for — see `onGrow`'s doc comment in
  // `MessageText.tsx`). A `useLayoutEffect` here keyed on `composerHeight`/`contentHeight` state a
  // `ResizeObserver` callback sets would instead run a whole extra commit later than the resize
  // itself, i.e. after a paint had already happened once with the grown, not-yet-corrected
  // content — exactly the race the owner reported (item 1 follow-up): `MessageText.tsx`'s
  // auto-stitch mechanism can grow a message's box several times in quick succession, and each
  // grow briefly painted overlapping the floating interaction card before that delayed correction
  // caught up.
  const correctOverlap = useCallback(() => {
    const node = scroller.current;
    const overlay = composerOverlayNode;
    if (!node || !overlay) {
      return;
    }

    const nodeRect = node.getBoundingClientRect();
    const overlayTop = overlay.getBoundingClientRect().top;
    let overlap = 0;
    for (const entry of node.querySelectorAll<HTMLElement>('[data-entry-id]')) {
      const rect = entry.getBoundingClientRect();
      const inVisibleWindow =
        rect.height > 0 && rect.bottom > nodeRect.top && rect.top < nodeRect.bottom;
      if (inVisibleWindow) {
        overlap = Math.max(overlap, rect.bottom - overlayTop);
      }
    }

    if (overlap > 0) {
      node.scrollTop = Math.min(node.scrollHeight - node.clientHeight, node.scrollTop + overlap);
    }
  }, [composerOverlayNode]);
  useLayoutEffect(() => {
    const node = composerOverlayNode;
    if (!node) {
      return undefined;
    }

    const update = () => {
      const height = node.getBoundingClientRect().height;
      setComposerHeight(height);
      // Applied to the scroller's padding imperatively, right here, instead of waiting for the
      // `composerHeight` state write above to reach render on some *later* commit: `correctOverlap`
      // below clamps its scroll nudge to the scroller's current `scrollHeight - clientHeight`, and
      // that is itself computed from however much bottom padding is actually in the DOM right now.
      // Without this, the very first measurement after the overlay mounts (and any later one where
      // the overlay's own height changes, e.g. the interaction card appearing) would measure and
      // correct against a scroller that has not reserved the new space yet, under-clamp the nudge,
      // and let the browser paint one overlapping frame before the `composerHeight` re-render
      // catches up — the same race as the `MessageText.tsx` growth case, just on the overlay's own
      // height instead of the content's.
      if (scroller.current) {
        scroller.current.style.paddingBottom = height ? `${height}px` : '';
      }

      correctOverlap();
    };

    update();
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(update);
    observer.observe(node);

    return () => observer.disconnect();
  }, [composerOverlayNode, correctOverlap]);
  // A conversation entry can grow *after* this component's own re-render triggers run out: a
  // `ConversationEntry`'s large answer is stitched in progressively, page by page, entirely
  // inside `MessageText.tsx`'s own local `rest` state (deliberately — see its comment), which is
  // invisible to this component's `state.snapshot?.entries` dependency. `MessageText.tsx`'s own
  // `onGrow` callback (passed to `EntryRow` below as `correctOverlap` itself) is the primary,
  // tight-to-the-mutation path for exactly that growth now; this `ResizeObserver` on the entries
  // wrapper's own rendered height is the backstop for any OTHER box-size change in this subtree
  // `onGrow` would not itself be called for (e.g. a width-driven text reflow, not a `text` value
  // change). Confirmed live (owner audit): without some form of this, a story whose answer keeps
  // growing after the composer overlay/padding settle ends up permanently under-scrolled, with
  // the grown paragraph's tail rendering behind the overlay.
  const [contentNode, setContentNode] = useState<HTMLDivElement | null>(null);
  const [contentHeight, setContentHeight] = useState(0);
  useLayoutEffect(() => {
    const node = contentNode;
    if (!node) {
      return undefined;
    }

    const update = () => {
      setContentHeight(node.getBoundingClientRect().height);
      correctOverlap();
    };

    update();
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(update);
    observer.observe(node);

    return () => observer.disconnect();
  }, [contentNode, correctOverlap]);
  // Final safety net, independent of the `away`/anchor bookkeeping above and of the two
  // `ResizeObserver`s' own direct `correctOverlap()` calls: this re-runs the same correction for
  // triggers that are not themselves a resize (loading older history while "away" skips the
  // scroll-to-bottom branch entirely by design, and a short conversation's first layout can clamp
  // an attempted scroll to 0 until the reserved padding actually makes the content tall enough to
  // need scrolling). `composerHeight`/`contentHeight` keep this re-running once per settled
  // measurement too, as a harmless redundant check — the `ResizeObserver` callbacks already
  // corrected ahead of paint for the fast-growth case; this effect is the slower-but-exhaustive
  // backstop for everything else, never the only thing standing between a grown message and the
  // floating overlay.
  useLayoutEffect(() => {
    correctOverlap();
  }, [composerHeight, contentHeight, state.snapshot?.entries, state.historyBusy, correctOverlap]);
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
  const selectedModelId = state.modelOverride ?? state.snapshot?.session.modelId;
  const selectedEffort = state.modelOverride
    ? state.effortOverride
    : state.snapshot?.session.effort;
  function older() {
    if (scroller.current) {
      anchor.current = { height: scroller.current.scrollHeight, top: scroller.current.scrollTop };
    }

    void feed.older();
  }

  // "Near the top" per owner feedback #5: not literally scrollTop === 0, a threshold reached
  // shortly before it so the next page is ready before the user hits the physical edge.
  const NEAR_TOP_PX = 200;
  function maybeLoadOlder(node: HTMLDivElement) {
    if (!state.snapshot?.history.hasOlder || state.historyBusy || state.historyError) {
      return;
    }

    if (node.scrollTop < NEAR_TOP_PX) {
      older();
    }
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
                      // Directly tappable on narrow instead of buried in the generic "More
                      // actions" overflow (full-session-screen-structure.md §21.1's `[Context]`
                      // pill); `'always'` wins the single narrow direct slot regardless of this
                      // header's own measured width.
                      direct: 'always',
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
                  data-session-scroller="true"
                  className="absolute inset-0 overflow-y-auto overscroll-contain"
                  style={{ paddingBottom: composerHeight || undefined }}
                  onScroll={(event) => {
                    const node = event.currentTarget;
                    feed.setAway(node.scrollHeight - node.scrollTop - node.clientHeight > 80);
                    maybeLoadOlder(node);
                  }}
                >
                  <div
                    ref={setContentNode}
                    className="mx-auto grid w-full max-w-content-standard gap-5 px-5 py-5"
                  >
                    {/* Auto-loads on scroll near the top instead of a manual button (owner
                        feedback #5, `maybeLoadOlder`); this is just its busy indicator. */}
                    {state.historyBusy && (
                      <p role="status" className="flex items-center justify-center gap-2 py-1">
                        <Spinner size="sm" />
                        <span className="text-body-sm text-content-muted">
                          {t('managedSession.loadingOlder')}
                        </span>
                      </p>
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
                        onGrow={correctOverlap}
                      />
                    ))}
                  </div>
                </div>
                <div
                  ref={setComposerOverlayNode}
                  data-composer-overlay="true"
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
                          <ModelEffortPicker
                            provider={provider}
                            value={
                              selectedModelId
                                ? { modelId: selectedModelId, effort: selectedEffort }
                                : undefined
                            }
                            onChange={(modelId, effort) => feed.setModel(modelId, effort)}
                            disabled={state.commandBusy || !!state.pending}
                            compact={!supportsSplit}
                          />
                          <TooltipProvider delayDuration={400}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <IconButton
                                  aria-label={t(sendActionLabelKey)}
                                  disabled={canCancel ? state.commandBusy : !canSend}
                                  icon={canCancel ? Square : Send}
                                  size="sm"
                                  type={canCancel ? 'button' : 'submit'}
                                  // Bold `primary` only while Send is actually actionable: the
                                  // disabled `opacity-50` treatment alone reads too close to
                                  // "primary" at full saturation (owner audit — the composer's
                                  // disabled textarea visibly mutes, the Send icon button did
                                  // not), so the disabled Send case falls back to the same muted
                                  // `secondary` treatment Stop/Cancel already uses.
                                  variant={canCancel || !canSend ? 'secondary' : 'primary'}
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

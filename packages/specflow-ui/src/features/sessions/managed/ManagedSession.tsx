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
import { Activity, Check, Copy, Plus, Send, Square, X } from 'lucide-react';
import {
  Alert,
  AppContent,
  AppWorkspace,
  Button,
  IconButton,
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
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
  appBackgroundClassName,
  useRegisterPinnedSecondaryTab,
  useSecondaryNavigation,
  useWorkspaceCapabilities,
  useWorkspacePrimaryScroll,
  cn,
  type WorkspaceHeaderAction,
} from '@nevo/ui';
import type {
  ConversationEntry,
  Interaction,
  ProviderDescriptor,
} from '@nevo/specflow-contracts/sessions';
import { createSessionFeed, type SessionFeed } from './feed';
import { ReadableText, type ReadableTextHandle } from './MessageText';
import { ModelEffortPicker } from './ModelEffortPicker';
import { ComposerModePicker, type ComposerModeValue } from './ComposerPresetPicker';
import { demoComposerOptions } from './composerOptions';
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
      data-interaction-prompt="true"
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
    // V10 intermediate status/commentary treatment (session-chat-v10-design.md,
    // examples/session-chat-v10/desktop.html's "Przeglądam ścieżkę recovery…" status line): a
    // small icon prefix plus a muted, subtly contained row — distinct from the bare,
    // undifferentiated text this used to render (owner audit: zero visual treatment, invisible
    // against the page background), but deliberately NOT a full bordered bubble like a final
    // answer or a user message — V10 keeps final answers borderless-first; an intermediate status
    // only needs a visual anchor, not the same weight.
    return (
      <article data-entry-id={entry.id} className="grid min-w-0 gap-1">
        {srLabel}
        <div className="flex items-start gap-2 rounded-control bg-surface-subtle px-3 py-2 text-content-secondary">
          <Activity aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-content-muted" />
          <ReadableText api={api} sessionId={sessionId} value={entry.text} onGrow={onGrow} />
        </div>
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

/**
 * Primary's conversation body — messages, "jump to latest", pending interaction and the Composer
 * (including its toolbar additions: attachments, intent/operation-policy, Model+effort, Send).
 * A component of its own, not inlined into `ManagedSession`, for exactly one load-bearing reason:
 * `useWorkspacePrimaryScroll()` only resolves `AppWorkspace`'s ambient scroll element for a
 * descendant actually rendered *inside* `AppWorkspace` — `ManagedSession` itself renders
 * `<AppWorkspace>`, so it is `AppWorkspace`'s React-tree *ancestor*, never its descendant, and a
 * hook called in `ManagedSession`'s own body would always read the context's default (`null`),
 * regardless of the real ambient element `AppWorkspace` holds internally (confirmed live: without
 * this split, `useWorkspacePrimaryScroll()` returns `null` even in stacked/mobile layout, where an
 * ambient scroll element genuinely exists — `data-session-scroller` never appears in the DOM and
 * the composer's reserved bottom padding stays `0`). `ManagedSession` keeps everything the header
 * (a `header` prop it evaluates itself, also outside `AppWorkspace`'s subtree) needs; this
 * component owns everything that needs to live inside `AppWorkspace.Primary`'s own children.
 */
function ManagedSessionConversation({
  api,
  sessionId,
  feed,
  supportsSplit,
  navigation,
  workStack,
  provider,
  selectedModelId,
  selectedEffort,
}: {
  api: ManagedSessionsApi;
  sessionId: string;
  feed: SessionFeed;
  supportsSplit: boolean;
  navigation: ReturnType<typeof useSecondaryNavigation>;
  workStack: ReturnType<typeof createWorkInspector>;
  provider: ProviderDescriptor | undefined;
  selectedModelId: string | undefined;
  selectedEffort: string | undefined;
}) {
  const { t } = useTranslation();
  const state = useSyncExternalStore(feed.subscribe, feed.getSnapshot, feed.getSnapshot);
  // `supportsSplit` also decides scroll ownership (secondary-navigation.md "Reaching Primary's
  // ambient scroll element, and the bottom safe area"): on the split/desktop layout `AppWorkspace`
  // gives Primary no scroll affordance of its own, so this component keeps owning a local scroll
  // container exactly as it always has (`localScrollNode`); on the stacked/mobile layout
  // (`scroll="workspace"`, migrated from `scroll="content"` in `ManagedSession` below) the real
  // scroll owner is `AppWorkspace`'s own page-level `ScrollArea` viewport, reached through
  // `useWorkspacePrimaryScroll()` — there is no local container to render there at all. `scroller`
  // is the one place both are unified into a single element every other effect below reads.
  const ambientScrollElement = useWorkspacePrimaryScroll();
  const [localScrollNode, setLocalScrollNode] = useState<HTMLDivElement | null>(null);
  const scroller = supportsSplit ? localScrollNode : ambientScrollElement;
  const anchor = useRef<{ height: number; top: number } | undefined>(undefined);
  // The Composer must stay pinned to the viewport bottom at all times — ONLY the conversation
  // scrolls underneath it, never the Composer itself (owner audit, live on a real phone: an
  // earlier `position: sticky`-everywhere pass regressed into "the Composer is just another block
  // in the page flow, only visible once scrolled all the way down" on the real composed route).
  // Split/desktop: `position: sticky` as the local scroll container's own last flow child — this
  // component owns that single-level container, so sticky reserves its own space correctly and
  // stays correctly bounded to Primary's own column (confirmed live). Stacked/mobile:
  // `position: fixed` instead — `MobileRuntimeSurfaceRegion` interposes clipping wrappers between
  // here and the real scroll viewport for the rounded sheet surface and slide transition, and
  // `sticky` needs to resolve relative to the TRUE scrolling ancestor to stay pinned; `fixed` is
  // unconditionally anchored to the viewport regardless of any ancestor's stacking context, so it
  // is the only mechanism `scroll="workspace"`'s own multi-layer composition can rely on
  // unconditionally. Either way the Composer's rendered height varies (auto-growing textarea,
  // responsive toolbar, the "jump to latest" pill and the pending-interaction card appearing/
  // disappearing), so it is measured rather than given a fixed value, mirroring the
  // ref+ResizeObserver measurement `WorkspaceHeader`'s own `useNarrowHeader` uses for a similar
  // "respond to a real rendered size" need.
  //
  // A callback ref (not `useRef` + a `[]`-dependency effect) owns attachment: the overlay only
  // exists in the DOM once `snapshot` is loaded (it sits in the `!snapshot ? ... : (...)` branch
  // below), which is typically still `undefined` on the very first render/layout-effect pass. A
  // one-shot effect would find `composerOverlay.current` null then, observe nothing, and never
  // run again once the overlay actually mounts. The callback ref instead fires exactly when the
  // node mounts/unmounts, however late that is, so the observer always attaches.
  const [composerOverlayNode, setComposerOverlayNode] = useState<HTMLDivElement | null>(null);
  const [composerHeight, setComposerHeight] = useState(0);
  // Marks whichever element is the current scroll owner so existing geometry-based Storybook
  // regression checks (`data-session-scroller`) keep working whether it is this component's own
  // local container (split/desktop) or the ambient one `AppWorkspace` owns (stacked/mobile) — the
  // mobile case has no JSX of its own to attach a static attribute to.
  useEffect(() => {
    const node = scroller;
    if (!node) {
      return undefined;
    }

    node.dataset.sessionScroller = 'true';

    return () => {
      delete node.dataset.sessionScroller;
    };
  }, [scroller]);
  useLayoutEffect(() => {
    const node = scroller;
    if (!node) {
      return;
    }

    if (anchor.current) {
      node.scrollTop = anchor.current.top + node.scrollHeight - anchor.current.height;
      anchor.current = undefined;
    } else if (!state.away) {
      node.scrollTop = node.scrollHeight;
    }
    // `composerHeight` is a deliberate extra trigger, not merely a value read here: a composer
    // that grows while the user is at the bottom (not `away`) must re-pin the view to the new
    // bottom, the same way a new entry does.
  }, [state.snapshot?.entries, state.away, scroller, composerHeight]);
  // Scroll-triggered auto-loading of older history (owner feedback #5), replacing the old manual
  // "Load older messages" button: `maybeLoadOlder` (declared below, a hoisted function
  // declaration) is called both from the scroll listener below (interactive scroll) and from this
  // effect, which re-checks after every entries/busy/error change — so a page that was just
  // prepended and still leaves the scroller at/near the top keeps loading until `history.hasOlder`
  // is false, and a short conversation that never overflows (so the user has no scrollbar to
  // drive) still gets its older history pulled in once mounted. Runs after the anchor-restoring
  // effect above (same commit, later in declaration order), so it reads the scroll position that
  // effect just restored, not a stale one.
  useLayoutEffect(() => {
    const node = scroller;
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
    scroller,
    state.snapshot?.entries,
    state.snapshot?.history.hasOlder,
    state.historyBusy,
    state.historyError,
  ]);
  // Native `scroll` listener, not a JSX `onScroll` prop: on mobile `scroller` is
  // `AppWorkspace`'s own ambient element, not one this component renders itself, so there is no
  // JSX to attach a handler to. Covers both the away-from-bottom ("jump to latest") detection and
  // the same `maybeLoadOlder` the effect above already drives after a data change, now also
  // driven by the user's own interactive scrolling. Deliberately does *not* also call
  // `handleScroll()` eagerly on attach/dependency-change the way the effect above calls
  // `maybeLoadOlder` eagerly: `feed.older()` sets `away: true` itself the moment it starts
  // (`feed.ts`), as its own "you've navigated into history" signal, independent of geometry; an
  // eager geometry-only recompute here — which this effect's own deps (`historyBusy`/
  // `historyError`/`hasOlder`) cause to re-run on every `older()` call — would immediately
  // overwrite that back to `false` whenever the anchor-restoring effect's programmatic
  // `scrollTop` assignment happens to land back at the (new) bottom, which it legitimately often
  // does (confirmed live: this is exactly what made `away` never read `true` after `older()`,
  // even though the feed had just set it). Only a real `scroll` event — user-driven or not —
  // should ever recompute `away` from geometry.
  useEffect(() => {
    const node = scroller;
    if (!node) {
      return undefined;
    }

    // Debounced, not recomputed on every tick (owner audit, live on a real phone: a slow manual
    // scroll gesture fires many intermediate `scroll` events, and committing `away` from each one
    // made the "jump to latest" pill flicker in/out mid-gesture as the 80px threshold was crossed
    // and re-crossed by hand-jitter alone). `AWAY_SETTLE_MS` only *delays* when the computed value
    // reaches `feed` — it still recomputes from the latest geometry each time, so the pill never
    // shows a stale verdict, only a slightly late one, settling in once scrolling pauses rather
    // than chasing every intermediate position.
    const AWAY_SETTLE_MS = 200;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const handleScroll = () => {
      maybeLoadOlder(node);
      if (settleTimer !== undefined) {
        clearTimeout(settleTimer);
      }

      settleTimer = setTimeout(() => {
        feed.setAway(node.scrollHeight - node.scrollTop - node.clientHeight > 80);
      }, AWAY_SETTLE_MS);
    };

    node.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      node.removeEventListener('scroll', handleScroll);
      if (settleTimer !== undefined) {
        clearTimeout(settleTimer);
      }
    };
    // Same closure note as the effect above: `maybeLoadOlder`/`feed` are recreated every render
    // with no behavior beyond the listed primitives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scroller, state.snapshot?.history.hasOlder, state.historyBusy, state.historyError]);
  // Re-pins the view to the bottom when the user has not scrolled away — called directly, not
  // merely from a `useLayoutEffect` keyed on state some other callback sets, from three places
  // below: each `ResizeObserver` callback (itself guaranteed to run before the browser's next
  // paint of the same frame, per spec), and `MessageText.tsx`'s own `onGrow` (guaranteed to run in
  // the exact commit that grew a message's text, via its own `useLayoutEffect`, since that is the
  // one growth path a `ResizeObserver` is not a tight enough guarantee for — see `onGrow`'s doc
  // comment in `MessageText.tsx`). A conversation entry can grow *after* this component's own
  // re-render triggers run out: a large answer is stitched in progressively, page by page, inside
  // `MessageText.tsx`'s own local state, invisible to this component's `state.snapshot?.entries`
  // dependency — `onGrow` is how that growth still keeps the view pinned to the bottom.
  //
  // Two corrections, both unconditional on `supportsSplit` and on `away` (confirmed live,
  // growth-story regression: `sessionFixture`'s own `history.hasOlder: true` triggers
  // auto-load-older on mount, setting `away: true` before an answer even starts growing — gating
  // either correction on `!away` left overlap uncorrected for exactly that case):
  // 1. A measured overlap nudge, the primary mechanism: whatever is currently visible inside the
  //    scroller must never render behind the overlay's current screen position, regardless of why
  //    (composer growing, an entry growing, or either not yet having settled right after mount).
  //    Split/desktop `sticky` reserves its own space by construction, so this is normally a no-op
  //    there (overlap stays 0); stacked/mobile `fixed` reserves none of its own, so this is load-
  //    bearing there — it measures each visible entry directly and nudges `scrollTop` by the real
  //    pixel overlap against the overlay's current top, correct regardless of whether the
  //    ResizeObserver-measured bottom padding has caught up yet.
  // 2. A plain scroll-to-bottom snap, split/desktop only (stacked/mobile already reaches the
  //    bottom via nudging alone, and forcing it there risks fighting the anchor-restore effect's
  //    own, separate scrollTop assignment) — keeps a short conversation pinned to its true bottom
  //    as the composer/an entry grows, the same way a new entry arriving does.
  const pinToBottomIfNotAway = useCallback(() => {
    const node = scroller;
    const overlay = composerOverlayNode;
    if (!node || !overlay) {
      return;
    }

    const nodeRect = node.getBoundingClientRect();
    const overlayTop = overlay.getBoundingClientRect().top;
    let overlap = 0;
    for (const entry of node.querySelectorAll<HTMLElement>('[data-entry-id]')) {
      const rect = entry.getBoundingClientRect();
      const insideVisibleWindow =
        rect.height > 0 && rect.bottom > nodeRect.top && rect.top < nodeRect.bottom;
      if (insideVisibleWindow) {
        overlap = Math.max(overlap, rect.bottom - overlayTop);
      }
    }

    if (overlap > 0) {
      node.scrollTop = Math.min(node.scrollHeight - node.clientHeight, node.scrollTop + overlap);
    } else if (supportsSplit && !state.away) {
      node.scrollTop = node.scrollHeight;
    }
  }, [composerOverlayNode, scroller, state.away, supportsSplit]);
  useLayoutEffect(() => {
    const node = composerOverlayNode;
    if (!node) {
      return undefined;
    }

    const update = () => {
      const height = node.getBoundingClientRect().height;
      setComposerHeight(height);
      // Only the stacked/mobile `position: fixed` composer needs this: it reserves no space of
      // its own, unlike the split/desktop `position: sticky` one, which already reserves its own
      // space in the scroll content's normal flow and needs no padding at all. Applied
      // imperatively, right here, instead of waiting for the `composerHeight` state write above to
      // reach render on some *later* commit, so the very first measurement after the overlay
      // mounts (and any later one where its height changes, e.g. the interaction card appearing)
      // reserves the new space before `pinToBottomIfNotAway` below reads `scrollHeight`.
      if (!supportsSplit && scroller) {
        scroller.style.paddingBottom = height ? `${height}px` : '';
      }

      pinToBottomIfNotAway();
    };

    update();
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(update);
    observer.observe(node);

    return () => observer.disconnect();
  }, [composerOverlayNode, pinToBottomIfNotAway, scroller, supportsSplit]);
  // Final safety net, independent of the `away`/anchor bookkeeping above and of the
  // `ResizeObserver`'s own direct `pinToBottomIfNotAway()` call: re-runs the same correction for
  // triggers that are not themselves a resize (loading older history while "away" skips the
  // scroll-to-bottom branch entirely by design, and a short conversation's first layout can clamp
  // an attempted scroll to 0 until the reserved padding actually makes the content tall enough to
  // need scrolling).
  useLayoutEffect(() => {
    pinToBottomIfNotAway();
  }, [composerHeight, state.snapshot?.entries, state.historyBusy, pinToBottomIfNotAway]);
  function older() {
    if (scroller) {
      anchor.current = { height: scroller.scrollHeight, top: scroller.scrollTop };
    }

    void feed.older();
  }

  // "Near the top" per owner feedback #5: not literally scrollTop === 0, a threshold reached
  // shortly before it so the next page is ready before the user hits the physical edge.
  const NEAR_TOP_PX = 200;
  function maybeLoadOlder(node: HTMLElement) {
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

    // Demo-only (§5/§7): nothing above actually transports `attachments`; clearing them here
    // simulates "consumed by Send" the same way the mockup's own simulated Send does.
    setAttachments([]);
    void feed.send();
  };

  const outcomeLabels: Record<string, string> = {
    completed: t('managedSession.outcome.completed'),
    failed: t('managedSession.outcome.failed'),
    cancelled: t('managedSession.outcome.cancelled'),
    interrupted: t('managedSession.outcome.interrupted'),
  };

  // Composer toolbar's "+"/intent/operation-policy entries (session-composer-design.md §6: an
  // owner-approved, not-yet-backend-contracted part of the toolbar — see `composerOptions.ts`'s
  // own doc comment for why this is a local demo catalogue, not a placeholder). Attachments are
  // local-only React state: §5 documents the real upload contract as a known gap, so nothing here
  // is actually sent anywhere — `handleComposerSubmit` below just clears the chips, matching the
  // mockup's own "local mock" framing (`managedSession.attach.note`).
  const [attachments, setAttachments] = useState<{ id: string; name: string; size: number }[]>([]);
  // Two hidden inputs, not one (owner audit): "+" opens a menu offering "Dodaj plik"/"Dodaj obraz"
  // rather than jumping straight to a native file/image picker — `accept="image/*"` on the image
  // input is itself part of that distinction (a generic file input would let through anything).
  const fileAttachmentInputRef = useRef<HTMLInputElement>(null);
  const imageAttachmentInputRef = useRef<HTMLInputElement>(null);
  const composerOptions = useMemo(
    () => demoComposerOptions(state.snapshot?.session.providerId),
    [state.snapshot?.session.providerId],
  );
  // One combined intent + operation-policy choice (owner audit, round five: the same "flatten the
  // dependent sub-choice into the parent's own list" trick `ModelEffortPicker` uses for Model →
  // effort, applied to intent → operation policy — see `ComposerModePicker`'s own doc comment).
  const [composerMode, setComposerMode] = useState<ComposerModeValue | undefined>(undefined);
  const handleAttachmentsSelected = (
    files: FileList | null,
    inputRef: typeof fileAttachmentInputRef,
  ) => {
    if (!files || files.length === 0) {
      return;
    }

    setAttachments((current) => [
      ...current,
      ...Array.from(files).map((file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        size: file.size,
      })),
    ]);
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const removeAttachment = (id: string) =>
    setAttachments((current) => current.filter((attachment) => attachment.id !== id));

  return (
    <AppContent className="flex h-full min-h-0 w-full flex-col">
      {!snapshot ? (
        <div className="grid gap-3 p-5">
          <p role="status">
            {t(state.connection === 'error' ? 'managedSession.failed' : 'managedSession.loading')}
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
          {/* `conversationBody`'s message list is identical on both layouts; only what *wraps*
                  it, and the Composer's own `sticky`/`fixed` positioning inside it, differ
                  (secondary-navigation.md "Reaching Primary's ambient scroll element" — see the
                  Composer wrapper's own comment below): split/desktop owns a single local scroll
                  container (`localScrollNode`) this all renders inside; stacked/mobile has no
                  local container at all — `AppWorkspace`'s own ambient page scroll (`scroller`,
                  from `useWorkspacePrimaryScroll()`) owns it instead. */}
          {(() => {
            const conversationBody = (
              <>
                <div className="mx-auto grid w-full max-w-content-standard gap-5 px-5 py-5">
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
                      onGrow={pinToBottomIfNotAway}
                    />
                  ))}
                </div>
                {/* "Jump to latest": a genuinely independent floating control (owner audit, live
                    on a real phone: "ten przycisk żeby przesunąć na dół najlepiej jakby też był
                    floating") — deliberately a SIBLING of `composerOverlayNode` below, never a
                    flow child inside it. It used to render as the overlay's own first child,
                    which meant its own appear/disappear toggle changed that single node's
                    measured height — the exact node `composerOverlayNode`'s `ResizeObserver`
                    (below) watches to drive `pinToBottomIfNotAway`'s scroll correction. Traced
                    live-code sequence that produced the reported jump: scroll up -> `away`
                    settles `true` -> this control renders -> the then-shared overlay node grows
                    by the control's own height -> `ResizeObserver` fires -> `pinToBottomIfNotAway`
                    reads the overlay's now-higher (because taller) top edge against the visible
                    entries and/or (split/desktop) snaps straight to `scrollHeight` -> that
                    `scrollTop` correction can land close enough to the true bottom that the next
                    `scroll` event settles `away` back to `false` -> the control disappears again
                    -> net effect: appear, self-correcting jump, vanish. Floating entirely outside
                    `composerOverlayNode` means its own render can never feed that loop: it is not
                    inside the observed node, and it is not a `[data-entry-id]` message either, so
                    `pinToBottomIfNotAway`'s overlap scan does not see it. Positioned to land in
                    the same place as before (just above the composer): `sticky` on split/desktop
                    (bounded to this component's own local scroll container, exactly like the
                    overlay itself, per that element's own doc comment below) and `fixed` on
                    stacked/mobile (anchored to the true viewport, like the overlay), each offset
                    by the overlay's own live-measured `composerHeight` plus a small gap, so it
                    tracks the composer's actual current height without needing to live inside it. */}
                {(state.hasNew || state.away) && (
                  <div
                    className={cn(
                      'z-20',
                      supportsSplit
                        ? 'sticky self-center'
                        : 'fixed inset-x-0 flex justify-center px-4',
                    )}
                    style={{
                      bottom: supportsSplit
                        ? `calc(var(--workspace-overlay-bottom, 0.75rem) + ${composerHeight}px + 0.5rem)`
                        : `calc(${composerHeight}px + 0.5rem)`,
                    }}
                  >
                    <Button className="shadow-xl" variant="secondary" onClick={() => feed.latest()}>
                      {t('managedSession.latest')}
                    </Button>
                  </div>
                )}
                <div
                  ref={setComposerOverlayNode}
                  data-composer-overlay="true"
                  // Split/desktop: a normal flow child of the single local scroll container above
                  // (`position: sticky` reserves its own space there, confirmed live, and needs no
                  // height cap — the container it is inside is already bounded by the workspace
                  // layout). Stacked/mobile: `position: fixed` instead (owner audit, live on a
                  // real phone: `sticky` must sit relative to the TRUE scrolling ancestor to stay
                  // pinned, and this screen's real composed route — unlike this component's own
                  // isolated Storybook fixture — did not reliably give it one; `fixed` is
                  // unconditionally pinned to the viewport regardless of any ancestor's stacking
                  // context, which is the actual "only the composer stays put, nothing else
                  // scrolls" requirement). `fixed` reserves no space of its own, so the ambient
                  // scroller's `padding-bottom` is measured and applied imperatively below
                  // (`composerOverlayNode`'s own `ResizeObserver`), and the overlay is capped to
                  // the space actually available below the (possibly still visible) collapsing
                  // header via the same CSS custom properties that header already measures itself
                  // (`AppWorkspace.css`) — not a separately computed height relationship of this
                  // component's own.
                  //
                  // Stacked/mobile only: owner audit, live on a real phone ("Composer - tło nie
                  // dosięga") — `bottom: var(--workspace-overlay-bottom, …)` previously floated
                  // the *entire* overlay (including the zone its own background should fill) up
                  // off the true viewport/safe-area edge, the same treatment the top floating-nav
                  // pill intentionally uses; unlike that pill, the Composer is meant to read as a
                  // solid bar docked to the edge (mockup's own `.composerwrap`), not a floating
                  // card with transparent margin around it. It now pins to the real `bottom: 0`
                  // with its own `appBackgroundClassName` background filling all the way down, and
                  // reserves the safe-area clearance as `padding-bottom` *inside* that background
                  // instead of lifting the whole element away from the edge — so nothing scrolling
                  // underneath can ever show through the gap. Split/desktop keeps the unchanged
                  // floating-above-the-edge treatment: it is a `sticky` child of its own local
                  // scroll container, which already shares that container's opaque background, so
                  // there is no transparent zone for content to show through underneath it.
                  className={cn(
                    'z-10 flex flex-col items-center gap-2 px-4 pt-3 sm:px-5',
                    supportsSplit
                      ? 'sticky pb-4 sm:pb-5'
                      : cn('fixed inset-x-0 bottom-0 z-20 overflow-y-auto', appBackgroundClassName),
                  )}
                  style={
                    supportsSplit
                      ? { bottom: 'var(--workspace-overlay-bottom, 0.75rem)' }
                      : {
                          // The same breathing room `pb-4` gave before, now stacked on top of the
                          // safe-area clearance instead of replacing it — see the className comment
                          // above for why this moved from a `bottom` offset to `padding-bottom`.
                          paddingBottom: 'calc(1rem + var(--workspace-overlay-bottom, 0.75rem))',
                          maxHeight:
                            'calc(var(--mobile-workspace-viewport-height, 100dvh) - ' +
                            'var(--mobile-workspace-header-height, 3.5rem) - 1rem)',
                        }
                  }
                >
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
                    {/* Attachments/previews sit above the message text (session-composer-
                            design.md §6 visual order), demo-only chips — see `handleComposerSubmit`
                            and `managedSession.attach.note`. */}
                    {attachments.length > 0 && (
                      <div
                        aria-label={t('managedSession.attach.list')}
                        className="flex flex-wrap gap-2"
                      >
                        {attachments.map((attachment) => (
                          <span
                            key={attachment.id}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-control border border-border-subtle bg-surface-subtle px-2 py-1 text-body-sm"
                          >
                            <span className="truncate">{attachment.name}</span>
                            <IconButton
                              aria-label={t('managedSession.attach.remove', {
                                name: attachment.name,
                              })}
                              icon={X}
                              size="xs"
                              variant="ghost"
                              onClick={() => removeAttachment(attachment.id)}
                            />
                          </span>
                        ))}
                      </div>
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
                        {/* Visual order per session-composer-design.md §6: "+", intent/preset,
                                conditional operation policy, then the trailing Model+effort/Send
                                cluster (`ml-auto` keeps that cluster right-aligned, as it already
                                was). */}
                        <div className="flex flex-wrap items-center gap-1">
                          <input
                            ref={fileAttachmentInputRef}
                            hidden
                            multiple
                            type="file"
                            onChange={(event) =>
                              handleAttachmentsSelected(event.target.files, fileAttachmentInputRef)
                            }
                          />
                          <input
                            ref={imageAttachmentInputRef}
                            accept="image/*"
                            hidden
                            multiple
                            type="file"
                            onChange={(event) =>
                              handleAttachmentsSelected(event.target.files, imageAttachmentInputRef)
                            }
                          />
                          {/* Opens a menu ("Dodaj plik"/"Dodaj obraz"), not a native picker
                              directly (owner audit): the mockup's own "+" affordance is itself a
                              menu trigger (desktop.html's `c3-plus`/`data-cmp="attach"`), and a
                              bare `IconButton` here — not also wrapped in `Tooltip`/
                              `TooltipTrigger`, see `ComposerModePicker`'s doc comment — avoids
                              the same nested-`asChild` tap bug. */}
                          <Menu>
                            <MenuTrigger asChild>
                              <IconButton
                                aria-label={t('managedSession.attach.action')}
                                icon={Plus}
                                size="sm"
                                title={t('managedSession.attach.action')}
                                variant="ghost"
                              />
                            </MenuTrigger>
                            <MenuContent
                              align="start"
                              aria-label={t('managedSession.attach.action')}
                            >
                              <MenuItem
                                leadingIcon="file"
                                onSelect={() => fileAttachmentInputRef.current?.click()}
                              >
                                {t('managedSession.attach.addFile')}
                              </MenuItem>
                              <MenuItem
                                leadingIcon="image"
                                onSelect={() => imageAttachmentInputRef.current?.click()}
                              >
                                {t('managedSession.attach.addImage')}
                              </MenuItem>
                            </MenuContent>
                          </Menu>
                          <ComposerModePicker
                            options={composerOptions}
                            value={composerMode}
                            onChange={setComposerMode}
                            disabled={state.commandBusy || !!state.pending}
                            compact={!supportsSplit}
                          />
                        </div>
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
              </>
            );

            return supportsSplit ? (
              <div
                ref={setLocalScrollNode}
                className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
              >
                {conversationBody}
              </div>
            ) : (
              conversationBody
            );
          })()}
        </>
      )}
    </AppContent>
  );
}

export function ManagedSession({
  sessionId,
  owner,
  api,
  sessionContext = unavailableSessionContext,
  onOpenSpecification,
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
  /**
   * Opens the Specification this session belongs to (`SessionContext`'s own Specification row —
   * see its doc comment). `ManagedSession` stays router-agnostic itself (mounted unrouted by its
   * own Storybook stories); the real route composition (`routes.tsx`'s `ManagedSessionRoute`) is
   * responsible for wiring this to the real `/specs/$specId` navigation. Omitted (or
   * `sessionContext.specification` absent): the row simply doesn't render, on either layout.
   */
  onOpenSpecification?: (
    specification: NonNullable<SessionContextViewModel['specification']>,
  ) => void;
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
  // Read again here (the same `feed`, so always consistent with `ManagedSessionConversation`'s own
  // read of it): only the header above needs it in this component, everything else now lives in
  // that child — see its own doc comment for why the split exists at all.
  const state = useSyncExternalStore(feed.subscribe, feed.getSnapshot, feed.getSnapshot);
  useEffect(() => {
    feed.connect();

    return () => feed.disconnect();
  }, [feed]);
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
  const snapshot = state.snapshot;

  // Folded into the real page header's own low-emphasis `status`/`subtitle` slots (owner audit:
  // the previous dedicated, bordered status/provider row read as a second header competing with
  // this one for space, especially on narrow widths — the same space pressure implicated in the
  // floating-overlay overlap this pass also fixes) instead of a standalone row in the conversation
  // flow. Nothing it showed is dropped: the connection/activity text and the mock-provider safety
  // note both still render, just as the header's own muted subtitle; `role="status"` keeps the
  // same live-region announcement the old row's `<span role="status">` gave screen reader users.
  const activityLabel = snapshot
    ? state.connection === 'connected'
      ? (snapshot.currentActivity?.label ?? t(`managedSession.${snapshot.session.readiness}`))
      : t(`managedSession.${state.connection}`)
    : undefined;
  const isWaitingOnProvider =
    !!snapshot && state.connection === 'connected' && snapshot.currentActivity?.kind === 'waiting';
  // The raw provider id ("claude-code", "codex", …) is not shown on its own anymore (owner audit:
  // "tragiczne designowo" — not meaningful to a user who already sees the active model via the
  // composer's own Model picker). Only the mock-provider safety caveat survives, since it carries
  // real operational meaning ("nothing you do here persists"), not mere identity.
  const mockNote =
    snapshot?.session.providerId === 'mock' ? t('managedSession.mockNote') : undefined;
  // Activity first, mock-note second: `WorkspaceHeaderIdentity`'s subtitle is a single truncated
  // line, so if space runs out on a narrow header the less operationally urgent mock-provider
  // caveat is what gets clipped, never the "is the agent working/stuck" signal.
  const headerSubtitle =
    activityLabel || mockNote ? (
      <span role="status">
        {activityLabel && mockNote ? `${activityLabel} · ${mockNote}` : (activityLabel ?? mockNote)}
      </span>
    ) : undefined;
  const contextAction: WorkspaceHeaderAction | undefined = !supportsSplit
    ? {
        id: 'context',
        label: t('sessions.context.title'),
        icon: 'file',
        // Directly tappable on narrow instead of buried in the generic "More actions" overflow
        // (full-session-screen-structure.md §21.1's `[Context]` pill); `'always'` wins the single
        // narrow direct slot regardless of this header's own measured width.
        direct: 'always',
        onPress: () =>
          void navigation.open(
            createSessionContextStack(sessionId, sessionContext, onOpenSpecification),
            {},
          ),
      }
    : !contextOpen
      ? {
          id: 'context',
          label: t('sessions.context.title'),
          icon: 'file',
          onPress: () => setContextOpen(true),
        }
      : undefined;
  // Replaces the old status row's own Retry button (`state.connection === 'error'`), which this
  // pass removes along with the rest of that row.
  const retryConnectionAction: WorkspaceHeaderAction | undefined =
    snapshot && state.connection === 'error'
      ? {
          id: 'retry-connection',
          label: t('common.retry'),
          icon: 'refresh',
          onPress: () => feed.connect(),
        }
      : undefined;
  const headerActions = [contextAction, retryConnectionAction].filter(
    Boolean,
  ) as WorkspaceHeaderAction[];

  return (
    <AppWorkspace scroll="workspace" fit="available" split="dynamic" labels={labels}>
      <AppWorkspace.Primary
        header={
          <WorkspaceHeader
            title={snapshot?.session.title ?? t('managedSession.title')}
            subtitle={headerSubtitle}
            status={isWaitingOnProvider ? <Spinner size="sm" /> : undefined}
            actions={headerActions}
          />
        }
      >
        <ManagedSessionConversation
          api={api}
          sessionId={sessionId}
          feed={feed}
          supportsSplit={supportsSplit}
          navigation={navigation}
          workStack={workStack}
          provider={provider}
          selectedModelId={selectedModelId}
          selectedEffort={selectedEffort}
        />
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
        <SessionContext
          sessionId={sessionId}
          value={sessionContext}
          onOpenSpecification={onOpenSpecification}
        />
      </AppWorkspace.Secondary>
    </AppWorkspace>
  );
}

import { useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Check, Copy, Plus, Send, Square, X } from 'lucide-react';
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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
  WorkspaceHeader,
  useRegisterPinnedSecondaryTab,
  useSecondaryNavigation,
  useWorkspaceCapabilities,
  useWorkspaceLayout,
  useWorkspacePrimaryScroll,
  useWorkspacePrimarySheet,
  cn,
  type WorkspaceHeaderAction,
} from '@nevo/ui';
import type { ConversationEntry, ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { createSessionFeed, type SessionFeed } from './feed';
import { ReadableText, type ReadableTextHandle } from './MessageText';
import { ModelEffortPicker } from './ModelEffortPicker';
import {
  createConversationScrollPosition,
  useConversationScroll,
  type ConversationScrollPosition,
} from './conversation/useConversationScroll';
import { ComposerModePicker } from './ComposerPresetPicker';
import { runtimeWorkModeCommand, runtimeWorkModes, selectedWorkModeId } from './workModes';
import { createWorkInspector } from './WorkInspector';
import { SessionContext, sessionContextStack } from './context/SessionContext';
import { SessionContextSourceProvider } from './context/sessionContextValue';
import { useDropNarrowContextOnSplit, useSessionSidePanel } from './context/useSessionSidePanel';
import { realRouteSessionContext } from './context/sessionContextTypes';
import { useSessionActions, type SessionActionHandlers } from './sessionActions/useSessionActions';
import { SessionNamingStatus } from './naming/SessionNamingStatus';
import { InteractionPrompt } from './InteractionPrompt';
import { SessionReadyEmptyState } from './empty/SessionReadyEmptyState';
import { PendingConversation } from '../start/handoff/PendingConversation';
import type { StartedSession } from '../start/handoff/startedSession';
import { useStartedSessionFallback } from '../start/handoff/useStartedSessionFallback';
import type {
  ContextFact,
  ContextSpecification,
  SessionContextViewModel,
  SessionExecutor,
} from './context/sessionContextTypes';

import { WorkBlock } from './WorkBlock';
import { conversationItems, liveActivity } from './workBlockModel';
import { useWorkspaceLabels } from '../../../app/navigation/useWorkspaceLabels';
import type { ManagedSessionsApi } from './api';

function browserStorage() {
  try {
    return typeof window === 'undefined' ? undefined : window.sessionStorage;
  } catch {
    return undefined;
  }
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
  onGrow,
}: {
  /** Never a `work-summary` entry: those are folded into a `WorkBlock` by `conversationItems`. */
  entry: ConversationEntry;
  api: ManagedSessionsApi;
  sessionId: string;
  outcomeLabels: Record<string, string>;
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
        {/* `bg-surface-primary` — a brand-derived token (`brandEnvironment.ts`'s own
            `surfacePrimary`, mixed 55% toward black) rather than the brand's full-saturation
            `--color-action-primary`, which reads as a loud button fill rather than a quiet "this
            one is mine" message surface. A neutral `bg-surface-subtle` would give the user's own
            messages no visual identity distinct from the rest of the conversation. */}
        <div className="max-w-content-standard rounded-composite bg-surface-primary px-4 py-3">
          <ReadableText
            ref={textRef}
            api={api}
            sessionId={sessionId}
            value={entry.text}
            onGrow={onGrow}
          />
        </div>
        {/* In normal flow, directly under the bubble. An `absolute` copy row reserved no space,
            so on touch screens (where it is always visible) it sat inside the list gap and touched
            the next message. The list gap is kept small instead (`gap-4`), so the copy row plus
            that gap reads as one clear break between messages. */}
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
        {/* In flow, same as the request bubble above. */}
        <div className="flex">
          <MessageCopyAction onCopy={handleCopy} />
        </div>
      </article>
    );
  }

  if (entry.kind === 'commentary') {
    // Plain muted prose, no icon, no container: a pulse icon does not fit commentary semantically,
    // and it reads fine as Markdown alone. `text-content-muted` (not `-secondary`) so it is
    // clearly quieter than the final answer below it without a box to lean on, while still
    // reading against the page background.
    return (
      <article data-entry-id={entry.id} className="grid min-w-0 gap-1 text-content-muted">
        {srLabel}
        <ReadableText api={api} sessionId={sessionId} value={entry.text} onGrow={onGrow} />
      </article>
    );
  }

  // 'outcome' (only for a Turn with no Work block — `conversationItems` folds it into the block
  // otherwise, so the fact appears once): no celebratory chrome on completion; a quiet semantic
  // marker on failure/cancel. No "view work" link here: by construction this branch only
  // ever renders for a Turn with zero `work-summary` entries, so that link would open an empty,
  // dead-end Work history panel every time.
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
  scrollPosition,
  navigation,
  workStack,
  provider,
  selectedModelId,
  selectedEffort,
  started,
}: {
  api: ManagedSessionsApi;
  sessionId: string;
  feed: SessionFeed;
  /** Where the reader is in the conversation; kept here, across remounts of this view. */
  scrollPosition: ConversationScrollPosition;
  navigation: ReturnType<typeof useSecondaryNavigation>;
  workStack: ReturnType<typeof createWorkInspector>;
  provider: ProviderDescriptor | undefined;
  selectedModelId: string | undefined;
  selectedEffort: string | undefined;
  /** What the Session was started with here, while there is no snapshot to read it from. */
  started: StartedSession | undefined;
}) {
  const { t } = useTranslation();
  const state = useSyncExternalStore(feed.subscribe, feed.getSnapshot, feed.getSnapshot);
  // The layout `AppWorkspace` actually resolved (`useWorkspaceLayout`), NOT the shell's
  // `supportsSplit` hint: with `split="dynamic"` a runtime Secondary splits from 730px while
  // `supportsSplit` switches at 840px, and reading the hint here left 730-839 with a split workspace
  // but a stacked-behaving conversation (no scroll owner, a `fixed` composer painting over the
  // Secondary). `localScroll` decides who owns scrolling and how the composer is positioned;
  // `isSplit` the density/Enter behaviour of the narrower stacked presentation.
  const { supportsSplit } = useWorkspaceCapabilities();
  const workspaceLayout = useWorkspaceLayout();
  const isSplit = workspaceLayout.mode === 'split';
  const localScroll = workspaceLayout.primaryScrollOwner === 'local';
  // Scroll ownership (secondary-navigation.md "Reaching Primary's
  // ambient scroll element, and the bottom safe area"): on the split/desktop layout `AppWorkspace`
  // gives Primary no scroll affordance of its own, so this component keeps owning a local scroll
  // container exactly as it always has (`localScrollNode`); on the stacked/mobile layout
  // (`scroll="workspace"`, migrated from `scroll="content"` in `ManagedSession` below) the real
  // scroll owner is `AppWorkspace`'s own page-level `ScrollArea` viewport, reached through
  // `useWorkspacePrimaryScroll()` — there is no local container to render there at all. `scroller`
  // is the one place both are unified into a single element every other effect below reads.
  const ambientScrollElement = useWorkspacePrimaryScroll();
  // The real material box (`.mobile-workspace-surface`) the fixed Composer's reserved space must
  // become part of — a different element from `ambientScrollElement`/`scroller` below (that one is
  // the outer scroll viewport). See `useWorkspacePrimarySheet`'s own doc comment. Only meaningful
  // on stacked/mobile, same as `ambientScrollElement`: split/desktop's `sticky` Composer already
  // reserves its own space in normal flow and needs no padding reservation anywhere.
  const ambientSheetElement = useWorkspacePrimarySheet();
  const [localScrollNode, setLocalScrollNode] = useState<HTMLDivElement | null>(null);
  const scroller = localScroll ? localScrollNode : ambientScrollElement;
  // The one owner of the scroll position (following the latest message vs reading above it, and
  // every `scrollTop` write): see `useConversationScroll`. The feed only receives its settled
  // "away" verdict, for the "Jump to latest" pill and for keeping the window the reader is reading;
  // no position decision reads that verdict back. It also observes the entries' own container, which
  // can grow without any commit here (a message's image loading late).
  const [entriesNode, setEntriesNode] = useState<HTMLDivElement | null>(null);
  const conversationScroll = useConversationScroll(scrollPosition, scroller, entriesNode, (away) =>
    feed.setAway(away),
  );
  const { layoutChanged } = conversationScroll;
  // The Composer must stay pinned to the viewport bottom at all times — ONLY the conversation
  // scrolls underneath it, never the Composer itself (`position: sticky` everywhere regresses into
  // "the Composer is just another block in the page flow, only visible once scrolled all the way
  // down" on the real composed route).
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
  // Every commit that changes what the conversation renders (entries, the live Turn, the
  // older-history spinner or its failure above the entries) re-applies the scroll position in that
  // same commit, before paint: following stays pinned to the bottom, reading keeps its entry.
  useLayoutEffect(() => {
    layoutChanged();
  }, [layoutChanged, state.snapshot, state.historyBusy, state.historyError]);
  // Scroll-triggered auto-loading of older history, instead of a manual "Load older messages"
  // button: `maybeLoadOlder` (declared below, a hoisted function declaration) is called both from
  // the scroll listener below (interactive scroll) and from this effect, which re-checks after
  // every entries/busy/error change — so a page that was just prepended and still leaves the
  // scroller at/near the top keeps loading until `history.hasOlder` is false, and a short
  // conversation that never overflows (so the user has no scrollbar to drive) still gets its older
  // history pulled in once mounted. Runs after the position effect above (same commit, later in
  // declaration order), so it reads the scroll position that effect just applied.
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
  // Native `scroll` listener, not a JSX `onScroll` prop: on mobile `scroller` is `AppWorkspace`'s
  // own ambient element, not one this component renders itself.
  useEffect(() => {
    const node = scroller;
    if (!node) {
      return undefined;
    }

    const handleScroll = () => maybeLoadOlder(node);
    node.addEventListener('scroll', handleScroll, { passive: true });

    return () => node.removeEventListener('scroll', handleScroll);
    // Same closure note as the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scroller, state.snapshot?.history.hasOlder, state.historyBusy, state.historyError]);
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
      // space in the scroll content's normal flow and needs no padding at all. Applied as real
      // padding on `ambientSheetElement` (the actual bordered/rounded material box,
      // `.mobile-workspace-surface` — see `useWorkspacePrimarySheet`'s own doc comment), not on
      // `scroller` (an ANCESTOR of that box — the outer scroll viewport): padding on the ancestor
      // only extends how far the viewport can scroll, it is not part of the sheet's own box and
      // does not inherit its background/border/rounding, which is exactly why the Composer used to
      // need a copied/color-matched background instead of genuinely sharing the one real surface
      // (the sheet's own `getBoundingClientRect().bottom` would otherwise stop short of the
      // true viewport bottom by exactly the Composer's height). The sheet is a
      // descendant of `scroller` with no hard pixel height anywhere in that chain (only
      // `min-height`), so growing the sheet's own box still grows `scroller.scrollHeight` by the
      // same amount — the scrollable-range reservation this previously relied on `scroller`'s own
      // padding for is unaffected, just now backed by the sheet's real layout size. Applied
      // imperatively, right here, instead of waiting for the `composerHeight` state write above to
      // reach render on some *later* commit, so the very first measurement after the overlay
      // mounts (and any later one where its height changes, e.g. the interaction card appearing)
      // reserves the new space before the scroll position is re-applied from `scrollHeight`.
      if (!localScroll && ambientSheetElement) {
        ambientSheetElement.style.paddingBottom = height ? `${height}px` : '';
      }

      if (!localScroll && scroller) {
        scroller.style.paddingBottom = '';
      }

      layoutChanged();
    };

    update();
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(update);
    observer.observe(node);

    return () => observer.disconnect();
  }, [ambientSheetElement, composerOverlayNode, layoutChanged, localScroll, scroller]);
  // An older page keeps the reader's place by itself: while reading, the position policy keeps the
  // entry being read where it is as the page lands above it.
  function older() {
    void feed.older();
  }

  // "Near the top": not literally scrollTop === 0, a threshold reached
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
  // The work-mode picker lists the provider's own `providerModes` (the Runtime is the source of
  // truth), usable ones only plus the Session's current mode. Shown: an explicit pick, else the
  // Session's current provider mode (what the next Turn inherits), else the catalogue default. A
  // pick — or a shown default that differs from what the Session would inherit — is sent as
  // `mode` + `providerModeId`.
  const currentModeId = snapshot?.session.providerModeId;
  const workModes = useMemo(
    () => runtimeWorkModes(provider, currentModeId),
    [provider, currentModeId],
  );
  const workModeId = selectedWorkModeId(
    workModes,
    [state.workModeOverride?.providerModeId, snapshot?.session.providerModeId],
    provider?.defaultModeId,
  );
  const workModeDefault =
    workModeId && workModeId !== snapshot?.session.providerModeId
      ? runtimeWorkModeCommand(provider, workModeId)
      : undefined;
  // Mirrors the Send button's own disabled condition so MessageComposer's Enter-to-submit path
  // (which bypasses the button's `disabled` attribute entirely) cannot start a Turn the capability
  // gate, an empty draft, or an in-flight command would otherwise block.
  const canSend =
    !!snapshot &&
    !state.commandBusy &&
    (!!state.pending || snapshot.session.capabilities.start) &&
    (!!state.pending || !!state.draft.trim());
  // The composer shows one adaptive Send/Stop action, not two simultaneous
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

    // Attachments stay in the composer: nothing transports them (session-composer-design.md §5
    // documents the upload contract as a known gap), so clearing the chips on Send would imply they
    // were delivered. They remain visible, with `managedSession.attach.note` under them, until the
    // user removes them.
    void feed.send(workModeDefault);
  };

  // A Work block opens its Turn's Work history. From the split width (`supportsSplit`, 840px) it
  // is the Turn's own root tab (`openTab` with the Turn as instance), the very tab Context's "Work
  // history" row opens for the same Turn. Below it the Session uses the mobile scheme whatever the
  // resolved layout is (a runtime Secondary already splits from 730px, but there are no root tabs
  // yet): one visible surface, Back follows the path, the single runtime flow Back closes (`open`),
  // so the same Turn opened twice is one flow, never two tabs (workspace-dynamic-split.md).
  const openWork = (turnId: string) => {
    const params = { sessionId, turnId };
    void (supportsSplit
      ? navigation.openTab(workStack, params)
      : navigation.open(workStack, params));
  };

  const outcomeLabels: Record<string, string> = {
    completed: t('managedSession.outcome.completed'),
    failed: t('managedSession.outcome.failed'),
    cancelled: t('managedSession.outcome.cancelled'),
    interrupted: t('managedSession.outcome.interrupted'),
  };

  // Composer toolbar's "+" entry (session-composer-design.md §6). Attachments are
  // local-only React state: §5 documents the real upload contract as a known gap, so nothing here
  // is actually sent anywhere — they stay in the composer after Send and the chips carry the
  // "local mock" note (`managedSession.attach.note`), so the UI never implies delivery.
  const [attachments, setAttachments] = useState<{ id: string; name: string; size: number }[]>([]);
  // Two hidden inputs, not one: "+" opens a menu offering "Add file"/"Add image"
  // rather than jumping straight to a native file/image picker — `accept="image/*"` on the image
  // input is itself part of that distinction (a generic file input would let through anything).
  const fileAttachmentInputRef = useRef<HTMLInputElement>(null);
  const imageAttachmentInputRef = useRef<HTMLInputElement>(null);
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
        <PendingConversation
          started={started}
          connection={state.connection}
          onRetry={() => feed.connect()}
        />
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
                <div
                  ref={setEntriesNode}
                  className={cn(
                    'mx-auto grid w-full max-w-content-standard gap-4 px-5 py-5',
                    // Empty: the ready empty state centres in the free height above the Composer.
                    !snapshot.entries.length && 'flex-1 grid-rows-[1fr]',
                  )}
                >
                  {/* Auto-loads on scroll near the top instead of a manual button
                          (`maybeLoadOlder`); this is just its busy indicator. */}
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
                    <SessionReadyEmptyState
                      providerId={snapshot.session.providerId}
                      providerTitle={provider?.title ?? snapshot.session.providerId}
                    />
                  )}
                  {conversationItems(snapshot.entries, {
                    activeTurn: snapshot.activeTurn,
                    currentActivity: snapshot.currentActivity,
                    hasOlder: snapshot.history.hasOlder,
                  }).map((item) =>
                    item.type === 'work' ? (
                      <WorkBlock
                        key={item.block.id}
                        block={item.block}
                        onInspect={() => openWork(item.block.turnId)}
                      />
                    ) : (
                      <EntryRow
                        key={item.entry.id}
                        entry={item.entry}
                        api={api}
                        sessionId={sessionId}
                        outcomeLabels={outcomeLabels}
                        onGrow={layoutChanged}
                      />
                    ),
                  )}
                </div>
                {/* "Jump to latest": a genuinely independent floating control — deliberately a
                    SIBLING of `composerOverlayNode` below, never a flow child inside it, so its
                    own appear/disappear never changes the composer's measured height (which
                    re-applies the scroll position). Positioned just above the composer: `sticky`
                    on split/desktop (bounded to this component's own local scroll container, like
                    the overlay) and `fixed` on stacked/mobile (anchored to the true viewport, like
                    the overlay), each offset by the overlay's live-measured `composerHeight` plus a
                    small gap. */}
                {(state.hasNew || state.away || state.detached) && (
                  <div
                    className={cn(
                      'z-20',
                      localScroll
                        ? 'sticky self-center'
                        : 'fixed inset-x-0 flex justify-center px-4',
                    )}
                    style={{
                      bottom: localScroll
                        ? `calc(var(--workspace-overlay-bottom, 0.75rem) + ${composerHeight}px + 0.5rem)`
                        : `calc(${composerHeight}px + 0.5rem)`,
                    }}
                  >
                    {/* `variant="secondary"`'s own background token (`--color-action-secondary`)
                        is deliberately translucent — it is meant for a control sitting on an
                        already-opaque surface, not one floating directly over scrolling content
                        (it must stay opaque like the other floating buttons). `workspace-floating-pill`
                        (`AppWorkspace.css`) overrides it to the same opaque material the mobile
                        floating-navigation row's own buttons use, and reliably wins the cascade
                        over the variant's Tailwind utility regardless of class order — see that
                        rule's own doc comment. `shadow-lg` is this screen's shared "subtle
                        floating surface" elevation (also applied to the Composer bar below, and
                        mirrored by value in the floating-navigation row's own shadow) — not the
                        heavier `shadow-xl` this used before, which read as too strong for a small
                        pill. */}
                    <Button
                      className="workspace-floating-pill shadow-lg"
                      variant="secondary"
                      onClick={() => {
                        conversationScroll.followLatest();
                        void feed.latest();
                      }}
                    >
                      {t('managedSession.latest')}
                    </Button>
                  </div>
                )}
                <div
                  ref={setComposerOverlayNode}
                  data-composer-overlay="true"
                  // Split/desktop: a normal flow child of the single local scroll container above
                  // (`position: sticky` reserves its own space there and needs no
                  // height cap — the container it is inside is already bounded by the workspace
                  // layout). Stacked/mobile: `position: fixed` instead (`sticky` must sit
                  // relative to the TRUE scrolling ancestor to stay pinned, and this screen's real
                  // composed route does not reliably provide one; `fixed` is
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
                  // Stacked/mobile only: `bottom: var(--workspace-overlay-bottom, …)` would float
                  // the *entire* overlay (including the zone its own background should fill) up
                  // off the true viewport/safe-area edge, the same treatment the top floating-nav
                  // pill intentionally uses; unlike that pill, the Composer is meant to read as a
                  // solid bar docked to the edge (mockup's own `.composerwrap`), not a floating
                  // card with transparent margin around it. It now pins to the real `bottom: 0`
                  // with no background of its own at all (deliberately — see the `useLayoutEffect`
                  // above that sets `ambientSheetElement.style.paddingBottom`): the one real
                  // material box (`.mobile-workspace-surface`) now extends its own box all the way
                  // to the true bottom, so the Composer sits transparently on top of that single
                  // real surface rather than painting a second, copied one of its own — the two
                  // would otherwise be color-matched separately (an illusion that a structural DOM
                  // check reveals as two boxes), so there genuinely is only one. Split/desktop keeps the
                  // unchanged floating-above-the-edge treatment: it is a `sticky` child of its own
                  // local scroll container, which already shares that container's opaque
                  // background, so there is no transparent zone for content to show through
                  // underneath it either way.
                  className={cn(
                    'z-10 flex flex-col items-center gap-2 px-4 pt-3 sm:px-5',
                    localScroll
                      ? 'sticky pb-4 sm:pb-5'
                      : 'scrollbar-subtle fixed inset-x-0 bottom-0 z-20 overflow-y-auto',
                  )}
                  style={
                    localScroll
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
                  {/* Narrower than the conversation on the split layout (spanning the full 1100px
                      reading column would look like a form field, not a chat input). The stacked layout keeps its own width. */}
                  <div
                    className={cn(
                      'grid w-full gap-3',
                      isSplit ? 'max-w-content-narrow' : 'max-w-content-standard',
                    )}
                  >
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
                                  kind: 'permission',
                                  decision: allow ? 'allow' : 'deny',
                                }
                              : {
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
                    {state.pendingUnreadable ? (
                      <Alert tone="attention" title={t('managedSession.savedRequestUnreadable')}>
                        <p>{t('managedSession.savedRequestUnreadableBody')}</p>
                        <Button size="sm" onClick={() => feed.discardPending()}>
                          {t('managedSession.discardSavedRequest')}
                        </Button>
                      </Alert>
                    ) : (
                      state.commandError && (
                        <Alert tone="attention" title={t('managedSession.commandFailed')} />
                      )
                    )}
                    {/* Attachments/previews sit above the message text (session-composer-
                            design.md §6 visual order), demo-only chips — see `handleComposerSubmit`
                            and `managedSession.attach.note`. */}
                    {attachments.length > 0 && (
                      <div className="grid gap-1.5">
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
                        <p role="note" className="text-body-sm text-content-muted">
                          {t('managedSession.attach.note')}
                        </p>
                      </div>
                    )}
                    {/* Visually hidden, not removed: the `<textarea>` still needs an accessible
                        name (the composer's own placeholder/icon already make its
                        purpose obvious to a sighted user, so a visible label is redundant
                        chrome). */}
                    <label htmlFor="managed-message" className="sr-only">
                      {t('managedSession.message')}
                    </label>
                    <MessageComposer
                      // `shadow-lg` (a subtle shadow for every floating/elevated surface on this
                      // screen, this bar included). Shares its literal value with
                      // the "jump to latest" pill's own `shadow-lg` below and with the mobile
                      // floating-navigation row's shadow (`AppWorkspace.css`), so all three read as
                      // one coherent elevation rather than three different weights.
                      //
                      // `workspace-floating-pill` (`AppWorkspace.css`), not the DS `standalone`
                      // variant's own default `bg-surface-raised` (a flat, solid `#121212`): this is
                      // the same lighter, translucent "floating surface" material the jump-to-latest pill
                      // and the mobile floating-navigation row already use, declared un-layered so
                      // it reliably wins over the component's own `@layer`-declared utility
                      // regardless of Tailwind's internal ordering (see that class's own doc
                      // comment). Keeps this bar visually consistent with this screen's other
                      // floating surfaces instead of reading as a separate, darker material.
                      className="shadow-lg workspace-floating-pill"
                      // Platform-specific Enter handling. Desktop
                      // keeps the DS default (`'submit'`): a physical keyboard reliably reports
                      // `shiftKey`, so Shift+Enter already inserts a newline there
                      // (`resolveMessageComposerKeyAction`) and plain Enter sends. A mobile virtual
                      // keyboard has no physical Shift key to combine with Enter at all, so under
                      // the default behavior its only "Enter" input was swallowed into Send —
                      // never a newline, with no way to invoke the `shiftKey` branch to begin with.
                      // `'newline'` makes every Enter (shifted or not) insert a newline instead,
                      // making Send explicit-button-only, which is what a touch composer needs.
                      // Reuses the resolved layout (`isSplit`) — already this component's one "is this the
                      // stacked/mobile layout" signal (the composer's own fixed-vs-sticky
                      // positioning above, and the compact Model/effort and composer-mode pickers
                      // below, all branch on it) — rather than a `pointer: coarse` media query:
                      // this codebase's only existing coarse-pointer checks
                      // (`treeRowActionClassName`, `ItemTabs`) are Tailwind `pointer-coarse:`/
                      // `pointer-fine:` CSS variants for hover-affordance visibility, never a
                      // JS-level behavioral branch, so introducing one here just for this prop
                      // would be a second, inconsistent "is this mobile" signal for the exact same
                      // composer this file already branches by the resolved layout throughout.
                      enterKeyBehavior={isSplit ? 'submit' : 'newline'}
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
                        {/* One row, never wrapped (at 375px a wrap would put Model above the
                            work mode). Both groups may shrink; the two text
                            pickers truncate instead. */}
                        <div className="flex min-w-0 items-center gap-1">
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
                              directly: the mockup's own "+" affordance is itself a menu trigger
                              (desktop.html's `c3-plus`/`data-cmp="attach"`), and a
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
                            options={workModes}
                            value={workModeId}
                            onChange={(modeId) =>
                              feed.setWorkMode(runtimeWorkModeCommand(provider, modeId))
                            }
                            disabled={state.commandBusy || !!state.pending}
                            compact={!isSplit}
                          />
                        </div>
                        {/* `shrink-0`: Model/effort keeps its full text (capped by its own
                            max-width); the work-mode picker on the left truncates first. */}
                        <div className="ml-auto flex shrink-0 items-center justify-end gap-2">
                          <ModelEffortPicker
                            provider={provider}
                            value={
                              selectedModelId
                                ? { modelId: selectedModelId, effort: selectedEffort }
                                : undefined
                            }
                            onChange={(modelId, effort) => feed.setModel(modelId, effort)}
                            disabled={state.commandBusy || !!state.pending}
                            compact={!isSplit}
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
                                  // "primary" at full saturation (the composer's disabled textarea
                                  // visibly mutes, so the Send icon button must too), so the disabled Send case falls back to the same muted
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

            return localScroll ? (
              <div
                ref={setLocalScrollNode}
                // A native scroller (the feed measures and pins it itself), styled like the DS
                // `ScrollArea` instead of the platform's default scrollbar.
                className="scrollbar-subtle flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain"
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
  sessionContext = realRouteSessionContext,
  onOpenSpecification,
  onOpenDocuments,
  onRenameSession,
  onArchiveSession,
  onDeleteSession,
  namingPending = false,
}: {
  sessionId: string;
  owner: string;
  /**
   * The agent is still naming a Session started without an own name (new-session-ui-spec.md): the
   * header shows the provisional title with a "Nadawanie nazwy…" status until the name arrives.
   */
  namingPending?: boolean;
  api: ManagedSessionsApi;
  /**
   * Context Secondary content (full-session-screen-structure.md §7). Optional because the real
   * managed-Sessions contract has no Specification/Task association projection yet: the default is
   * the honest "scope unknown, not provided" Context, which still shows what this screen derives
   * itself (executor, Work history). Callers with a real/mock projection (Storybook fixtures
   * today) pass it explicitly; an `executor`/`workHistory` fact it carries wins over the derived one.
   */
  sessionContext?: SessionContextViewModel;
  /**
   * Opens the Specification this session belongs to (`SessionContext`'s own Specification row —
   * see its doc comment). `ManagedSession` stays router-agnostic itself (mounted unrouted by its
   * own Storybook stories); the real route composition (`routes.tsx`'s `ManagedSessionRoute`) is
   * responsible for wiring this to the real `/specs/$specId` navigation. Omitted (or
   * `sessionContext.specification` absent): the row simply doesn't render, on either layout.
   */
  onOpenSpecification?: (specification: ContextSpecification) => void;
  /**
   * Opens that Specification's Documents with this Session as the way back (the route composition
   * wires it, like `onOpenSpecification`). Omitted: no Documents row.
   */
  onOpenDocuments?: (specification: ContextSpecification) => void;
} & SessionActionHandlers) {
  const { t } = useTranslation();
  // The shell hint "a non-stacking Secondary (the pinned Context tab, the side-panel toggle) can be
  // shown" — NOT the layout of the conversation, which `ManagedSessionConversation` reads from
  // `useWorkspaceLayout()` (workspace-dynamic-split.md "Resolved layout vs shell capability").
  const { supportsSplit } = useWorkspaceCapabilities();
  const [contextOpen, setContextOpen] = useState(true);
  // Registers Context as the pinned Secondary tab only on the split-capable (wide) layout where it
  // is the default declarative Secondary; every other root tab (a Task, a Turn's Work history, a
  // placeholder subject) opens beside it through `useSecondaryNavigation().openTab`, one tab per
  // object. `supportsSplit` gates it off on
  // the narrow/mobile layout, where Context is instead a runtime flow pushed via `navigation.open`
  // (SessionContext's `openStack` fallback) and must stay exactly as it behaves today — registering
  // the pinned tab there too would make that runtime flow's tab count reach 2 and spuriously show
  // the root-tab strip on narrow layouts.
  useRegisterPinnedSecondaryTab(
    supportsSplit && contextOpen ? { title: t('sessions.context.title') } : null,
  );
  // The conversation view is re-parented (and so remounted) when the layout switches between split
  // and stacked: the reader's position in it lives with the Session's feed, not with one mounted
  // view.
  const { feed, scrollPosition } = useMemo(
    () => ({
      feed: createSessionFeed(api, sessionId, owner, browserStorage()),
      scrollPosition: createConversationScrollPosition(),
    }),
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
  // The side panel shows when Context is registered or a runtime tab is visible; one press hides
  // all of it and the next restores what was active (`useSessionSidePanel`).
  const sidePanel = useSessionSidePanel(contextOpen, setContextOpen);
  const contextTitle = t('sessions.context.title');
  // A narrow Context flow does not survive into the split scheme next to the pinned Context tab.
  useDropNarrowContextOnSplit(contextTitle);

  const workStack = useMemo(() => createWorkInspector(api, feed, owner), [api, feed, owner]);
  const providers = useQuery({
    queryKey: ['managed-session-providers', owner],
    queryFn: ({ signal }) => api.providers(signal),
  });
  const snapshot = state.snapshot;
  // Started here and not loaded yet: the start values stand in for the snapshot's.
  const fallback = useStartedSessionFallback({
    owner,
    sessionId,
    hasSnapshot: !!snapshot,
    connection: state.connection,
  });
  const sessionProviderId = snapshot?.session.providerId ?? fallback.providerId;
  const provider = providers.data?.items.find((item) => item.providerId === sessionProviderId);
  const selectedModelId = state.modelOverride ?? snapshot?.session.modelId ?? fallback.modelId;
  const selectedEffort = state.modelOverride
    ? state.effortOverride
    : (snapshot?.session.effort ?? fallback.effort);
  // `runningTurnId` ("Bieżąca tura" vs "Ostatnia tura" in Context's context-window caption) is
  // live Session state, so it comes from this feed's own snapshot — the same `activeTurn` the
  // Conversation's live Work block reads — not from the supplied Context view model. Until the
  // first snapshot arrives the supplied value (if any) stands.
  const runningTurnId = snapshot ? snapshot.activeTurn?.turnId : sessionContext.runningTurnId;
  // Work history: the Turn in flight, else the newest Turn the feed knows (not the last loaded
  // entry: older history never lowers it); "loading"
  // before the first snapshot, absent when the Session has no Turn yet.
  const workHistoryTurnId = snapshot
    ? (snapshot.activeTurn?.turnId ?? state.latestTurnId)
    : undefined;
  // Context's first section: the provider (as the Runtime names it) and the model/effort the
  // composer has selected for the next Turn.
  const executorModelTitle = provider?.models.find(
    (model) => model.modelId === selectedModelId,
  )?.title;
  const providerId = sessionProviderId;
  const firstSnapshotFailed = !snapshot && !fallback.pending && state.connection === 'error';
  const executor = useMemo<ContextFact<SessionExecutor> | undefined>(() => {
    if (fallback.executor) {
      return fallback.executor;
    }

    if (provider) {
      return {
        status: 'ready',
        value: {
          providerId: provider.providerId,
          providerTitle: provider.title,
          modelTitle: executorModelTitle,
          effort: executorModelTitle ? selectedEffort : undefined,
        },
      };
    }

    if (providers.isError) {
      return { status: 'unreadable' };
    }

    if (!providerId) {
      // No snapshot ever arrived and nothing started here stands in for it: the provider cannot
      // become known, so waiting would be a skeleton forever.
      return firstSnapshotFailed ? { status: 'unreadable' } : { status: 'loading' };
    }

    if (providers.isPending) {
      return { status: 'loading' };
    }

    // The catalogue loaded but does not know the Session's provider.
    return { status: 'missing', ref: { key: providerId } };
  }, [
    provider,
    providers.isError,
    providers.isPending,
    providerId,
    firstSnapshotFailed,
    executorModelTitle,
    selectedEffort,
    fallback.executor,
  ]);
  const workHistory = useMemo<ContextFact<{ turnId: string }> | undefined>(
    () =>
      snapshot
        ? workHistoryTurnId
          ? { status: 'ready', value: { turnId: workHistoryTurnId } }
          : undefined
        : // A Session just started here has no Turn yet: nothing to wait for.
          fallback.pending
          ? undefined
          : firstSnapshotFailed
            ? { status: 'unreadable' }
            : { status: 'loading' },
    [snapshot, workHistoryTurnId, fallback.pending, firstSnapshotFailed],
  );
  const contextValue = useMemo<SessionContextViewModel>(
    () => ({
      ...sessionContext,
      runningTurnId,
      executor: sessionContext.executor ?? executor,
      workHistory: sessionContext.workHistory ?? workHistory,
    }),
    [sessionContext, runningTurnId, executor, workHistory],
  );

  // Folded into the real page header's own low-emphasis `status`/`subtitle` slots (a dedicated, bordered
  // status/provider row would read as a second header competing with this one for space,
  // especially on narrow widths) instead of a standalone row in the conversation
  // flow. Nothing it showed is dropped: the connection/activity text and the mock-provider safety
  // note both still render, just as the header's own muted subtitle; `role="status"` keeps the
  // same live-region announcement the old row's `<span role="status">` gave screen reader users.
  // When the active Turn's Work block already shows what is happening right now (with its own
  // spinner), the header keeps only the coarse Session state ("Praca trwa") — the detailed live fact
  // appears once, in the block, never twice.
  const liveInConversation =
    !!snapshot && !!liveActivity(snapshot.activeTurn, snapshot.currentActivity);
  const activityLabel = snapshot
    ? state.connection === 'connected'
      ? liveInConversation
        ? t(`managedSession.${snapshot.session.readiness}`)
        : (snapshot.currentActivity?.label ?? t(`managedSession.${snapshot.session.readiness}`))
      : t(`managedSession.${state.connection}`)
    : fallback.subtitle;
  const isWaitingOnProvider =
    !!snapshot &&
    state.connection === 'connected' &&
    !liveInConversation &&
    snapshot.currentActivity?.kind === 'waiting';
  // The raw provider id ("claude", "codex", …) is not shown on its own anymore (not meaningful to a user who already sees the active
  // model via the composer's own Model picker). Only the mock-provider safety caveat survives, since it carries
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
        onPress: () => void navigation.open(sessionContextStack, {}),
      }
    : {
        // Split layout: a persistent toggle that hides and shows the WHOLE side panel — Context
        // and every opened tab, not only Context.
        // With the tab rail shown the panel has no close of its own, so this is the one way to
        // hide it. Hiding keeps the tabs and their stacks (`navigation.close` retains them);
        // showing again restores Context and the tab that was active.
        id: 'context',
        label: t('managedSession.sidePanel'),
        // The standard side-panel glyph, not a document.
        icon: 'panel-right',
        presentation: 'icon',
        pressed: sidePanel.sidePanelOpen,
        direct: 'always',
        onPress: () => void sidePanel.toggle(),
      };
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
  // Rename/archive/delete live in the header's "…" menu (never direct, so the Context action keeps
  // the single narrow direct slot); their dialogs mount below.
  const sessionActions = useSessionActions({
    title: snapshot?.session.title,
    onRenameSession,
    onArchiveSession,
    onDeleteSession,
  });
  const headerActions = [
    contextAction,
    retryConnectionAction,
    ...(snapshot || fallback.startedHere ? sessionActions.actions : []),
  ].filter(Boolean) as WorkspaceHeaderAction[];

  return (
    <SessionContextSourceProvider
      sessionId={sessionId}
      value={contextValue}
      onOpenSpecification={onOpenSpecification}
      onOpenDocuments={onOpenDocuments}
      workStack={workStack}
    >
      <AppWorkspace scroll="workspace" fit="available" split="dynamic" labels={labels}>
        <AppWorkspace.Primary
          header={
            <WorkspaceHeader
              title={
                namingPending
                  ? t('sessionNaming.provisionalTitle')
                  : (sessionActions.title ?? fallback.title ?? t('managedSession.title'))
              }
              subtitle={headerSubtitle}
              status={
                isWaitingOnProvider ? (
                  <Spinner size="sm" />
                ) : namingPending ? (
                  <SessionNamingStatus />
                ) : undefined
              }
              actions={headerActions}
              labels={{ moreActions: t('common.moreActions') }}
            />
          }
        >
          <ManagedSessionConversation
            api={api}
            sessionId={sessionId}
            feed={feed}
            scrollPosition={scrollPosition}
            navigation={navigation}
            workStack={workStack}
            provider={provider}
            selectedModelId={selectedModelId}
            selectedEffort={selectedEffort}
            started={fallback.pending}
          />
          {sessionActions.dialogs}
        </AppWorkspace.Primary>
        {/* Context is the default split-capable Secondary (full-session-screen-structure.md §3.1,
          §3.4): open by default, stays closed once the user explicitly closes it, and is restored
          by the Primary "Context" action — on narrow layouts it opens the Context Secondary stack;
          on split-capable layouts it reappears whenever Context is closed, so there is always a
          way back in regardless of `supportsSplit` (§24.2). */}
        <AppWorkspace.Secondary
          open={contextOpen}
          onOpenChange={setContextOpen}
          header={<WorkspaceHeader title={t('sessions.context.title')} headingLevel={2} />}
        >
          <SessionContext
            sessionId={sessionId}
            value={contextValue}
            onOpenSpecification={onOpenSpecification}
            onOpenDocuments={onOpenDocuments}
            workStack={workStack}
          />
        </AppWorkspace.Secondary>
      </AppWorkspace>
    </SessionContextSourceProvider>
  );
}

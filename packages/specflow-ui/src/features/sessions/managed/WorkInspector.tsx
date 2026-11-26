import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ToolActionSummary, WorkCounts, WorkSummary } from '@nevo/specflow-contracts/sessions';
import {
  Alert,
  AppContent,
  Button,
  EmptyState,
  Icon,
  IconButton,
  InputGroup,
  Menu,
  MenuContent,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
  ScrollArea,
  Spinner,
  StatusIndicator,
  TextInput,
  Timeline,
  Typography,
  cn,
  defineSecondaryStack,
  useSecondaryDetailHeaderHosted,
  useSecondaryStack,
  WorkspaceHeaderIdentity,
} from '@nevo/ui';
import { translateNow } from '../../../i18n/message';
import type { ManagedSessionsApi } from './api';
import type { SessionFeed } from './feed';
import { ReadableText } from './MessageText';
import { OlderHistoryButton } from './OlderHistoryButton';
import { historyEntry, historyList } from './pagedHistoryAnchor';
import { useGroupKeys } from './stableGroupKeys';
import { availablePaged, usePagedHistory } from './usePagedHistory';
import {
  absorbPage,
  absorbWorkPage,
  createViewStoreRegistry,
  initialPagedState,
  initialWorkViewState,
  newestCounts,
  toggleExpanded,
  useViewState,
  workPageCounts,
  type ActionsViewState,
  type ViewStore,
  type WorkFilterState,
  type WorkViewState,
} from './workInspectorStore';
import {
  buildWorkChapters,
  filterWorkChapters,
  groupChapterEntries,
  mergeToolActions,
  mergeWorkItems,
  availableWorkFilterKinds,
  foldPermissions,
  type ChapterEntry,
  type WorkChapter,
  type WorkFilterKind,
  type WorkHistoryView,
} from './workGrouping';
import { useWorkHistoryView } from './workHistoryViewPreference';
import { AuthorizationSection } from './AuthorizationSection';
import { WorkOperationsTimeline, chapterEntryMembers } from './WorkOperationsTimeline';
import { workTabLabel } from './workTabLabel';
import {
  SingleToolActionDetail,
  SingleToolActionHeader,
  ToolActionTimelineItem,
  WrapLinesToggle,
} from './ToolActionDetails';

type OpenActions = (workId: string, title: string, heading: string, permissionId?: string) => void;

interface Root {
  sessionId: string;
  turnId: string;
}
type Data = Root & {
  api: ManagedSessionsApi;
  feed: SessionFeed;
  owner: string;
  /** The view state of an object, kept across Secondary tab switches (`workInspectorStore.ts`). */
  workView: (turnId: string) => ViewStore<WorkViewState>;
  actionsView: (workId: string) => ViewStore<ActionsViewState>;
  /** Compact (default) or every operation: the person's remembered choice (`useWorkHistoryView`). */
  view: WorkHistoryView;
  setView: (view: WorkHistoryView) => void;
};
interface Pages {
  work: Record<string, never>;
  /** `permissionId`: the permission Work folded into this tool Work (`foldPermissions`). */
  /** `heading`: the concrete action ("Ran command"), the screen's title; `workTitle` adds its subject. */
  actions: { workId: string; workTitle: string; heading: string; permissionId?: string };
}
function useWorkRefresh(feed: SessionFeed, turnId: string, refresh: () => Promise<unknown>) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = feed.subscribeWork((changed) => {
      if (changed !== turnId || timer) {
        return;
      }

      timer = setTimeout(() => {
        timer = undefined;
        void refresh();
      }, 300);
    });

    return () => {
      unsubscribe();
      clearTimeout(timer);
    };
  }, [feed, turnId, refresh]);
}

/** The type filter is a compact icon-only `IconButton` opening the same `Menu`/`MenuRadioGroup`
 * selection surface as before — never a `SegmentedControl` (its five options do not fit the
 * Secondary panel's real minimum width, `WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH` 330px) and
 * never a `Button` showing the current selection as a visible text label either (it reads weak
 * next to the V10 mockup's own pill-filter row, which is also not used for this screen). The trigger shows only the `filter` glyph — the same one
 * already used for this exact affordance elsewhere (`Icon`'s curated `filter` entry) — plus a small
 * decorative `StatusIndicator` dot (the DS's existing "something is active" pattern; `IconButton`
 * itself has no built-in badge/indicator slot) when the active filter is not "Wszystkie"/all. The
 * dot is `aria-hidden`: the accessible name carries the active kind instead, via the button's own
 * `aria-label`, so the state is never conveyed by colour alone. */
function WorkFilterBar({
  filter,
  kinds,
  onChange,
}: {
  filter: WorkFilterState;
  /** Only kinds present in this Turn (`availableWorkFilterKinds`) — never a dead-end option. */
  kinds: readonly WorkFilterKind[];
  onChange: (next: WorkFilterState) => void;
}) {
  const { t } = useTranslation();
  const isFiltered = filter.kind !== 'all';
  const triggerLabel =
    filter.kind === 'all'
      ? t('managedSession.workInspector.filterLabel')
      : t('managedSession.workInspector.filterActive', {
          kind: t(`managedSession.workKind.${filter.kind}`),
        });

  return (
    <div className="flex min-w-0 items-center gap-2">
      <Menu>
        <span className="relative inline-flex shrink-0">
          <MenuTrigger asChild>
            <IconButton aria-label={triggerLabel} icon="filter" size="md" variant="secondary" />
          </MenuTrigger>
          {isFiltered && (
            <StatusIndicator
              tone="info"
              size="sm"
              className="pointer-events-none absolute -right-0.5 -top-0.5 ring-2 ring-surface-default"
            />
          )}
        </span>
        <MenuContent align="start" aria-label={t('managedSession.workInspector.filterLabel')}>
          <MenuRadioGroup
            value={filter.kind}
            onValueChange={(value) => onChange({ ...filter, kind: value as WorkFilterKind })}
          >
            {kinds.map((kind) => (
              <MenuRadioItem key={kind} value={kind}>
                {kind === 'all'
                  ? t('managedSession.workInspector.filterAll')
                  : t(`managedSession.workKind.${kind}`)}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuContent>
      </Menu>
      <InputGroup className="min-w-0 flex-1">
        <InputGroup.Addon>
          <Icon name="search" size="sm" />
        </InputGroup.Addon>
        <TextInput
          type="search"
          className="[&::-webkit-search-cancel-button]:appearance-none"
          aria-label={t('managedSession.workInspector.search')}
          placeholder={t('managedSession.workInspector.search')}
          value={filter.search}
          onChange={(event) => onChange({ ...filter, search: event.target.value })}
        />
        {filter.search && (
          <InputGroup.Action>
            <IconButton
              aria-label={t('common.clearSearch')}
              icon="close"
              size="xs"
              onClick={() => onChange({ ...filter, search: '' })}
            />
          </InputGroup.Action>
        )}
      </InputGroup>
    </div>
  );
}

/** Narration long enough that showing it in full would push its following operations well
 * below the fold is the only case that earns a "Show more" truncation. `!complete` is the authoritative signal — the real transport
 * cap on the initial preview (see `ReadableText`'s own doc comment) means there is strictly more
 * text the user has not seen yet — and the character count is a plain visual fallback for a
 * `complete` preview that is nonetheless several paragraphs long. Ordinary narration (a sentence
 * or two, the common case in every fixture here) stays well under this and never shows the
 * control at all. */
const NARRATION_LONG_TEXT_CHARS = 280;

function isNarrationLong(item: WorkSummary): boolean {
  return !item.title.complete || item.title.text.length > NARRATION_LONG_TEXT_CHARS;
}

/** The narrating voice of a block: the agent's running Commentary, or its Thinking. */
type NarrationVoice = 'commentary' | 'reasoning';

/** Commentary AND Thinking (Reasoning) are the agent's own narration, read directly in the flow —
 * never gated behind a click, never a row on the operations rail. They are two different kinds of
 * Work (full-session.md "Work history (L2)") with one block and two voices:
 *
 * - a **progress note** (Commentary) heads the operations after it, so it is styled and announced
 *   as a heading (h2, the reading size in medium weight and the primary colour; owner, 2026-11-26);
 * - **Thinking** stays quiet prose: muted and italic.
 *
 * Assistive tech also gets the kind's own name (`sr-only`). No icon, no marker dot, no chevron,
 * no card. The text is plain prose (pre-wrapped, no Markdown), as in the chat.
 *
 * Long narration is the exception (`isNarrationLong`): genuinely long narration gets a plain "Show more"/
 * "Show less" ghost `Button` (the same label-only disclosure pattern `TaskDetailDisclosure.tsx`
 * already uses elsewhere in this app for "reveal more text", not a new chevron-led control
 * invented for this row) instead of being dumped in full — expanding it mounts `ReadableText`
 * (which itself auto-fetches and stitches any remaining pages beyond the capped preview). */
function WorkNarration({
  item,
  voice,
  data,
}: {
  item: WorkSummary;
  voice: NarrationVoice;
  data: Data;
}) {
  const { t } = useTranslation();
  const view = data.workView(data.turnId);
  const isExpanded = useViewState(view).expanded.has(item.workId);
  const isLong = isNarrationLong(item);

  return (
    <div
      {...historyEntry(item.workId)}
      className={cn(
        'grid min-w-0 gap-1',
        voice === 'reasoning' ? 'text-content-muted italic' : 'font-medium text-content-primary',
      )}
    >
      <span className="sr-only">
        {voice === 'reasoning'
          ? t('managedSession.workInspector.thinking')
          : t('managedSession.workKind.commentary')}
      </span>
      {isExpanded ? (
        <ReadableText api={data.api} sessionId={data.sessionId} value={item.title} />
      ) : (
        <Typography
          // A progress note heads the operations after it (h2: the panel's title is the h1).
          as={voice === 'commentary' ? 'h2' : 'p'}
          variant="body-md"
          className={cn(
            'min-w-0 whitespace-pre-wrap [overflow-wrap:anywhere]',
            isLong && 'line-clamp-4',
          )}
        >
          {item.title.text}
        </Typography>
      )}
      {isLong && (
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 h-auto w-fit justify-start px-2 not-italic"
          onClick={() => view.update((state) => toggleExpanded(state, item.workId))}
        >
          {isExpanded
            ? t('managedSession.workInspector.showLess')
            : t('managedSession.workInspector.showMore')}
        </Button>
      )}
    </div>
  );
}

type ChapterSegment =
  { type: 'operations'; entries: ChapterEntry[] } | { type: 'reasoning'; item: WorkSummary };

/** Splits a chapter's grouped entries, in chronological order, into operation runs (one rail each)
 * and the Thinking narration between them — Thinking is narration, not a rail row
 * (`WorkNarration`). */
function chapterSegments(entries: readonly ChapterEntry[]): ChapterSegment[] {
  const segments: ChapterSegment[] = [];
  for (const entry of entries) {
    if (entry.type !== 'burst' && entry.item.kind === 'reasoning') {
      segments.push({ type: 'reasoning', item: entry.item });
      continue;
    }

    const last = segments.at(-1);
    if (last?.type === 'operations') {
      last.entries.push(entry);
    } else {
      segments.push({ type: 'operations', entries: [entry] });
    }
  }

  return segments;
}

const segmentMembers = (segment: ChapterSegment) =>
  segment.type === 'reasoning'
    ? [segment.item.workId]
    : segment.entries.flatMap(chapterEntryMembers);

/** A chapter's members: its heading Commentary and every item under it. */
const chapterMembers = (chapter: WorkChapter) => [
  ...(chapter.commentary ? [chapter.commentary.workId] : []),
  ...chapter.items.map((item) => item.workId),
];

/** One Commentary-headed phase: `<comment> <timeline> [<thinking> <timeline>] …` — the rail resets
 * at every narration boundary and never spans across one; narration (Commentary, Thinking) is
 * rendered between rails, never as part of a rail itself (see
 * full-session.md "Work history (L2)") and never gated behind a disclosure either (see
 * `WorkNarration`). The leading "Start of Turn" chapter uses a neutral label instead of a
 * Commentary heading — there is no prose to show there. While older history is not loaded, a
 * leading chapter without Commentary is only cut off from its Commentary on an older page, so it
 * gets no label at all (`turnStartLoaded`). */
function WorkChapterSection({
  chapter,
  turnStartLoaded,
  data,
  authorizations,
  onOpenActions,
}: {
  chapter: WorkChapter;
  /** Permissions folded into the tool Work they were for, by the tool Work's id. */
  authorizations: ReadonlyMap<string, WorkSummary>;
  /** The oldest page is loaded: a chapter without Commentary is really the start of the Turn. */
  turnStartLoaded: boolean;
  data: Data;
  onOpenActions: OpenActions;
}) {
  const { t } = useTranslation();
  const segments = useMemo(
    () => chapterSegments(groupChapterEntries(chapter.items, data.view, authorizations)),
    [chapter.items, data.view, authorizations],
  );
  // A run between narration keeps its identity while an older page joins it (`useGroupKeys`).
  const keys = useGroupKeys(segments.map(segmentMembers));

  // No divider line between chapters (a chapter's Commentary does not always own
  // everything below a drawn line, so a line overstates that boundary; layout-and-containment's
  // borderless-first rule applies).
  //
  // One even rhythm: the chapter list's `gap-5` (space before a Commentary) and this section's
  // `gap-5` (space after it) both match the ~20px between operation rows, so narration sits in the
  // chronology like any other line rather than being pulled toward what follows it (spacing above
  // and below Commentary must be equal; a Commentary does not own the operations after it).
  return (
    <section className="grid min-w-0 gap-5">
      {chapter.commentary && chapter.commentaryRole === 'match' ? (
        <WorkNarration item={chapter.commentary} voice="commentary" data={data} />
      ) : !chapter.commentary && turnStartLoaded ? (
        // h2, not h3: the panel's own title is the only heading above it (h1), so h3 skipped a
        // level (axe heading-order) whenever Work history opened inside the composed screen.
        <Typography as="h2" variant="label-sm" className="text-content-secondary">
          {t('managedSession.workInspector.startOfTurn')}
        </Typography>
      ) : null}
      {segments.map((segment, index) =>
        segment.type === 'reasoning' ? (
          <WorkNarration key={keys[index]} item={segment.item} voice="reasoning" data={data} />
        ) : (
          <WorkOperationsTimeline
            key={keys[index]}
            entries={segment.entries}
            view={data.workView(data.turnId)}
            authorizations={authorizations}
            onOpenActions={onOpenActions}
          />
        ),
      )}
    </section>
  );
}

/** The Work summary above the list (full-session.md "Work history (L2)"): rendered only when the
 * Runtime's `WorkPage.counts` aggregate is present — hidden entirely otherwise, never computed from
 * `items.length` (which is only ever a bounded page, not the Turn's true total). The operations
 * lead: how many tool actions the Turn ran (and how many still run), then, as quieter metadata,
 * the other kinds of Work. No sum across kinds: "71 work items" counted notes, thinking and
 * questions as if they were work done. `interaction` counts the questions and permission requests
 * that reached the person (an automatic approval is not one: the Runtime records it as a note). */
function WorkCountsSummary({ counts }: { counts: WorkCounts }) {
  const { t } = useTranslation();
  const headline = [
    t('managedSession.workInspector.toolBurst', { count: counts.byKind.tool }),
    counts.inProgress > 0 &&
      t('managedSession.workInspector.counts.inProgress', { count: counts.inProgress }),
  ].filter((label): label is string => typeof label === 'string');
  // A kind with zero items is left out ("0 thinking steps" is noise, not information).
  const metadata = [
    counts.byKind.commentary > 0 &&
      t('managedSession.workInspector.counts.commentary', { count: counts.byKind.commentary }),
    counts.byKind.reasoning > 0 &&
      t('managedSession.workInspector.counts.reasoning', { count: counts.byKind.reasoning }),
    counts.byKind.interaction > 0 &&
      t('managedSession.workInspector.counts.interaction', { count: counts.byKind.interaction }),
  ].filter((label): label is string => typeof label === 'string');

  return (
    <div className="grid gap-0.5" data-work-counts="">
      <Typography as="p" variant="title-sm" className="text-content-primary">
        {headline.join(' · ')}
      </Typography>
      {metadata.length > 0 && (
        <Typography as="p" variant="body-sm" className="text-content-muted">
          {metadata.join(' · ')}
        </Typography>
      )}
    </div>
  );
}

/** What the tail query's state allows the Work/Actions screens to show. Content the view already
 * holds (a tail from the cache, or older pages in the persistent store) stays usable through a
 * pending or failed tail query — only a never-loaded object shows the full loading or error state
 * (data-loading-and-integration.md "Refresh with usable data"). */
function useLoadGate(
  query: { isPending: boolean; isError: boolean; data: unknown },
  hasStored: boolean,
) {
  const usable = hasStored || query.data !== undefined;

  return {
    showContent: usable || (!query.isPending && !query.isError),
    loading: !usable && query.isPending,
    failed: !usable && query.isError,
    /** The refresh failed but earlier data is on screen: it may be out of date. */
    refreshFailed: usable && query.isError,
  };
}

function LoadGateNotices({
  gate,
  retry,
}: {
  gate: ReturnType<typeof useLoadGate>;
  retry: () => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      {gate.loading && <p role="status">{t('managedSession.loading')}</p>}
      {gate.failed && (
        <Alert tone="attention" title={t('managedSession.failed')}>
          <Button onClick={retry}>{t('common.retry')}</Button>
        </Alert>
      )}
      {gate.refreshFailed && (
        <Alert tone="attention" title={t('managedSession.workInspector.refreshFailed')}>
          <Button size="sm" onClick={retry}>
            {t('common.retry')}
          </Button>
        </Alert>
      )}
    </>
  );
}

function Work({ data }: { data: Data }) {
  const { t } = useTranslation();
  const navigation = useSecondaryStack<Pages>();
  // The view (loaded older pages and cursor, filter, search, counts, expanded narration) is
  // product state of this Turn's tab, kept outside the screen: an inactive tab unmounts, and this
  // is what it comes back to (workInspectorStore.ts).
  const view = data.workView(data.turnId);

  // Always fetches the current tail window (no `before`): older pages are loaded progressively
  // (see `usePagedHistory`), never fetched eagerly — this stays a bounded `WorkPage` request even
  // for a Turn with hundreds of historical Work items. Items that later slide out of the tail
  // window are kept by the view, so a refresh never opens a hole behind the tail.
  const query = useQuery({
    queryKey: ['managed-work', data.owner, data.sessionId, data.turnId],
    queryFn: async ({ signal }) => {
      const page = await data.api.work(data.sessionId, data.turnId, undefined, signal);
      view.update((state) => absorbWorkPage(state, page, 'tail'));

      return page;
    },
  });
  useWorkRefresh(data.feed, data.turnId, query.refetch);

  const {
    state,
    items,
    hasOlder,
    scroller,
    content,
    loadOlder,
    maybeLoadOlder,
    stalled,
    loadMore,
  } = usePagedHistory({
    store: view,
    merge: mergeWorkItems,
    tail: query.data,
    fetchOlder: (before) => data.api.work(data.sessionId, data.turnId, before),
    absorbOlder: (current, page) => absorbWorkPage(current, page, 'older'),
    resetKey: (value) => value.filter,
  });
  const { filter } = state;
  const searching = filter.kind !== 'all' || filter.search.trim() !== '';
  const olderButton = stalled && !state.busy && !state.error && (
    <OlderHistoryButton searching={searching} onClick={loadMore} />
  );
  // Runtime's Turn-wide `WorkPage.counts` aggregate (docs/reference/api/sessions.md "Work
  // aggregate counts"), omitted for Turns that predate it: the newest by `eventSeq`
  // among the tail and every page loaded — never derived from `items`, so the summary row is
  // hidden entirely when the field is absent instead of faked from `items.length`
  // (full-session.md "Work block").
  const counts = newestCounts(state.counts, query.data && workPageCounts(query.data))?.value;
  const olderBusy = state.busy;
  const olderError = state.error;
  const loadGate = useLoadGate(query, state.items.length > 0);
  const setFilter = (next: WorkFilterState) => view.update((value) => ({ ...value, filter: next }));

  // A permission and the tool Work it was for are one operation, in both views; a kind filter or a
  // search sees every Work as it is (a filter on interactions still finds each permission).
  const folded = useMemo(
    () =>
      filter.kind === 'all' && !filter.search.trim()
        ? foldPermissions(items)
        : { items, authorizations: new Map<string, WorkSummary>() },
    [items, filter],
  );
  const chapters = useMemo(() => buildWorkChapters(folded.items), [folded.items]);
  const visibleChapters = useMemo(() => filterWorkChapters(chapters, filter), [chapters, filter]);
  // The leading chapter of the loaded part ("Start of Turn" until an older page brings its
  // Commentary) keeps its identity as older pages join it.
  const chapterKeys = useGroupKeys(visibleChapters.map(chapterMembers));
  const filterKinds = useMemo(
    () => availableWorkFilterKinds(items, counts?.byKind),
    [items, counts],
  );
  const openActions: OpenActions = (workId, workTitle, heading, permissionId) =>
    void navigation.navTo('actions', {
      workId,
      workTitle,
      heading,
      ...(permissionId ? { permissionId } : {}),
    });

  return (
    <AppContent className="h-full w-full">
      {/* `contentClassName`'s `flex min-h-full flex-col` gives the scrolled content a definite,
          full-height column so `EmptyState`'s own `variant="pane"` (`flex-1 min-h-full ...
          justify-center`) has remaining space (below the filter bar) to fill and self-centre
          within. The real Work log is NOT centred (an `m-auto` wrapper would leave a large blank gap between the
          filter bar and a short log, so the log would read as floating mid-panel, as in
          `SessionContext`).
          A list starts directly under its filter bar and simply scrolls once it overflows. */}
      <ScrollArea
        viewportRef={scroller}
        className="min-h-0 w-full flex-1"
        contentClassName="flex min-h-full flex-col p-4"
        onScroll={(event) => maybeLoadOlder(event.currentTarget)}
      >
        <div ref={content} className="flex w-full flex-1 flex-col gap-4">
          <LoadGateNotices gate={loadGate} retry={() => void query.refetch()} />
          {loadGate.showContent && (
            <>
              {counts && <WorkCountsSummary counts={counts} />}
              <WorkFilterBar filter={filter} kinds={filterKinds} onChange={setFilter} />
              {/* Auto-loads on scroll near the top instead of a manual button
                  (`useAutoLoadOlder`); this is just its busy indicator. */}
              {olderBusy && (
                <p role="status" className="flex items-center justify-center gap-2 py-1">
                  <Spinner size="sm" />
                  <span className="text-body-sm text-content-muted">
                    {t('managedSession.workInspector.loadingOlder')}
                  </span>
                </p>
              )}
              {olderError && (
                <Alert tone="attention" title={t('managedSession.failed')}>
                  <Button size="sm" onClick={() => void loadOlder()}>
                    {t('common.retry')}
                  </Button>
                </Alert>
              )}
              {olderButton && visibleChapters.length > 0 && olderButton}
              {items.length === 0 ? (
                <EmptyState variant="pane" title={t('managedSession.workInspector.emptyTurn')} />
              ) : visibleChapters.length === 0 ? (
                // Older history may still hold a match: only once none remains is "no matches" true.
                <EmptyState
                  variant="pane"
                  title={t(
                    hasOlder
                      ? 'managedSession.workInspector.noMatchesLoaded'
                      : 'managedSession.workInspector.noMatches',
                  )}
                  actions={olderButton}
                />
              ) : (
                <div {...historyList} className="grid w-full gap-5">
                  {visibleChapters.map((chapter, index) => (
                    <WorkChapterSection
                      key={chapterKeys[index]}
                      chapter={chapter}
                      turnStartLoaded={!hasOlder}
                      data={data}
                      authorizations={folded.authorizations}
                      onOpenActions={openActions}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </AppContent>
  );
}

type ActionsParams = Pages['actions'];

/** The Work's ToolActions, one page (the tail window); shared by the `actions` screen and its declared
 * header. Items that later leave the window are kept by the view store. */
function useActionsQuery(data: Data, params: ActionsParams) {
  return useQuery({
    queryKey: ['managed-actions', data.owner, data.sessionId, params.workId],
    queryFn: async ({ signal }) => {
      const page = await data.api.actions(data.sessionId, params.workId, undefined, signal);
      data
        .actionsView(params.workId)
        .update((state) => absorbPage(state, mergeToolActions, page, 'tail'));

      return page;
    },
  });
}

/** What the opened Work acted on: its title without the action's own name in front. */
function workSubject(params: ActionsParams): string | undefined {
  const prefix = `${params.heading} · `;

  return params.workTitle.startsWith(prefix) ? params.workTitle.slice(prefix.length) : undefined;
}

/** The common case — one ToolAction, with no older page behind it — is shown as a single detail. */
function isSingleAction(count: number, hasOlder: boolean) {
  return count === 1 && !hasOlder;
}

/**
 * The `actions` screen's `detailHeader`, shown by a split Secondary beside Back in the
 * non-scrolling detail header row: the single ToolAction's own title and status, else (several
 * actions) the Work they belong to. Nothing until the actions are loaded. Elsewhere (stacked,
 * breadcrumbs) the screen shows the same identity at the top of its own content.
 */
function ActionsHeader({ data, params }: { data: Data; params: ActionsParams }) {
  const query = useActionsQuery(data, params);
  const stored = useViewState(data.actionsView(params.workId));
  // The same available data as the screen below: the stored pages stay when the tail is gone.
  const { items, hasOlder } = availablePaged(stored, query.data, mergeToolActions);

  if (items.length === 0) {
    return null;
  }

  // The screen's one Wrap lines, for every code block below, at the end of its header row.
  return (
    <div className="flex min-w-0 items-start justify-between gap-2">
      <div className="min-w-0">
        {isSingleAction(items.length, hasOlder) ? (
          <SingleToolActionHeader item={items[0]!} />
        ) : (
          <Typography as="h2" variant="title-sm" className="text-content-primary">
            {params.workTitle}
          </Typography>
        )}
      </div>
      <WrapLinesToggle />
    </div>
  );
}

function Actions({ data, params }: { data: Data; params: ActionsParams }) {
  const { t } = useTranslation();
  const headerHosted = useSecondaryDetailHeaderHosted();
  const view = data.actionsView(params.workId);
  const query = useActionsQuery(data, params);
  useWorkRefresh(data.feed, data.turnId, query.refetch);

  const {
    state,
    items,
    hasOlder,
    scroller,
    content,
    loadOlder,
    maybeLoadOlder,
    stalled,
    loadMore,
  } = usePagedHistory({
    store: view,
    merge: mergeToolActions,
    tail: query.data,
    fetchOlder: (before) => data.api.actions(data.sessionId, params.workId, before),
    absorbOlder: (current, page) => absorbPage(current, mergeToolActions, page, 'older'),
  });
  const olderBusy = state.busy;
  const olderError = state.error;
  const loadGate = useLoadGate(query, state.items.length > 0);
  const single = isSingleAction(items.length, hasOlder);
  // The permission folded into this tool Work in the Work list, read from the Turn view it came from.
  const turnItems = useViewState(data.workView(data.turnId)).items;
  const permission = params.permissionId
    ? turnItems.find((item) => item.workId === params.permissionId)
    : undefined;
  const authorization = <AuthorizationSection permission={permission} />;

  return (
    <AppContent className="h-full w-full">
      {/* Same treatment as `Work` above: only `EmptyState` fills and self-centres via its own
          `flex-1`; the real Actions Timeline starts at the top of the panel (no `m-auto` vertical
          centring — see `Work`'s comment for why). */}
      <ScrollArea
        viewportRef={scroller}
        className="min-h-0 w-full flex-1"
        // `pt-5` under the detail header row: the 20px section rhythm between it and the first section.
        contentClassName={cn('flex min-h-full flex-col px-4 pb-4', headerHosted ? 'pt-5' : 'pt-4')}
        onScroll={(event) => maybeLoadOlder(event.currentTarget)}
      >
        <div ref={content} className="flex w-full flex-1 flex-col gap-4">
          {/* Where no header row hosts the detail header, the screen's own header names the action
              ("Wrote file and 2 more"); the content then says only what it acted on (several
              actions), never the action's name a second time, with the screen's one Wrap lines. */}
          {!headerHosted && loadGate.showContent && items.length > 0 && (
            <div className="flex min-w-0 items-start justify-between gap-2">
              {!single && workSubject(params) ? (
                <Typography
                  as="p"
                  variant="body-sm"
                  className="min-w-0 pt-1.5 font-mono text-content-secondary [overflow-wrap:anywhere]"
                >
                  {workSubject(params)}
                </Typography>
              ) : (
                <span />
              )}
              <WrapLinesToggle />
            </div>
          )}
          <LoadGateNotices gate={loadGate} retry={() => void query.refetch()} />
          {loadGate.showContent && (
            <>
              {/* Auto-loads on scroll near the top instead of a manual button
                  (`useAutoLoadOlder`); this is just its busy indicator. */}
              {olderBusy && (
                <p role="status" className="flex items-center justify-center gap-2 py-1">
                  <Spinner size="sm" />
                  <span className="text-body-sm text-content-muted">
                    {t('managedSession.workInspector.loadingOlder')}
                  </span>
                </p>
              )}
              {olderError && (
                <Alert tone="attention" title={t('managedSession.failed')}>
                  <Button size="sm" onClick={() => void loadOlder()}>
                    {t('common.retry')}
                  </Button>
                </Alert>
              )}
              {stalled && !olderBusy && !olderError && (
                <OlderHistoryButton searching={false} onClick={loadMore} />
              )}
              {items.length === 0 ? (
                <EmptyState variant="pane" title={t('managedSession.workInspector.noActions')} />
              ) : single ? (
                // The common case — one ToolAction. No Timeline/marker rail: with nothing else on
                // the rail to align against, that reserved column was pure indent (see
                // `SingleToolActionDetail`'s own doc comment). Flush at the same edge as
                // `params.workTitle` above.
                <SingleToolActionDetail
                  item={items[0]!}
                  source={data}
                  withHeader={!headerHosted}
                  authorization={authorization}
                />
              ) : (
                // L3/L4 exact chronology: the generic Timeline is the right default here, unlike
                // the Commentary-grouped L2 Work log above (full-session.md "Work history (L2)").
                // Several ToolActions genuinely need the marker rail — see
                // `ToolActionTimelineItem`'s own doc comment.
                <>
                  {authorization}
                  <div {...historyList} className="w-full">
                    <Timeline
                      size="md"
                      aria-label={t('managedSession.actions', { count: items.length })}
                    >
                      {items.map((item) => (
                        <ToolActionTimelineItem key={item.actionId} item={item} source={data} />
                      ))}
                    </Timeline>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </AppContent>
  );
}

/**
 * The Work history root tab: one tab per Turn (full-session.md "Work history (L2)"). The tab's
 * identity is the Turn (`instanceId`), so a Work block in the conversation and Context's "Work
 * history" row, both calling `openTab` with the same `turnId`, land on the SAME tab, while another
 * Turn opens or activates its own. The label names the Turn (`workTabLabel`).
 */
export function createWorkInspector(api: ManagedSessionsApi, feed: SessionFeed, owner: string) {
  // One view per Turn / per Work, for as long as this inspector lives (workInspectorStore.ts).
  const workView = createViewStoreRegistry(initialWorkViewState);
  const actionsView = createViewStoreRegistry(initialPagedState<ToolActionSummary>);

  return defineSecondaryStack<Root, Data, Pages>({
    id: 'managed-session-work',
    initial: 'work',
    instanceId: (params) => params.turnId,
    tabLabel: (params) => workTabLabel(feed.getSnapshot().snapshot?.entries ?? [], params.turnId),
    useData: (params) => {
      // Called as a hook by the workspace's screen host, so the remembered view re-renders the
      // screen and its header action alike.
      const [view, setView] = useWorkHistoryView();

      return {
        status: 'ready',
        data: { ...params, api, feed, owner, workView, actionsView, view, setView },
      };
    },
    screens: {
      work: {
        get title() {
          return translateNow('managedSession.work');
        },
        // The one way to every operation (full-session.md "Work history (L2)"): a pressed icon
        // toggle with its words as tooltip and name in the header, a checked row of the "…" menu
        // where the stacked header keeps every action there (the DS header's own rules).
        actions: ({ data }) => [
          {
            id: 'work-history-detailed',
            label: translateNow('managedSession.workInspector.detailedView'),
            icon: 'list',
            presentation: 'icon',
            // Icon with its words on a wide header, the icon alone on a narrow (phone) one.
            labelWhenWide: true,
            direct: 'always',
            pressed: data.view === 'detailed',
            checked: data.view === 'detailed',
            onPress: () => data.setView(data.view === 'detailed' ? 'compact' : 'detailed'),
          },
        ],
        component: Work,
      },
      actions: {
        get title() {
          return translateNow('managedSession.actions');
        },
        // The header names the concrete action ("Ran command", "Read file and 2 more"), never the
        // page type; a split Secondary shows it in the detail header row instead (`ActionsHeader`).
        header: ({ params }) => <WorkspaceHeaderIdentity headingLevel={2} title={params.heading} />,
        // The breadcrumb names the opened Work ("Read file admission.mjs"), not the page type;
        // the tab itself keeps its root's name ("Historia pracy").
        breadcrumbLabel: (params) => params.workTitle,
        detailHeader: ActionsHeader,
        component: Actions,
      },
    },
  });
}

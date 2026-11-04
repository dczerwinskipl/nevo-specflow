import { useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ToolActionSummary, WorkSummary } from '@nevo/specflow-contracts/sessions';
import {
  Alert,
  AppContent,
  Button,
  Collapsible,
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
} from '@nevo/ui';
import { translateNow } from '../../../i18n/message';
import type { ManagedSessionsApi } from './api';
import type { SessionFeed } from './feed';
import { ReadableText } from './MessageText';
import { usePagedHistory } from './usePagedHistory';
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
  type ChapterEntry,
  type ToolBurstEntry,
  type WorkChapter,
  type WorkFilterKind,
} from './workGrouping';
import type { WorkCounts } from './workCounts';
import { workStateTone } from './workStatus';
import { WorkRowContent, useWorkRowMeta } from './WorkRow';
import { workTabLabel } from './workTabLabel';
import {
  SingleToolActionDetail,
  SingleToolActionHeader,
  ToolActionTimelineItem,
} from './ToolActionDetails';

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
};
interface Pages {
  work: Record<string, never>;
  actions: { workId: string; workTitle: string };
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
 * Secondary panel's real minimum width, `WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH` 330px) and, per
 * live owner review, never a `Button` showing the current selection as a visible text label
 * either (found "ugly/weak" next to the V10 mockup's own pill-filter row, which the owner also
 * rejected for this screen). The trigger shows only the `filter` glyph — the same one already
 * used for this exact affordance elsewhere (`Icon`'s curated `filter` entry) — plus a small
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
              aria-label={t('managedSession.workInspector.clearSearch')}
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

/** A Work row's title on the Timeline rail (`WorkRowContent`). The Timeline is `size="md"`: its
 * title slot is a block that wraps (long tool titles take two lines instead of being cut), and the
 * row carries its own meta line and navigation chevron — owner brief "Work Item jako wiersz
 * nawigacyjny". */
function InteractionTimelineItem({ item }: { item: WorkSummary }) {
  const { t } = useTranslation();
  const kind = t('managedSession.workKind.interaction');
  // The interaction's own title (e.g. "Permission to write workspace") — previously every
  // interaction showed only the generic kind name, losing what was actually asked — with its kind
  // leading the meta line under it.
  const { meta, srStatus } = useWorkRowMeta(item, { leading: item.title.text ? kind : undefined });

  return (
    <Timeline.Item>
      <Timeline.Marker active={item.state === 'active'} tone={workStateTone(item.state)} />
      <Timeline.Content
        title={
          <WorkRowContent
            title={
              <>
                {item.title.text || kind}
                {srStatus}
              </>
            }
            meta={meta}
          />
        }
      />
    </Timeline.Item>
  );
}

/** A tool operation as its own `Timeline.Item`. When the Work has ToolActions, the whole row opens
 * that exact Work's ToolAction details (ToolAction stays the tool's own child, never a top-level
 * row) — one row-sized button with a trailing navigation chevron, never a link-styled title or a
 * separate "Działania narzędzia" text button. Without ToolActions there is nothing to open, so no
 * chevron and no button. State is carried by `useWorkRowMeta` (visible words for anything but a
 * plain completion), never only by the marker's colour — `Timeline.Marker` is `aria-hidden`. */
function ToolTimelineItem({
  item,
  onOpenActions,
}: {
  item: WorkSummary;
  onOpenActions: (workId: string, title: string) => void;
}) {
  const { meta, srStatus } = useWorkRowMeta(item, { actionCount: item.actionCount });

  return (
    <Timeline.Item>
      <Timeline.Marker active={item.state === 'active'} tone={workStateTone(item.state)} />
      <Timeline.Content
        title={
          <WorkRowContent
            bleed="rail"
            title={
              <>
                {item.title.text}
                {srStatus}
              </>
            }
            meta={meta}
            onOpen={
              item.actionCount ? () => onOpenActions(item.workId, item.title.text) : undefined
            }
          />
        }
      />
    </Timeline.Item>
  );
}

/** A member of an expanded tool group: exactly the same row (`WorkRowContent`) as a top-level
 * operation, minus its own marker — a group is one marker on the rail ("jedna oś, jedna
 * hierarchia"); its members are that item's details, not a second mini-Timeline. Only completed
 * tools are ever grouped (`groupChapterEntries`), so the state word never shows here. */
function GroupedToolRow({
  item,
  onOpenActions,
}: {
  item: WorkSummary;
  onOpenActions: (workId: string, title: string) => void;
}) {
  const { meta, srStatus } = useWorkRowMeta(item, { actionCount: item.actionCount });

  return (
    <WorkRowContent
      title={
        <Typography as="span" variant="body-md" className="text-content-primary">
          {item.title.text}
          {srStatus}
        </Typography>
      }
      meta={meta}
      onOpen={item.actionCount ? () => onOpenActions(item.workId, item.title.text) : undefined}
    />
  );
}

/** A long (`workGrouping.ts`'s `TOOL_BURST_MIN_SIZE`+) run of adjacent happy-path tool items,
 * compacted into exactly one `Timeline.Item`/marker on the chronology rail, collapsed by default.
 * Its disclosure trigger sits IN the title slot (`Collapsible density="inline"`), so the label
 * shares the marker's line; the disclosure chevron is LEADING (DS: a chevron at the leading edge
 * means expand/collapse) while every member row's navigation chevron is TRAILING, so the two never
 * read as the same control. A shorter run never reaches this component: `groupChapterEntries`
 * leaves it as individual rows. */
function ToolBurstTimelineItem({
  burst,
  onOpenActions,
}: {
  burst: ToolBurstEntry;
  onOpenActions: (workId: string, title: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <Timeline.Item>
      <Timeline.Marker tone="success" />
      <Collapsible density="inline">
        <Timeline.Content
          title={
            // Touch target: expand the block axis only, never the visual row — same pattern
            // `ContextNavigationRow` already uses (owner review, round four: this trigger measured
            // 20×140px, below the DS touch-target rule every other clickable row in this pass
            // follows).
            <Collapsible.Trigger className="relative after:absolute after:inset-x-0 after:top-1/2 after:h-[max(100%,var(--target-size))] after:-translate-y-1/2 after:content-['']">
              {t('managedSession.workInspector.toolBurst', { count: burst.items.length })}
            </Collapsible.Trigger>
          }
        >
          <Collapsible.Content>
            <ul className="grid gap-3 pt-1">
              {burst.items.map((item) => (
                <li key={item.workId} className="min-w-0">
                  <GroupedToolRow item={item} onOpenActions={onOpenActions} />
                </li>
              ))}
            </ul>
          </Collapsible.Content>
        </Timeline.Content>
      </Collapsible>
    </Timeline.Item>
  );
}

function WorkChapterEntryRow({
  entry,
  onOpenActions,
}: {
  entry: ChapterEntry;
  onOpenActions: (workId: string, title: string) => void;
}) {
  if (entry.type === 'burst') {
    return <ToolBurstTimelineItem burst={entry} onOpenActions={onOpenActions} />;
  }

  const { item } = entry;
  if (item.kind === 'interaction') {
    return <InteractionTimelineItem item={item} />;
  }

  return <ToolTimelineItem item={item} onOpenActions={onOpenActions} />;
}

/** Narration long enough that showing it in full would push its following operations well
 * below the fold is the only case that earns a "Show more" truncation (live owner review,
 * second/structural pass, rule 1). `!complete` is the authoritative signal — the real transport
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
 * never gated behind a click, never a row on the operations rail (live owner review:
 * "Commentary jest elementem narracji, a nie nagłówkiem zwijanej grupy operacji"; and for
 * Thinking, "Commentary i thinking by mogło wyglądać tak samo, tylko np. thinking dostawać
 * kursywę"). Both use exactly this one block — same size, colour, spacing and long-text handling —
 * and the ONLY visual difference is the voice: Thinking is italic, Commentary upright. They are
 * still two different kinds of Work (session-chat-v10-design.md §4): the italic voice tells them
 * apart at a glance, and assistive tech gets the kind's own name (`sr-only`), since italics are not
 * announced. No icon, no marker dot, no chevron, no card.
 *
 * Same text rendering as the chat's own Commentary row (`ManagedSession.tsx`'s `commentary`
 * branch): plain prose (`body-md`, pre-wrapped, no Markdown), `text-content-muted` — so the same
 * Commentary reads identically at both levels.
 *
 * The one exception is `isNarrationLong`: genuinely long narration gets a plain "Show more"/
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
    <div className={cn('grid min-w-0 gap-1 text-content-muted', voice === 'reasoning' && 'italic')}>
      <span className="sr-only">
        {voice === 'reasoning'
          ? t('managedSession.workInspector.thinking')
          : t('managedSession.workKind.commentary')}
      </span>
      {isExpanded ? (
        <ReadableText api={data.api} sessionId={data.sessionId} value={item.title} />
      ) : (
        <Typography
          as="p"
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

/** A run of operations as one flat `Timeline` (`size="md"`: wrapping titles and a meta line under
 * each — owner: "itemy mogły być dwuwierszowe, czas pod spodem"), always rendered directly
 * — never behind a chapter-level "N operations" disclosure gate (live owner review, second/
 * structural pass, rule 2: a short run of 1-4 operations is just shown, not wrapped in a synthetic
 * summary container; `workGrouping.groupChapterEntries` already handles the one remaining case
 * that DOES still compact, a long adjacent happy-path run, into a single burst `Timeline.Item` —
 * see `ToolBurstTimelineItem`). */
function WorkOperationsTimeline({
  entries,
  onOpenActions,
}: {
  entries: readonly ChapterEntry[];
  onOpenActions: (workId: string, title: string) => void;
}) {
  const { t } = useTranslation();
  const count = entries.reduce(
    (sum, entry) => sum + (entry.type === 'burst' ? entry.items.length : 1),
    0,
  );

  // Accessible name only — never rendered as visible text next to Commentary, which would read as
  // "this Commentary owns N operations" (live owner review, second/structural pass: don't claim a
  // stronger ownership/causality than the chronological data supports).
  return (
    <Timeline aria-label={t('managedSession.workInspector.operationsCount', { count })} size="md">
      {entries.map((entry) => (
        <WorkChapterEntryRow
          key={chapterEntryKey(entry)}
          entry={entry}
          onOpenActions={onOpenActions}
        />
      ))}
    </Timeline>
  );
}

function chapterEntryKey(entry: ChapterEntry): string {
  return entry.type === 'burst' ? entry.items[0]!.workId : entry.item.workId;
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

/** One Commentary-headed phase: `<comment> <timeline> [<thinking> <timeline>] …` — the rail resets
 * at every narration boundary and never spans across one; narration (Commentary, Thinking) is
 * rendered between rails, never as part of a rail itself (owner decision, see
 * session-work-inspector-ui-spec.md §2) and never gated behind a disclosure either (see
 * `WorkNarration`). The leading "Start of Turn" chapter uses a neutral label instead of a
 * Commentary heading — there is no prose to show there. */
function WorkChapterSection({
  chapter,
  data,
  onOpenActions,
}: {
  chapter: WorkChapter;
  data: Data;
  onOpenActions: (workId: string, title: string) => void;
}) {
  const { t } = useTranslation();
  const segments = useMemo(
    () => chapterSegments(groupChapterEntries(chapter.items)),
    [chapter.items],
  );

  // No divider line between chapters (owner review, round two: "nie wiem czy potrzebujemy
  // separatory poziome dla sekcji pracy ... ja bym wolał po prostu [Commentary z paddingiem]
  // [Timeline] [Commentary2 z paddingiem] [Timeline2]" — a chapter's Commentary does not always
  // own everything below a drawn line, so a line overstates that boundary; layout-and-containment's
  // borderless-first rule applies one step further than the previous pass already took it).
  //
  // One even rhythm: the chapter list's `gap-5` (space before a Commentary) and this section's
  // `gap-5` (space after it) both match the ~20px between operation rows, so narration sits in the
  // chronology like any other line rather than being pulled toward what follows it (owner: spacing
  // above and below Commentary must be equal; a Commentary does not own the operations after it).
  return (
    <section className="grid min-w-0 gap-5">
      {chapter.commentary && chapter.commentaryRole === 'match' ? (
        <WorkNarration item={chapter.commentary} voice="commentary" data={data} />
      ) : !chapter.commentary ? (
        // h2, not h3: the panel's own title is the only heading above it (h1), so h3 skipped a
        // level (axe heading-order) whenever Work history opened inside the composed screen.
        <Typography as="h2" variant="label-sm" className="text-content-secondary">
          {t('managedSession.workInspector.startOfTurn')}
        </Typography>
      ) : null}
      {segments.map((segment) =>
        segment.type === 'reasoning' ? (
          <WorkNarration
            key={segment.item.workId}
            item={segment.item}
            voice="reasoning"
            data={data}
          />
        ) : (
          <WorkOperationsTimeline
            key={chapterEntryKey(segment.entries[0]!)}
            entries={segment.entries}
            onOpenActions={onOpenActions}
          />
        ),
      )}
    </section>
  );
}

/** The persistent Work summary row (session-chat-v10-design.md §3, mockup's "144 elementy
 * przebiegu · 1 w toku" / "48 odczytów · 24 zapisy · …" counts row): rendered only when the
 * proposed `counts` projection is present — hidden entirely otherwise, never computed from
 * `items.length` (which is only ever a bounded page, not the Turn's true total). `byKind` uses
 * only the real canonical Work kinds; there is no server-provided reads/writes/commands/search
 * sub-kind to break tool counts down further (workGrouping.ts's own header comment). */
function WorkCountsSummary({ counts }: { counts: WorkCounts }) {
  const { t } = useTranslation();
  // A kind with zero items is left out ("0 analiz · 0 odpowiedzi" is noise, not information).
  const byKindLabels = [
    counts.byKind.tool > 0 &&
      t('managedSession.workInspector.toolBurst', { count: counts.byKind.tool }),
    counts.byKind.commentary > 0 &&
      t('managedSession.workInspector.counts.commentary', { count: counts.byKind.commentary }),
    counts.byKind.reasoning > 0 &&
      t('managedSession.workInspector.counts.reasoning', { count: counts.byKind.reasoning }),
    counts.byKind.interaction > 0 &&
      t('managedSession.workInspector.counts.interaction', { count: counts.byKind.interaction }),
  ].filter((label): label is string => typeof label === 'string');
  // Plain text, never a badge (owner brief §5): an ordinary statistic, quieter than the operation
  // titles below it (`body-md` secondary vs. `label-md` primary), and "w toku" is the same
  // `workState.active` word the rows themselves use — not a second status vocabulary. It counts
  // Work in this Turn only; it says nothing about the Session as a whole.
  const headline = [
    t('managedSession.workInspector.counts.total', { count: counts.total }),
    counts.inProgress > 0 &&
      t('managedSession.workInspector.counts.inProgress', { count: counts.inProgress }),
  ].filter((label): label is string => typeof label === 'string');

  return (
    <div className="grid gap-0.5">
      <Typography as="p" variant="body-md" className="text-content-secondary">
        {headline.join(' · ')}
      </Typography>
      {byKindLabels.length > 0 && (
        <Typography as="p" variant="body-sm" className="text-content-muted">
          {byKindLabels.join(' · ')}
        </Typography>
      )}
    </div>
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

  const { state, items, scroller, loadOlder, maybeLoadOlder } = usePagedHistory({
    store: view,
    merge: mergeWorkItems,
    tail: query.data,
    fetchOlder: (before) => data.api.work(data.sessionId, data.turnId, before),
    absorbOlder: (current, page) => absorbWorkPage(current, page, 'older'),
  });
  const { filter } = state;
  // The proposed, not-yet-backend-implemented `WorkPage.counts` aggregate (workCounts.ts,
  // docs/reference/api/sessions.md "Proposed Work aggregate counts"): the newest by `eventSeq`
  // among the tail and every page loaded — never derived from `items`, so the summary row is
  // hidden entirely when the field is absent instead of faked from `items.length`
  // (session-chat-v10-design.md §3).
  const counts = newestCounts(state.counts, query.data && workPageCounts(query.data))?.value;
  const olderBusy = state.busy;
  const olderError = state.error;
  const setFilter = (next: WorkFilterState) => view.update((value) => ({ ...value, filter: next }));

  const chapters = useMemo(() => buildWorkChapters(items), [items]);
  const visibleChapters = useMemo(() => filterWorkChapters(chapters, filter), [chapters, filter]);
  const filterKinds = useMemo(
    () => availableWorkFilterKinds(items, counts?.byKind),
    [items, counts],
  );
  const openActions = (workId: string, workTitle: string) =>
    void navigation.navTo('actions', { workId, workTitle });

  return (
    <AppContent className="h-full w-full">
      {/* `contentClassName`'s `flex min-h-full flex-col` gives the scrolled content a definite,
          full-height column so `EmptyState`'s own `variant="pane"` (`flex-1 min-h-full ...
          justify-center`) has remaining space (below the filter bar) to fill and self-centre
          within. The real Work log is NOT centred (confirmed desktop live-review bug: a previous
          `m-auto` wrapper here left a large blank gap between the filter bar and a short log, so
          the log read as floating mid-panel — the same defect already fixed in `SessionContext`).
          A list starts directly under its filter bar and simply scrolls once it overflows. */}
      <ScrollArea
        viewportRef={scroller}
        className="min-h-0 w-full flex-1"
        contentClassName="flex min-h-full flex-col p-4"
        onScroll={(event) => maybeLoadOlder(event.currentTarget)}
      >
        <div className="flex w-full flex-1 flex-col gap-4">
          {query.isPending && <p role="status">{t('managedSession.loading')}</p>}
          {query.isError && (
            <Alert tone="attention" title={t('managedSession.failed')}>
              <Button onClick={() => void query.refetch()}>{t('common.retry')}</Button>
            </Alert>
          )}
          {!query.isPending && !query.isError && (
            <>
              {counts && <WorkCountsSummary counts={counts} />}
              <WorkFilterBar filter={filter} kinds={filterKinds} onChange={setFilter} />
              {/* Auto-loads on scroll near the top instead of a manual button (live-review fix
                  #3, `useAutoLoadOlder`); this is just its busy indicator. */}
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
              {items.length === 0 ? (
                <EmptyState variant="pane" title={t('managedSession.workInspector.emptyTurn')} />
              ) : visibleChapters.length === 0 ? (
                <EmptyState variant="pane" title={t('managedSession.workInspector.noMatches')} />
              ) : (
                <div className="grid w-full gap-5">
                  {visibleChapters.map((chapter) => (
                    <WorkChapterSection
                      key={chapter.id}
                      chapter={chapter}
                      data={data}
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
  const { data: page } = useActionsQuery(data, params);
  if (!page) {
    return null;
  }

  if (isSingleAction(page.items.length, page.history.hasOlder)) {
    return <SingleToolActionHeader item={page.items[0]!} />;
  }

  return page.items.length > 0 ? (
    <Typography as="h2" variant="title-sm" className="text-content-primary">
      {params.workTitle}
    </Typography>
  ) : null;
}

function Actions({ data, params }: { data: Data; params: ActionsParams }) {
  const { t } = useTranslation();
  const headerHosted = useSecondaryDetailHeaderHosted();
  const view = data.actionsView(params.workId);
  const query = useActionsQuery(data, params);
  useWorkRefresh(data.feed, data.turnId, query.refetch);

  const { state, items, scroller, loadOlder, maybeLoadOlder } = usePagedHistory({
    store: view,
    merge: mergeToolActions,
    tail: query.data,
    fetchOlder: (before) => data.api.actions(data.sessionId, params.workId, before),
    absorbOlder: (current, page) => absorbPage(current, mergeToolActions, page, 'older'),
  });
  const olderBusy = state.busy;
  const olderError = state.error;
  const hasOlder = (state.cursor ?? query.data?.history)?.hasOlder ?? false;
  const single = isSingleAction(items.length, hasOlder);

  return (
    <AppContent className="h-full w-full">
      {/* Same treatment as `Work` above: only `EmptyState` fills and self-centres via its own
          `flex-1`; the real Actions Timeline starts at the top of the panel (no `m-auto` vertical
          centring — see `Work`'s comment for the confirmed live-review bug it caused). */}
      <ScrollArea
        viewportRef={scroller}
        className="min-h-0 w-full flex-1"
        // `pt-5` under the detail header row: the 20px section rhythm between it and the first section.
        contentClassName={cn('flex min-h-full flex-col px-4 pb-4', headerHosted ? 'pt-5' : 'pt-4')}
        onScroll={(event) => maybeLoadOlder(event.currentTarget)}
      >
        <div className="flex w-full flex-1 flex-col gap-4">
          {/* Which Work these actions belong to — only when there are several. A single action's
              own title is the heading (`SingleToolActionDetail`), and repeating the Work title
              above it showed the same name twice (owner: "mamy podwójny nagłówek"). Where the
              workspace hosts the `detailHeader` (`ActionsHeader`) beside Back, it shows either. */}
          {!headerHosted && !query.isPending && !single && items.length > 0 && (
            <Typography as="h2" variant="title-sm" className="text-content-primary">
              {params.workTitle}
            </Typography>
          )}
          {query.isPending && <p role="status">{t('managedSession.loading')}</p>}
          {query.isError && (
            <Alert tone="attention" title={t('managedSession.failed')}>
              <Button onClick={() => void query.refetch()}>{t('common.retry')}</Button>
            </Alert>
          )}
          {!query.isPending && !query.isError && (
            <>
              {/* Auto-loads on scroll near the top instead of a manual button (live-review fix
                  #3, `useAutoLoadOlder`); this is just its busy indicator. */}
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
              {items.length === 0 ? (
                <EmptyState variant="pane" title={t('managedSession.workInspector.noActions')} />
              ) : single ? (
                // The common case — one ToolAction. No Timeline/marker rail: with nothing else on
                // the rail to align against, that reserved column was pure indent (see
                // `SingleToolActionDetail`'s own doc comment). Flush at the same edge as
                // `params.workTitle` above.
                <SingleToolActionDetail item={items[0]!} source={data} withHeader={!headerHosted} />
              ) : (
                // L3/L4 exact chronology: the generic Timeline is the right default here, unlike
                // the Commentary-grouped L2 Work log above (session-work-inspector-ui-spec.md §2).
                // Several ToolActions genuinely need the marker rail — see
                // `ToolActionTimelineItem`'s own doc comment.
                <div className="w-full">
                  <Timeline
                    size="md"
                    aria-label={t('managedSession.actions', { count: items.length })}
                  >
                    {items.map((item) => (
                      <ToolActionTimelineItem key={item.actionId} item={item} source={data} />
                    ))}
                  </Timeline>
                </div>
              )}
            </>
          )}
        </div>
      </ScrollArea>
    </AppContent>
  );
}

/**
 * The Work history root tab: one tab per Turn (full-session-screen-structure.md §8.3). The tab's
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
    useData: (params) => ({
      status: 'ready',
      data: { ...params, api, feed, owner, workView, actionsView },
    }),
    screens: {
      work: {
        get title() {
          return translateNow('managedSession.work');
        },
        component: Work,
      },
      actions: {
        get title() {
          return translateNow('managedSession.actions');
        },
        // The breadcrumb names the opened Work ("Read file admission.mjs"), not the page type;
        // the tab itself keeps its root's name ("Historia pracy").
        breadcrumbLabel: (params) => params.workTitle,
        detailHeader: ActionsHeader,
        component: Actions,
      },
    },
  });
}

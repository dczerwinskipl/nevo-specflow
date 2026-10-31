import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { ToolActionSummary, WorkSummary } from '@nevo/specflow-contracts/sessions';
import {
  Alert,
  AppContent,
  Badge,
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
  useSecondaryStack,
} from '@nevo/ui';
import { translateNow } from '../../../i18n/message';
import type { ManagedSessionsApi } from './api';
import type { SessionFeed } from './feed';
import { ReadableText } from './MessageText';
import {
  buildWorkChapters,
  filterWorkChapters,
  formatWorkDuration,
  groupChapterEntries,
  mergeToolActions,
  mergeWorkItems,
  workFilterKinds,
  workItemDurationMs,
  type ChapterEntry,
  type ToolBurstEntry,
  type WorkChapter,
  type WorkFilterKind,
} from './workGrouping';
import type { WorkCounts } from './workCounts';

interface Root {
  sessionId: string;
  turnId: string;
}
type Data = Root & {
  api: ManagedSessionsApi;
  feed: SessionFeed;
  owner: string;
};
interface Pages {
  work: Record<string, never>;
  actions: { workId: string };
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

type SemanticTone = 'neutral' | 'info' | 'success' | 'attention' | 'danger';

/** Shared Work/ToolAction state vocabulary -> semantic tone (sessions.md `WorkStateSchema`). */
function stateTone(state: WorkSummary['state']): SemanticTone {
  switch (state) {
    case 'active':
      return 'info';
    case 'completed':
      return 'success';
    case 'failed':
      return 'danger';
    case 'cancelled':
    case 'interrupted':
      return 'attention';
    case 'queued':
    case 'waiting':
    case 'expired':
    default:
      return 'neutral';
  }
}

interface WorkFilterState {
  kind: WorkFilterKind;
  search: string;
}

// "Near the top" per the same owner feedback (#5) `ManagedSession.tsx`'s conversation scroller
// already applies: not literally `scrollTop === 0`, a threshold reached shortly before it so the
// next page is ready before the user hits the physical edge.
const NEAR_TOP_PX = 200;

/** Scroll-triggered auto-loading of older Work/ToolAction pages, replacing the old manual
 * "Load older" button (session-work-inspector-ui-spec.md, live-review fix #3) with the same
 * mechanism `ManagedSession.tsx`'s own conversation scroller uses for older messages:
 * `maybeLoadOlder` is called both from the scroller's own `onScroll` handler (interactive scroll)
 * and from a `useLayoutEffect` that re-checks after every items/busy/error change, so a page that
 * was just prepended and still leaves the scroller near the top keeps loading until
 * `history.hasOlder` is false, and a short Work/Actions list that never overflows (no scrollbar to
 * drive) still pages in its older history once mounted. Stops entirely on `error` — the caller
 * keeps a manual Retry action instead of looping a failing request. */
function useAutoLoadOlder({
  scroller,
  hasOlder,
  busy,
  error,
  loadOlder,
  itemsVersion,
}: {
  scroller: { current: HTMLDivElement | null };
  hasOlder: boolean;
  busy: boolean;
  error: boolean;
  loadOlder: () => void | Promise<void>;
  itemsVersion: unknown;
}) {
  function maybeLoadOlder(node: HTMLDivElement) {
    if (!hasOlder || busy || error) {
      return;
    }

    if (node.scrollTop < NEAR_TOP_PX) {
      void loadOlder();
    }
  }

  // Runs after the anchor-restoring effect declared above it in each screen (same commit, later
  // in declaration order), so it reads the scroll position that effect just restored, not a stale
  // one.
  useLayoutEffect(() => {
    const node = scroller.current;
    if (node) {
      maybeLoadOlder(node);
    }
    // `hasOlder`/`busy`/`error` are already listed; `loadOlder` and `scroller` are stable-enough
    // closures (a new `loadOlder` identity per render carries no behavior the listed values don't
    // already determine) and re-adding them would only re-run this on every unrelated render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsVersion, hasOlder, busy, error]);

  return maybeLoadOlder;
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
  onChange,
}: {
  filter: WorkFilterState;
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
            <IconButton aria-label={triggerLabel} icon="filter" size="sm" variant="secondary" />
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
            {workFilterKinds.map((kind) => (
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

/** A plain compact row for a tool item nested inside a `ToolBurstTimelineItem`'s own inline
 * disclosure — the burst's members are de-emphasized detail inside that ONE `Timeline.Item`'s
 * content, never additional chronology markers of their own (live owner review, second/
 * structural pass: "jedna oś, jedna hierarchia" / one axis, one hierarchy — a group is exactly
 * one `Timeline.Marker`/row; its expanded contents are that single item's own details, not a
 * second mini-Timeline with independent dots). So unlike every top-level row, this one carries no
 * `StatusIndicator` of its own: a burst only ever groups uniformly happy-path ('completed') tool
 * items (`groupChapterEntries`), so a per-row status dot here would say nothing a state already
 * implied by being inside the group, while visually reading as a second rail running alongside
 * the real one — exactly the "two axes" the owner flagged. */
function CompactToolRow({
  item,
  onOpenActions,
}: {
  item: WorkSummary;
  onOpenActions: (workId: string) => void;
}) {
  const { t } = useTranslation();
  const duration = useWorkDurationLabel(item);

  return (
    <div className="grid min-w-0 gap-0.5 text-body-sm">
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="min-w-0 truncate text-content-secondary">{item.title.text}</span>
        {duration && (
          <span className="shrink-0 text-body-sm text-content-muted tabular-nums">{duration}</span>
        )}
      </span>
      {!!item.actionCount && (
        <Button
          size="sm"
          variant="ghost"
          className="h-auto w-fit justify-start px-0"
          onClick={() => onOpenActions(item.workId)}
        >
          {t('managedSession.actions')}
        </Button>
      )}
    </div>
  );
}

/** Localized elapsed-time text for a settled Work item, or `undefined` for one still running
 * (queued/active/waiting) or with an unparsable timestamp — never fabricated (session-
 * work-inspector-ui-spec.md §2: the real contract has no separate `durationMs` field, so this is
 * computed only from the canonical `createdAt`/`updatedAt` every `WorkSummary` already has). */
function useWorkDurationLabel(item: WorkSummary): string | undefined {
  const { i18n } = useTranslation();
  const ms = workItemDurationMs(item);

  return ms === undefined ? undefined : formatWorkDuration(ms, i18n.language);
}

/** A reasoning summary as its own `Timeline.Item`: separately labeled "Thinking" and optionally
 * collapsible — never styled like a tool action or presented as Commentary
 * (session-chat-v10-design.md §4). Every non-Commentary Work item — Reasoning included — gets the
 * exact same `Timeline.Item`/`Timeline.Marker` treatment on the chapter's rail (owner decision,
 * see session-work-inspector-ui-spec.md §2); only Reasoning's own disclosure, unchanged from
 * before, lives inside its Content. */
function ReasoningTimelineItem({ item, data }: { item: WorkSummary; data: Data }) {
  const { t } = useTranslation();
  const duration = useWorkDurationLabel(item);

  return (
    <Timeline.Item>
      <Timeline.Marker tone={stateTone(item.state)} />
      <Timeline.Content title="">
        <Collapsible>
          <Collapsible.Trigger>
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="italic text-content-muted">
                {t('managedSession.workInspector.thinking')}
              </span>
              {duration && (
                <span className="shrink-0 text-body-sm text-content-muted tabular-nums">
                  {duration}
                </span>
              )}
            </span>
          </Collapsible.Trigger>
          <Collapsible.Content>
            <ReadableText api={data.api} sessionId={data.sessionId} value={item.title} />
          </Collapsible.Content>
        </Collapsible>
      </Timeline.Content>
    </Timeline.Item>
  );
}

function InteractionTimelineItem({ item }: { item: WorkSummary }) {
  const { t } = useTranslation();
  const duration = useWorkDurationLabel(item);

  return (
    <Timeline.Item>
      <Timeline.Marker active={item.state === 'active'} tone={stateTone(item.state)} />
      <Timeline.Content
        meta={t(`managedSession.workState.${item.state}`)}
        time={duration}
        title={t('managedSession.workKind.interaction')}
      />
    </Timeline.Item>
  );
}

/** A compact tool row as its own `Timeline.Item`. Clicking a Work item with child ToolActions
 * opens that exact Work's ToolActionSummary detail (ToolAction stays the tool's own child, never a
 * top-level row). The state is carried as visible `meta` text — never only the marker's color —
 * because `Timeline.Marker` is decorative (`aria-hidden`) by the real component's own contract. */
function ToolTimelineItem({
  item,
  onOpenActions,
}: {
  item: WorkSummary;
  onOpenActions: (workId: string) => void;
}) {
  const { t } = useTranslation();
  const duration = useWorkDurationLabel(item);

  return (
    <Timeline.Item>
      <Timeline.Marker active={item.state === 'active'} tone={stateTone(item.state)} />
      <Timeline.Content
        meta={t(`managedSession.workState.${item.state}`)}
        time={duration}
        title={item.title.text}
      >
        {!!item.actionCount && (
          <Button
            size="sm"
            variant="ghost"
            className="h-auto w-fit justify-start px-0"
            onClick={() => onOpenActions(item.workId)}
          >
            {t('managedSession.actions')}
          </Button>
        )}
      </Timeline.Content>
    </Timeline.Item>
  );
}

/** A long (`workGrouping.ts`'s `TOOL_BURST_MIN_SIZE`+) run of adjacent happy-path tool items,
 * compacted into exactly one `Timeline.Item`/marker on the chronology rail, collapsed by default,
 * with its members revealed inline inside that same item's `Timeline.Content` on expand — never a
 * second nested mini-Timeline with its own dots/connector line (see `CompactToolRow`'s own doc
 * comment). A run shorter than the threshold never reaches this component at all: `workGrouping
 * .groupChapterEntries` leaves it as that many individual `single` entries instead. */
function ToolBurstTimelineItem({
  burst,
  onOpenActions,
}: {
  burst: ToolBurstEntry;
  onOpenActions: (workId: string) => void;
}) {
  const { t } = useTranslation();

  return (
    <Timeline.Item>
      <Timeline.Marker tone="success" />
      <Timeline.Content title="">
        <Collapsible>
          <Collapsible.Trigger>
            {t('managedSession.workInspector.toolBurst', { count: burst.items.length })}
          </Collapsible.Trigger>
          <Collapsible.Content>
            <ul className="grid gap-1.5">
              {burst.items.map((item) => (
                <li key={item.workId}>
                  <CompactToolRow item={item} onOpenActions={onOpenActions} />
                </li>
              ))}
            </ul>
          </Collapsible.Content>
        </Collapsible>
      </Timeline.Content>
    </Timeline.Item>
  );
}

function WorkChapterEntryRow({
  entry,
  data,
  onOpenActions,
}: {
  entry: ChapterEntry;
  data: Data;
  onOpenActions: (workId: string) => void;
}) {
  if (entry.type === 'burst') {
    return <ToolBurstTimelineItem burst={entry} onOpenActions={onOpenActions} />;
  }

  const { item } = entry;
  if (item.kind === 'reasoning') {
    return <ReasoningTimelineItem item={item} data={data} />;
  }

  if (item.kind === 'interaction') {
    return <InteractionTimelineItem item={item} />;
  }

  return <ToolTimelineItem item={item} onOpenActions={onOpenActions} />;
}

/** The marker-column gutter a Commentary row's leading icon sits in: exactly as wide as
 * `Timeline`'s `size="sm"` marker column (`timelineItemVariants`'s `1rem` + `gap-x-1.5`), sized
 * and centered the same way `Timeline.Marker` centers its dot inside that column — so the icon
 * stays on one vertical axis with every `Timeline.Marker` dot below it (live owner review,
 * screenshot-verified alignment fix). Unlike the first review round, Commentary is no longer a
 * `Collapsible.Trigger` at all (see `WorkChapterCommentary`'s own doc comment), so this is a plain
 * grid column, not a disclosure chevron slot — there is nothing left to compensate a trigger
 * button's own padding for. */
const COMMENTARY_GUTTER_CLASS = 'flex size-4 shrink-0 items-center justify-center';

/** A Commentary long enough that showing it in full would push its following operations well
 * below the fold is the only case that earns a "Show more" truncation (live owner review,
 * second/structural pass, rule 1). `!complete` is the authoritative signal — the real transport
 * cap on the initial preview (see `ReadableText`'s own doc comment) means there is strictly more
 * text the user has not seen yet — and the character count is a plain visual fallback for a
 * `complete` preview that is nonetheless several paragraphs long. Ordinary Commentary (a sentence
 * or two, the common case in every fixture here) stays well under this and never shows the
 * control at all. */
const COMMENTARY_LONG_TEXT_CHARS = 280;

function isCommentaryLong(commentary: WorkSummary): boolean {
  return !commentary.title.complete || commentary.title.text.length > COMMENTARY_LONG_TEXT_CHARS;
}

/** Commentary is read directly in the flow, never gated behind a click (live owner review,
 * second/structural pass — a ChatGPT-assisted design review that superseded the first round's
 * collapsed-by-default divider): "Commentary jest elementem narracji, a nie nagłówkiem zwijanej
 * grupy operacji" / Commentary is a narrative element, not a header that collapses a group of
 * operations. Commentary and the operations that chronologically follow it are siblings in the
 * flow (`buildWorkChapters` stays chronology-driven — see its own doc comment — but the VISUAL
 * treatment here no longer boxes operations under "their" Commentary the way a disclosure gate
 * would, since the data does not actually support that ownership: see this function's own
 * disclosure comment below). So there is no chevron, no `Collapsible` wrapping the row, and no
 * operation count attached to it either — just an icon and the text, always visible.
 *
 * The one exception is `isCommentaryLong`: genuinely long Commentary gets a plain "Show more"/
 * "Show less" ghost `Button` (the same label-only disclosure pattern `TaskDetailDisclosure.tsx`
 * already uses elsewhere in this app for "reveal more text", not a new chevron-led control
 * invented for this row) instead of being dumped in full — expanding it mounts `ReadableText`
 * (which itself auto-fetches and stitches any remaining pages beyond the capped preview). */
function WorkChapterCommentary({ commentary, data }: { commentary: WorkSummary; data: Data }) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const isLong = isCommentaryLong(commentary);

  return (
    <div className="grid min-w-0 grid-cols-[1rem_minmax(0,1fr)] items-start gap-x-1.5">
      <span className={COMMENTARY_GUTTER_CLASS}>
        <Icon name="chat" size="sm" className="text-content-muted" />
      </span>
      <div className="grid min-w-0 gap-1">
        {isExpanded ? (
          <ReadableText
            api={data.api}
            sessionId={data.sessionId}
            value={commentary.title}
            markdown
          />
        ) : (
          <Typography
            as="p"
            variant="body-md"
            className={cn(
              'min-w-0 text-content-primary [overflow-wrap:anywhere]',
              isLong && 'line-clamp-4',
            )}
          >
            {commentary.title.text}
          </Typography>
        )}
        {isLong && (
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 h-auto w-fit justify-start px-2"
            onClick={() => setIsExpanded((value) => !value)}
          >
            {isExpanded
              ? t('managedSession.workInspector.showLess')
              : t('managedSession.workInspector.showMore')}
          </Button>
        )}
      </div>
    </div>
  );
}

/** A chapter's operations as one flat `Timeline` (compact `size="sm"`), always rendered directly
 * — never behind a chapter-level "N operations" disclosure gate (live owner review, second/
 * structural pass, rule 2: a short run of 1-4 operations is just shown, not wrapped in a synthetic
 * summary container; `workGrouping.groupChapterEntries` already handles the one remaining case
 * that DOES still compact, a long adjacent happy-path run, into a single burst `Timeline.Item` —
 * see `ToolBurstTimelineItem`). The first review round's `operationsDefaultExpanded` A/B toggle is
 * gone with it: there is no longer a meaningful lever here to expose, owner-mandated structure
 * replaced the open question it existed to compare. */
function WorkChapterOperationsTimeline({
  entries,
  data,
  onOpenActions,
  ariaLabel,
}: {
  entries: readonly ChapterEntry[];
  data: Data;
  onOpenActions: (workId: string) => void;
  ariaLabel: string;
}) {
  if (entries.length === 0) {
    return null;
  }

  return (
    <Timeline aria-label={ariaLabel} size="sm">
      {entries.map((entry) => (
        <WorkChapterEntryRow
          key={entry.type === 'burst' ? entry.items[0]!.workId : entry.item.workId}
          data={data}
          entry={entry}
          onOpenActions={onOpenActions}
        />
      ))}
    </Timeline>
  );
}

/** One Commentary-headed phase: `<timeline> <comment> <timeline> …` — each chapter gets its own
 * Timeline instance (the rail resets at every Commentary boundary; it never spans across one),
 * with Commentary rendered directly above it, never as part of the rail itself (owner decision,
 * see session-work-inspector-ui-spec.md §2) and never gating it behind a disclosure either (see
 * `WorkChapterCommentary`'s own doc comment). The leading "Start of Turn" chapter uses a neutral
 * label instead of a Commentary heading — there is no prose to show there. */
function WorkChapterSection({
  chapter,
  data,
  onOpenActions,
}: {
  chapter: WorkChapter;
  data: Data;
  onOpenActions: (workId: string) => void;
}) {
  const { t } = useTranslation();
  const entries = useMemo(() => groupChapterEntries(chapter.items), [chapter.items]);
  // Accessible name only (the Timeline's own `aria-label`) — never rendered as visible text next
  // to Commentary, which would read as "this Commentary owns N operations" (live owner review,
  // second/structural pass: don't claim a stronger ownership/causality than the chronological
  // data supports).
  const ariaLabel = t('managedSession.workInspector.operationsCount', {
    count: chapter.items.length,
  });

  return (
    <section className="grid min-w-0 gap-2 border-b border-border-subtle pb-4 last:border-b-0 last:pb-0">
      {chapter.commentary ? (
        <WorkChapterCommentary commentary={chapter.commentary} data={data} />
      ) : (
        <Typography as="h3" variant="label-sm" className="text-content-secondary">
          {t('managedSession.workInspector.startOfTurn')}
        </Typography>
      )}
      <WorkChapterOperationsTimeline
        entries={entries}
        data={data}
        onOpenActions={onOpenActions}
        ariaLabel={ariaLabel}
      />
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
  const byKindLabels = [
    t('managedSession.workInspector.toolBurst', { count: counts.byKind.tool }),
    t('managedSession.workInspector.counts.commentary', { count: counts.byKind.commentary }),
    t('managedSession.workInspector.counts.reasoning', { count: counts.byKind.reasoning }),
    t('managedSession.workInspector.counts.interaction', { count: counts.byKind.interaction }),
  ];

  return (
    <div className="grid gap-0.5">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <Typography as="span" variant="label-sm" className="text-content-primary">
          {t('managedSession.workInspector.counts.total', { count: counts.total })}
        </Typography>
        {counts.inProgress > 0 && (
          <Badge tone="info" size="compact">
            {t('managedSession.workInspector.counts.inProgress', { count: counts.inProgress })}
          </Badge>
        )}
      </div>
      <Typography as="p" variant="body-sm" className="text-content-muted">
        {byKindLabels.join(' · ')}
      </Typography>
    </div>
  );
}

function Work({ data }: { data: Data }) {
  const { t } = useTranslation();
  const navigation = useSecondaryStack<Pages>();
  const [items, setItems] = useState<WorkSummary[]>([]);
  const [history, setHistory] = useState<{ hasOlder: boolean; before?: string }>({
    hasOlder: false,
  });
  const [olderBusy, setOlderBusy] = useState(false);
  const [olderError, setOlderError] = useState(false);
  const [filter, setFilter] = useState<WorkFilterState>({ kind: 'all', search: '' });
  // The proposed, not-yet-backend-implemented `WorkPage.counts` aggregate (workCounts.ts,
  // docs/reference/api/sessions.md "Proposed Work aggregate counts"): kept as separate state,
  // updated from every tail refresh and older-page fetch, rather than ever derived from `items`
  // — this hides the whole summary row when the field is absent instead of faking it from
  // `items.length` (session-chat-v10-design.md §3).
  const [counts, setCounts] = useState<WorkCounts | undefined>(undefined);
  const scroller = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ height: number; top: number } | undefined>(undefined);

  // Always fetches the current tail window (no `before`): older pages are loaded progressively
  // and merged locally (see `loadOlder`), never fetched eagerly — this stays a bounded
  // `WorkPage` request even for a Turn with hundreds of historical Work items.
  const query = useQuery({
    queryKey: ['managed-work', data.owner, data.sessionId, data.turnId],
    queryFn: ({ signal }) => data.api.work(data.sessionId, data.turnId, undefined, signal),
  });
  useWorkRefresh(data.feed, data.turnId, query.refetch);

  useEffect(() => {
    if (!query.data) {
      return;
    }

    setItems((previous) => mergeWorkItems(previous, query.data.items));
    setHistory(query.data.history);
    setCounts(query.data.counts);
  }, [query.data]);

  // Restores the viewport anchor after an older page is prepended (session-work-inspector-ui-
  // spec.md §5.5): the user's current scroll position must not jump when older content loads
  // above it. Mirrors ManagedSession's own history-scroll-anchor technique.
  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || !anchor.current) {
      return;
    }

    node.scrollTop = anchor.current.top + node.scrollHeight - anchor.current.height;
    anchor.current = undefined;
  }, [items]);

  async function loadOlder() {
    if (!history.before || olderBusy) {
      return;
    }

    if (scroller.current) {
      anchor.current = { height: scroller.current.scrollHeight, top: scroller.current.scrollTop };
    }

    setOlderBusy(true);
    setOlderError(false);
    try {
      const page = await data.api.work(data.sessionId, data.turnId, history.before);
      setItems((previous) => mergeWorkItems(previous, page.items));
      setHistory(page.history);
      setCounts(page.counts);
    } catch {
      anchor.current = undefined;
      setOlderError(true);
    } finally {
      setOlderBusy(false);
    }
  }

  const maybeLoadOlder = useAutoLoadOlder({
    scroller,
    hasOlder: history.hasOlder,
    busy: olderBusy,
    error: olderError,
    loadOlder,
    itemsVersion: items,
  });

  const chapters = useMemo(() => buildWorkChapters(items), [items]);
  const visibleChapters = useMemo(() => filterWorkChapters(chapters, filter), [chapters, filter]);
  const openActions = (workId: string) => void navigation.navTo('actions', { workId });

  return (
    <AppContent className="h-full w-full">
      {/* `contentClassName`'s `flex min-h-full flex-col` gives the scrolled content a definite,
          full-height column: `EmptyState`'s own `variant="pane"` (`flex-1 min-h-full ...
          justify-center`) then actually has remaining space (below the filter bar) to fill and
          self-centre within, and the real-results wrapper's `m-auto` centres a short visible Work
          log the same way — both instead of collapsing to intrinsic height at the top of an
          otherwise-blank, full-viewport mobile drill-in panel (live-review finding). A Work log
          long enough to overflow computes `m-auto`'s margins to `0` and starts under the filter
          bar as before, so this never fights normal scrolling. */}
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
              <WorkFilterBar filter={filter} onChange={setFilter} />
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
                <div className="m-auto grid w-full gap-4">
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

function Actions({ data, params }: { data: Data; params: { workId: string } }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ToolActionSummary[]>([]);
  const [history, setHistory] = useState<{ hasOlder: boolean; before?: string }>({
    hasOlder: false,
  });
  const [olderBusy, setOlderBusy] = useState(false);
  const [olderError, setOlderError] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ height: number; top: number } | undefined>(undefined);

  const query = useQuery({
    queryKey: ['managed-actions', data.owner, data.sessionId, params.workId],
    queryFn: ({ signal }) => data.api.actions(data.sessionId, params.workId, undefined, signal),
  });
  useWorkRefresh(data.feed, data.turnId, query.refetch);

  useEffect(() => {
    if (!query.data) {
      return;
    }

    setItems((previous) => mergeToolActions(previous, query.data.items));
    setHistory(query.data.history);
  }, [query.data]);

  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || !anchor.current) {
      return;
    }

    node.scrollTop = anchor.current.top + node.scrollHeight - anchor.current.height;
    anchor.current = undefined;
  }, [items]);

  async function loadOlder() {
    if (!history.before || olderBusy) {
      return;
    }

    if (scroller.current) {
      anchor.current = { height: scroller.current.scrollHeight, top: scroller.current.scrollTop };
    }

    setOlderBusy(true);
    setOlderError(false);
    try {
      const page = await data.api.actions(data.sessionId, params.workId, history.before);
      setItems((previous) => mergeToolActions(previous, page.items));
      setHistory(page.history);
    } catch {
      anchor.current = undefined;
      setOlderError(true);
    } finally {
      setOlderBusy(false);
    }
  }

  const maybeLoadOlder = useAutoLoadOlder({
    scroller,
    hasOlder: history.hasOlder,
    busy: olderBusy,
    error: olderError,
    loadOlder,
    itemsVersion: items,
  });

  return (
    <AppContent className="h-full w-full">
      {/* Same full-height-centring treatment as `Work` above: `EmptyState` fills and self-centres
          via its own `flex-1`, and the real Actions Timeline's `m-auto` wrapper centres a short
          drill-in (a Work item with only one or two actions) instead of leaving it pinned to the
          top of an otherwise-blank, full-viewport mobile panel (live-review finding) — a Timeline
          long enough to overflow computes `m-auto`'s margins to `0` and is unaffected. */}
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
              ) : (
                // L3/L4 exact chronology: the generic Timeline is the right default here, unlike
                // the Commentary-grouped L2 Work log above (session-work-inspector-ui-spec.md §2).
                <div className="m-auto w-full">
                  <Timeline size="sm" aria-label={t('managedSession.actions')}>
                    {items.map((item) => (
                      <Timeline.Item key={item.actionId}>
                        <Timeline.Marker tone={stateTone(item.state)} />
                        <Timeline.Content title={t(`managedSession.workState.${item.state}`)}>
                          <div className="grid min-w-0 gap-2">
                            <ReadableText
                              api={data.api}
                              sessionId={data.sessionId}
                              value={item.title}
                            />
                            {item.input && (
                              <div className="grid min-w-0 gap-1">
                                <Typography variant="label-sm" className="text-content-muted">
                                  {t('managedSession.workInspector.input')}
                                </Typography>
                                <ReadableText
                                  api={data.api}
                                  sessionId={data.sessionId}
                                  value={{ text: '', complete: false, content: item.input }}
                                />
                              </div>
                            )}
                            {item.output && (
                              <div className="grid min-w-0 gap-1">
                                <Typography variant="label-sm" className="text-content-muted">
                                  {t('managedSession.workInspector.output')}
                                </Typography>
                                <ReadableText
                                  api={data.api}
                                  sessionId={data.sessionId}
                                  value={{ text: '', complete: false, content: item.output }}
                                />
                              </div>
                            )}
                            {item.error && <Alert tone="attention" title={item.error.message} />}
                          </div>
                        </Timeline.Content>
                      </Timeline.Item>
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

export function createWorkInspector(api: ManagedSessionsApi, feed: SessionFeed, owner: string) {
  return defineSecondaryStack<Root, Data, Pages>({
    id: 'managed-session-work',
    initial: 'work',
    useData: (params) => ({
      status: 'ready',
      data: { ...params, api, feed, owner },
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
        component: Actions,
      },
    },
  });
}

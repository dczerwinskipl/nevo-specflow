import type { ToolActionSummary, WorkSummary } from '@nevo/specflow-contracts/sessions';

/**
 * Commentary-grouped L2 Work chronology (full-session.md "Work history (L2)"): pure, UI-framework-free grouping/filtering so the
 * behaviour is unit-testable without mounting the Secondary stack or ScrollArea machinery.
 *
 * The real canonical `WorkSummary.kind` is only `'commentary' | 'reasoning' | 'interaction' |
 * 'tool'` (docs/reference/api/sessions.md) — there is no server-provided sub-kind distinguishing
 * reads/writes/commands/search the way the old-repo `ToolInvocationWorkItem.kind` or the V10
 * mockup's filter chips imply. This module never fabricates that finer taxonomy: grouping and
 * filtering both operate only on the real `kind`/`state` fields.
 */

/** One filterable Work kind, plus the unfiltered default. */
export type WorkFilterKind = 'all' | WorkSummary['kind'];

export const workFilterKinds: readonly WorkFilterKind[] = [
  'all',
  'commentary',
  'reasoning',
  'tool',
  'interaction',
];

/** Two or more consecutive happy-path ('completed') tool items, compacted into one row. */
export interface ToolBurstEntry {
  type: 'burst';
  items: readonly WorkSummary[];
}

/** Any Work item shown as its own row: Commentary, Reasoning, Interaction, or an isolated tool. */
export interface SingleWorkEntry {
  type: 'single';
  item: WorkSummary;
}

export type ChapterEntry = ToolBurstEntry | SingleWorkEntry;

/**
 * One Commentary-headed phase of a Turn. `commentary` is undefined for the leading
 * "Start of Turn" chapter that covers operations before the first Commentary.
 */
export interface WorkChapter {
  /** Stable key: the heading Commentary's workId, or the constant below for Start of Turn. */
  id: string;
  commentary?: WorkSummary;
  /**
   * How the heading Commentary takes part in the current view: `match` — it is itself part of
   * what the user asked to see (no filter, the Commentary kind, or a search that hits its text),
   * shown in full. Undefined when the chapter is only present because one of its OTHER items
   * matches a kind/search filter — Commentary is never shown as a secondary "context" line for a
   * filter it did not itself match (showing it as orientation for where a match occurred would make
   * e.g. the tool filter read identically to "all" whenever every chapter already had its own
   * Commentary; every filter must show ONLY the kind it names, with nothing else mixed in).
   * Absent on unfiltered chapters straight from `buildWorkChapters` (= `match`).
   */
  commentaryRole?: 'match';
  /** Raw, unfiltered, ascending (oldest first) children of this chapter. */
  items: readonly WorkSummary[];
}

export const START_OF_TURN_CHAPTER_ID = 'start-of-turn';

/**
 * Partitions ascending (oldest -> newest) Work items into Commentary-headed chapters.
 * A Commentary item starts a new chapter; every following non-Commentary item belongs to it
 * until the next Commentary. Leading items before any Commentary form the Start of Turn chapter,
 * which is omitted when empty (a Turn that opens directly with Commentary). A trailing chapter
 * is always kept even with zero children yet (a Commentary with nothing after it so far).
 */
export function buildWorkChapters(items: readonly WorkSummary[]): WorkChapter[] {
  const chapters: WorkChapter[] = [];
  let id = START_OF_TURN_CHAPTER_ID;
  let commentary: WorkSummary | undefined;
  // A fresh array per chapter: pushed chapters keep their own `items` reference, never aliased
  // by a later chapter's in-progress accumulation.
  let current: WorkSummary[] = [];
  const flush = () => chapters.push({ id, commentary, items: current });

  for (const item of items) {
    if (item.kind === 'commentary') {
      if (commentary || current.length > 0) {
        flush();
      }

      id = item.workId;
      commentary = item;
      current = [];
    } else {
      current.push(item);
    }
  }

  flush();

  return chapters;
}

export interface WorkFilterOptions {
  kind: WorkFilterKind;
  /** Case-insensitive substring match against item/Commentary title preview text. */
  search: string;
}

function matchesSearch(item: WorkSummary, term: string): boolean {
  return !term || item.title.text.toLowerCase().includes(term);
}

/**
 * Kinds actually present in this Turn — the only type-filter options worth offering. A kind with
 * no item can never match, so offering it is a dead end (an "interaction" option on a Turn
 * that has none would show an empty view every time). Uses the Turn-wide `byKind` projection
 * when one exists, otherwise the loaded items; `'all'` is always first.
 */
export function availableWorkFilterKinds(
  items: readonly WorkSummary[],
  byKind?: Partial<Record<WorkSummary['kind'], number>>,
): WorkFilterKind[] {
  const present = new Set<WorkSummary['kind']>(items.map((item) => item.kind));
  for (const [kind, count] of Object.entries(byKind ?? {})) {
    if ((count ?? 0) > 0) {
      present.add(kind as WorkSummary['kind']);
    }
  }

  return workFilterKinds.filter((kind) => kind === 'all' || present.has(kind));
}

/**
 * One rule for every option, so no filter behaves unpredictably: a type filter shows ONLY Work items of that kind, and search shows only items
 * whose text matches — nothing else is mixed in (no "show Commentary as context" exception: it would make
 * a kind filter read identically to "all" whenever every chapter already had its own
 * Commentary). Chronology is still never
 * flattened — a matching item stays inside its Commentary-headed chapter — but that chapter's
 * Commentary itself is only shown when it is ALSO part of what the user asked to see. A chapter
 * with no match (items or, where applicable, its own Commentary) is dropped entirely.
 *
 * - `all`, no search: everything, every Commentary in full (an empty trailing chapter too).
 * - `commentary`: only Commentary (each a `match`), no operations.
 * - any other kind: only that kind's items; the chapter's own Commentary is NOT shown unless it
 *   also matches (only possible for `all` + a search term, below).
 * - search: narrows whatever the kind selected; a Commentary whose own text matches is a `match`
 *   (and keeps its chapter visible even if none of its operations match) — only evaluated when
 *   `kind === 'all'`, matching the rule above that a non-"all" kind filter never surfaces
 *   Commentary on its own.
 */
export function filterWorkChapters(
  chapters: readonly WorkChapter[],
  options: WorkFilterOptions,
): WorkChapter[] {
  const term = options.search.trim().toLowerCase();

  if (options.kind === 'all' && !term) {
    return chapters.map((chapter) => ({ ...chapter, commentaryRole: 'match' }));
  }

  if (options.kind === 'commentary') {
    return chapters
      .filter((chapter) => chapter.commentary && matchesSearch(chapter.commentary, term))
      .map((chapter) => ({ ...chapter, commentaryRole: 'match', items: [] }));
  }

  return chapters.flatMap((chapter): WorkChapter[] => {
    const items = chapter.items.filter(
      (item) => (options.kind === 'all' || item.kind === options.kind) && matchesSearch(item, term),
    );
    const commentaryMatches =
      options.kind === 'all' &&
      !!term &&
      !!chapter.commentary &&
      matchesSearch(chapter.commentary, term);

    if (items.length === 0 && !commentaryMatches) {
      return [];
    }

    return [{ ...chapter, commentaryRole: commentaryMatches ? 'match' : undefined, items }];
  });
}

const happyToolState = (item: WorkSummary) => item.kind === 'tool' && item.state === 'completed';

/**
 * Minimum length of an adjacent happy-path tool run before it compacts into one burst row
 * (don't wrap 1-4 operations in a synthetic "N tool actions" summary container, just show the
 * rows). A run shorter than this renders as its own individual `Timeline.Item` per entry —
 * grouping only ever kicks in once hiding the run's members stops hurting the ability to trace what happened, i.e. for a genuinely
 * long, uneventful run.
 */
export const TOOL_BURST_MIN_SIZE = 5;

/**
 * Compacts a long (`>= TOOL_BURST_MIN_SIZE`) run of adjacent happy-path ('completed') tool items
 * inside one chapter into a single collapsible burst row — one `Timeline.Item`/marker for the
 * whole run, never one marker per member (full-session.md "Work history (L2)" and the
 * one-axis, one-hierarchy principle above). A shorter run
 * (1 to `TOOL_BURST_MIN_SIZE - 1` items) is left as that many individual rows instead of being
 * wrapped in a container at all. Reasoning and Interaction are never merged, and a tool that is
 * queued/active/waiting/failed/cancelled/interrupted/expired always stays its own isolated row —
 * exceptional or in-progress work must never disappear into a compact successful-looking group,
 * even when it would otherwise sit inside what is now a long enough run to group.
 */
export function groupChapterEntries(items: readonly WorkSummary[]): ChapterEntry[] {
  const entries: ChapterEntry[] = [];
  let run: WorkSummary[] = [];
  const flushRun = () => {
    if (run.length >= TOOL_BURST_MIN_SIZE) {
      entries.push({ type: 'burst', items: run });
    } else {
      for (const item of run) {
        entries.push({ type: 'single', item });
      }
    }

    run = [];
  };

  for (const item of items) {
    if (happyToolState(item)) {
      run.push(item);
    } else {
      flushRun();
      entries.push({ type: 'single', item });
    }
  }

  flushRun();

  return entries;
}

const terminalWorkStates: ReadonlySet<WorkSummary['state']> = new Set([
  'completed',
  'failed',
  'cancelled',
  'interrupted',
  'expired',
]);

/**
 * Elapsed time for one settled Work item, computed only from its own canonical `createdAt`/
 * `updatedAt` (never fabricated, never a separate `durationMs` field — the real contract has
 * none). `undefined` for a still-running item (queued/active/waiting has no final duration yet),
 * an unparsable timestamp, or a non-positive span: `createdAt === updatedAt` is not a real "0 ms"
 * measurement, it is the common case of a timestamp resolution/fixture limit (never display "0 ms" — an
 * unreliable/not-meaningful duration should be hidden, not rendered as zero). The caller (`useWorkDurationLabel` in WorkInspector.tsx) already treats `undefined` as
 * "omit the duration entirely", so this is the one place that decision needs to live.
 */
export function workItemDurationMs(
  item: Pick<WorkSummary, 'state' | 'createdAt' | 'updatedAt'>,
): number | undefined {
  if (!terminalWorkStates.has(item.state)) {
    return undefined;
  }

  const start = Date.parse(item.createdAt);
  const end = Date.parse(item.updatedAt);
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) {
    return undefined;
  }

  return end - start;
}

/** Localized "180 ms" / "8.4 s" text for {@link workItemDurationMs}'s result. */
export function formatWorkDuration(ms: number, locale: string): string {
  if (ms < 1000) {
    return new Intl.NumberFormat(locale, {
      style: 'unit',
      unit: 'millisecond',
      unitDisplay: 'short',
    }).format(Math.round(ms));
  }

  return new Intl.NumberFormat(locale, {
    style: 'unit',
    unit: 'second',
    unitDisplay: 'short',
    maximumFractionDigits: 1,
  }).format(ms / 1000);
}

/**
 * Localized wall-clock start/end, e.g. "14:32:05–14:32:06" (full-session.md "ToolAction detail
 * (L4)": the duration alone leaves no way to tell WHEN a ToolAction
 * ran). `undefined` on the same terms {@link workItemDurationMs} already uses for "no reliable
 * duration" (not yet settled, or an unparsable/non-positive span) — the two are shown together, so
 * one being unavailable implies the other is too.
 */
export function formatWorkClockRange(
  item: Pick<WorkSummary, 'state' | 'createdAt' | 'updatedAt'>,
  locale: string,
): string | undefined {
  if (workItemDurationMs(item) === undefined) {
    return undefined;
  }

  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  return `${time.format(new Date(item.createdAt))}–${time.format(new Date(item.updatedAt))}`;
}

/**
 * Merges a newly fetched Work page into the already-accumulated, ascending item list: upserts by
 * `workId` (a later revision wins — Realtime settlement only ever refreshes the tail window, per
 * full-session.md "Work history (L2)") and re-sorts by canonical `ordinal`. Used for both the
 * live tail refresh and progressively prepending an older page, so neither ever discards already
 * loaded history.
 */
export function mergeWorkItems(
  base: readonly WorkSummary[],
  incoming: readonly WorkSummary[],
): WorkSummary[] {
  const byId = new Map(base.map((item) => [item.workId, item] as const));
  for (const item of incoming) {
    const existing = byId.get(item.workId);
    if (!existing || item.revision >= existing.revision) {
      byId.set(item.workId, item);
    }
  }

  return [...byId.values()].sort((a, b) => a.ordinal - b.ordinal);
}

/** Same upsert-by-id-and-revision merge as {@link mergeWorkItems}, for a ToolAction page. */
export function mergeToolActions(
  base: readonly ToolActionSummary[],
  incoming: readonly ToolActionSummary[],
): ToolActionSummary[] {
  const byId = new Map(base.map((item) => [item.actionId, item] as const));
  for (const item of incoming) {
    const existing = byId.get(item.actionId);
    if (!existing || item.revision >= existing.revision) {
      byId.set(item.actionId, item);
    }
  }

  return [...byId.values()].sort((a, b) => a.ordinal - b.ordinal);
}

import type { ToolActionSummary, WorkSummary } from '@nevo/specflow-contracts/sessions';

/**
 * Commentary-grouped L2 Work chronology (session-chat-v10-design.md §4,
 * session-work-inspector-ui-spec.md §6): pure, UI-framework-free grouping/filtering so the
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
 * Applies the type filter and text search while preserving Commentary context: a chapter stays
 * visible, with its heading Commentary intact, whenever at least one of its children still
 * matches — the match is never lifted out into a flat list that loses its phase. Selecting the
 * "commentary" kind switches to a table-of-contents view of just the matching Commentary
 * headings. With no active filter, an otherwise-empty trailing chapter (the current Commentary
 * with no operations yet) is still shown.
 */
export function filterWorkChapters(
  chapters: readonly WorkChapter[],
  options: WorkFilterOptions,
): WorkChapter[] {
  const term = options.search.trim().toLowerCase();

  if (options.kind === 'commentary') {
    return chapters
      .filter((chapter) => chapter.commentary && matchesSearch(chapter.commentary, term))
      .map((chapter) => ({ ...chapter, items: [] }));
  }

  const filtered = chapters.map((chapter) => ({
    ...chapter,
    items: chapter.items.filter(
      (item) => (options.kind === 'all' || item.kind === options.kind) && matchesSearch(item, term),
    ),
  }));

  return filtered.filter(
    (chapter) => chapter.items.length > 0 || (options.kind === 'all' && !term),
  );
}

const happyToolState = (item: WorkSummary) => item.kind === 'tool' && item.state === 'completed';

/**
 * Compacts consecutive happy-path ('completed') tool items inside one chapter into a single
 * collapsible burst row (session-work-inspector-ui-spec.md §6.2/§6.3). Reasoning and Interaction
 * are never merged, and a tool that is queued/active/waiting/failed/cancelled/interrupted/expired
 * always stays its own isolated row — exceptional or in-progress work must never disappear into
 * a compact successful-looking group.
 */
export function groupChapterEntries(items: readonly WorkSummary[]): ChapterEntry[] {
  const entries: ChapterEntry[] = [];
  let run: WorkSummary[] = [];
  const flushRun = () => {
    if (run.length > 1) {
      entries.push({ type: 'burst', items: run });
    } else if (run.length === 1) {
      entries.push({ type: 'single', item: run[0]! });
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

/**
 * Merges a newly fetched Work page into the already-accumulated, ascending item list: upserts by
 * `workId` (a later revision wins — Realtime settlement only ever refreshes the tail window, per
 * session-work-inspector-ui-spec.md §15) and re-sorts by canonical `ordinal`. Used for both the
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

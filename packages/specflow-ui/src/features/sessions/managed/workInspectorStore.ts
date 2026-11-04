import { useSyncExternalStore } from 'react';
import type { ToolActionSummary, WorkPage, WorkSummary } from '@nevo/specflow-contracts/sessions';
import type { WithWorkCounts, WorkCounts } from './workCounts';
import { mergeWorkItems, type WorkFilterKind } from './workGrouping';

// Product state of the Work history tab (secondary-navigation.md "Selection, filters, drafts and
// expanded rows are product state, kept outside the screen… scoped to the tab's object"). An
// inactive Secondary tab unmounts by design, so everything the user built up on it — the loaded
// older pages, the filter and search, the expanded narration rows — lives here, one store per
// object (a Turn's Work, a Work's ToolActions), created in `createWorkInspector`'s closure and read
// with `useSyncExternalStore`. A remount of the same object reads it back synchronously.

/** A minimal external store: one value, replaced immutably. */
export interface ViewStore<S> {
  get: () => S;
  update: (change: (state: S) => S) => void;
  subscribe: (listener: () => void) => () => void;
}

function createViewStore<S>(initial: S): ViewStore<S> {
  let state = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => state,
    update(change) {
      const next = change(state);
      if (next !== state) {
        state = next;
        listeners.forEach((listener) => listener());
      }
    },
    subscribe(listener) {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
  };
}

/** One store per object key, created on first use. */
export function createViewStoreRegistry<S>(initial: () => S): (key: string) => ViewStore<S> {
  const stores = new Map<string, ViewStore<S>>();

  return (key) => {
    let store = stores.get(key);
    if (!store) {
      store = createViewStore(initial());
      stores.set(key, store);
    }

    return store;
  };
}

export function useViewState<S>(store: ViewStore<S>): S {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

export interface PageHistory {
  hasOlder: boolean;
  before?: string;
}

/** What the tail window and an older page have in common. */
export interface PagePart<TItem> {
  items: readonly TItem[];
  history: PageHistory;
}

/** The paging half of a view, shared by Work and Actions. Everything the tail query refreshes
 * stays server state (react-query); this keeps only what the tail cannot give back: items that
 * slid out of the tail window or came from older pages, and the older-page cursor. */
export interface PagedState<TItem> {
  /** Every item seen so far (older pages and tail items that later left the window). */
  items: readonly TItem[];
  /** The cursor of the oldest page loaded by `loadOlder`; only the older loader writes it, so a
   * tail refresh can never rewind it. Until then the tail's own `history` applies. */
  cursor: PageHistory | undefined;
  /** Bumped when an older page is merged — the scroll anchor is consumed per version, not per
   * `items` change, so a tail refresh during an older load cannot use the anchor up. */
  olderVersion: number;
  busy: boolean;
  error: boolean;
}

export const initialPagedState = <TItem>(): PagedState<TItem> => ({
  items: [],
  cursor: undefined,
  olderVersion: 0,
  busy: false,
  error: false,
});

export type Merge<TItem> = (base: readonly TItem[], incoming: readonly TItem[]) => TItem[];

/** Folds a fetched page into the paged state. A tail page only adds items; an older page also
 * moves the cursor and bumps `olderVersion`. */
export function absorbPage<TItem, S extends PagedState<TItem>>(
  state: S,
  merge: Merge<TItem>,
  page: PagePart<TItem>,
  source: 'tail' | 'older',
): S {
  const items = merge(state.items, page.items);
  if (source === 'tail') {
    return { ...state, items };
  }

  return {
    ...state,
    items,
    cursor: page.history,
    olderVersion: state.olderVersion + 1,
    busy: false,
    error: false,
  };
}

export interface CountsRecord {
  eventSeq: number;
  value: WorkCounts;
}

/** The counts that describe the newest snapshot of the Turn — an older page (fetched later but
 * describing an earlier `eventSeq`) must never overwrite newer counts. */
export function newestCounts(
  ...records: readonly (CountsRecord | undefined)[]
): CountsRecord | undefined {
  let newest: CountsRecord | undefined;
  for (const record of records) {
    if (record && (!newest || record.eventSeq > newest.eventSeq)) {
      newest = record;
    }
  }

  return newest;
}

export interface WorkFilterState {
  kind: WorkFilterKind;
  search: string;
}

export interface WorkViewState extends PagedState<WorkSummary> {
  filter: WorkFilterState;
  counts: CountsRecord | undefined;
  /** Narration rows opened with "Show more". */
  expanded: ReadonlySet<string>;
}

export const initialWorkViewState = (): WorkViewState => ({
  ...initialPagedState<WorkSummary>(),
  filter: { kind: 'all', search: '' },
  counts: undefined,
  expanded: new Set(),
});

export type ActionsViewState = PagedState<ToolActionSummary>;

export function toggleExpanded(state: WorkViewState, workId: string): WorkViewState {
  const expanded = new Set(state.expanded);
  if (!expanded.delete(workId)) {
    expanded.add(workId);
  }

  return { ...state, expanded };
}

/** The page's counts as a record comparable by `eventSeq`; none when the field is absent. */
export function workPageCounts(page: WithWorkCounts<WorkPage>): CountsRecord | undefined {
  return page.counts ? { eventSeq: page.eventSeq, value: page.counts } : undefined;
}

export function absorbWorkPage(
  state: WorkViewState,
  page: WithWorkCounts<WorkPage>,
  source: 'tail' | 'older',
): WorkViewState {
  return {
    ...absorbPage(state, mergeWorkItems, page, source),
    counts: newestCounts(state.counts, workPageCounts(page)),
  };
}

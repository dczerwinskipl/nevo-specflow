import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useAppContentScrollOwner } from '@nevo/ui';
import { useAutoLoadOlder } from './useAutoLoadOlder';
import { usePagedHistoryScroll } from './usePagedHistoryScroll';
import {
  useViewState,
  type Merge,
  type PagedState,
  type PagePart,
  type ViewStore,
} from './workInspectorStore';

/** What the view can show of a paged object: the stored pages merged with the tail window when it
 * is loaded, and whether older history remains behind them. The one definition for every reader
 * of the object (the screen and its declared header), so they never disagree when the tail is
 * missing (query cache cleared, refetch failed) but the store still holds the pages. */
export function availablePaged<TItem>(
  state: PagedState<TItem>,
  tail: PagePart<TItem> | undefined,
  merge: Merge<TItem>,
) {
  return {
    items: merge(state.items, tail?.items ?? []),
    hasOlder: (state.cursor ?? tail?.history)?.hasOlder ?? false,
  };
}

/**
 * The paging pattern shared by the Work and Actions screens: the tail window (a react-query page)
 * plus older pages loaded on scroll, merged during render from the view store — never copied into
 * local state by an effect — so a remount of the same object (a Secondary tab switch) reads the
 * same pages back synchronously.
 *
 * - The older-page cursor is the store's, set only by `loadOlder`; until the first older page the
 *   tail's own `history` applies. A tail refresh therefore never rewinds it.
 * - The scroll position has one owner (`usePagedHistoryScroll`): the entry being read stays where
 *   it is through every change — an older page landing (in the commit that merges it), a tail
 *   refresh, a filter, content growing by itself — and only the reader moves it. Entries render
 *   `historyEntry(id)` inside the `historyList` element; `content` goes on the scroller's content.
 * - Auto-loading is bounded (`useAutoLoadOlder`): `stalled` says it stopped with older history
 *   remaining, and `loadMore` is the reader's request for the next batch.
 */
export function usePagedHistory<TItem, S extends PagedState<TItem>, TPage extends PagePart<TItem>>({
  store,
  merge,
  tail,
  fetchOlder,
  absorbOlder,
  resetKey,
}: {
  store: ViewStore<S>;
  merge: Merge<TItem>;
  /** The latest tail window, when loaded. */
  tail: TPage | undefined;
  fetchOlder: (before: string) => Promise<TPage>;
  /** Folds a fetched older page into the view (extras such as counts ride along). */
  absorbOlder: (state: S, page: TPage) => S;
  /** What the reader is looking for in the history (the filter and search): when it changes, the
   * auto-loader starts looking again (`useAutoLoadOlder`). */
  resetKey?: (state: S) => unknown;
}) {
  const state = useViewState(store);
  // What scrolls the list: the screen's own `ScrollArea` (`viewport`) on a split layout, the
  // stacked surface's page scroll otherwise (a stacked Secondary scrolls its whole page, header
  // included, so the screen's own viewport never scrolls there).
  const viewport = useRef<HTMLDivElement>(null);
  const owner = useAppContentScrollOwner();
  const ambient = owner?.element ?? null;
  const scroller = useMemo(
    () => (ambient ? { current: ambient as HTMLDivElement } : viewport),
    [ambient],
  );
  const content = useRef<HTMLDivElement>(null);
  const { items, hasOlder } = useMemo(
    () => availablePaged(state, tail, merge),
    [merge, state, tail],
  );

  // A commit that changed what the list holds or shows (an older page, the tail, a filter, an
  // indicator) is applied before the auto-loader below reads the position (same commit, earlier
  // in declaration order); changes inside rendered entries reach the owner by themselves.
  const { layoutChanged, showAtTop, releaseSpace } = usePagedHistoryScroll(scroller, content);
  useLayoutEffect(layoutChanged, [layoutChanged, state, tail]);

  async function loadOlder(begin?: () => void) {
    const current = store.get();
    const before = (current.cursor ?? tail?.history)?.before;
    if (!before || current.busy) {
      return;
    }

    // Measures the list as it is now, before the loading indicator changes it.
    begin?.();

    store.update((value) => ({ ...value, busy: true, error: false }));
    try {
      const page = await fetchOlder(before);
      store.update((value) => absorbOlder(value, page));
    } catch {
      store.update((value) => ({ ...value, busy: false, error: true }));
    }
  }

  const { maybeLoadOlder, stalled, loadMore } = useAutoLoadOlder({
    scroller,
    hasOlder,
    busy: state.busy,
    error: state.error,
    loadOlder,
    itemsVersion: items,
    olderVersion: state.olderVersion,
    resetKey: resetKey?.(state),
  });

  const coveredTop = useCallback(
    () => (ambient && owner ? owner.coveredTop() : 0),
    [ambient, owner],
  );

  // Near the top, the next older page loads, whichever element scrolls.
  const nearTop = useRef(maybeLoadOlder);
  useLayoutEffect(() => {
    nearTop.current = maybeLoadOlder;
  });
  useEffect(() => {
    const node = scroller.current;
    if (!node) {
      return undefined;
    }

    const scrolled = () => nearTop.current(node);
    node.addEventListener('scroll', scrolled, { passive: true });

    return () => node.removeEventListener('scroll', scrolled);
  }, [scroller]);

  return {
    state,
    items,
    hasOlder,
    /** The screen's own `ScrollArea` viewport (`viewportRef`). */
    viewport,
    /** Space the surface's controls cover at the top of `scroller` (a stacked header band). */
    coveredTop,
    /** What scrolls the list is known (a stacked surface reports its page scroller after mount). */
    scrollReady: owner === null || ambient !== null,
    content,
    loadOlder,
    stalled,
    loadMore,
    showAtTop,
    releaseSpace,
  };
}

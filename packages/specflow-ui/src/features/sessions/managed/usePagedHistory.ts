import { useLayoutEffect, useMemo, useRef } from 'react';
import {
  useViewState,
  type Merge,
  type PagedState,
  type PagePart,
  type ViewStore,
} from './workInspectorStore';

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
 * `hasOlder` is false, and a short Work/Actions list that never overflows (no scrollbar to
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

  // Runs after the anchor-restoring effect in `usePagedHistory` (same commit, later in declaration
  // order), so it reads the scroll position that effect just restored, not a stale one.
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

/**
 * The paging pattern shared by the Work and Actions screens: the tail window (a react-query page)
 * plus older pages loaded on scroll, merged during render from the view store — never copied into
 * local state by an effect — so a remount of the same object (a Secondary tab switch) reads the
 * same pages back synchronously.
 *
 * - The older-page cursor is the store's, set only by `loadOlder`; until the first older page the
 *   tail's own `history` applies. A tail refresh therefore never rewinds it.
 * - The scroll anchor taken before an older fetch is consumed in the commit that merges that
 *   page (keyed to `olderVersion`), so a tail refresh landing mid-load cannot use it up.
 */
export function usePagedHistory<TItem, S extends PagedState<TItem>, TPage extends PagePart<TItem>>({
  store,
  merge,
  tail,
  fetchOlder,
  absorbOlder,
}: {
  store: ViewStore<S>;
  merge: Merge<TItem>;
  /** The latest tail window, when loaded. */
  tail: TPage | undefined;
  fetchOlder: (before: string) => Promise<TPage>;
  /** Folds a fetched older page into the view (extras such as counts ride along). */
  absorbOlder: (state: S, page: TPage) => S;
}) {
  const state = useViewState(store);
  const scroller = useRef<HTMLDivElement>(null);
  const anchor = useRef<{ height: number; top: number } | undefined>(undefined);
  const items = useMemo(() => merge(state.items, tail?.items ?? []), [merge, state.items, tail]);
  const history = state.cursor ?? tail?.history;

  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node || !anchor.current) {
      return;
    }

    node.scrollTop = anchor.current.top + node.scrollHeight - anchor.current.height;
    anchor.current = undefined;
  }, [state.olderVersion]);

  async function loadOlder() {
    const current = store.get();
    const before = (current.cursor ?? tail?.history)?.before;
    if (!before || current.busy) {
      return;
    }

    if (scroller.current) {
      anchor.current = { height: scroller.current.scrollHeight, top: scroller.current.scrollTop };
    }

    store.update((value) => ({ ...value, busy: true, error: false }));
    try {
      const page = await fetchOlder(before);
      store.update((value) => absorbOlder(value, page));
    } catch {
      anchor.current = undefined;
      store.update((value) => ({ ...value, busy: false, error: true }));
    }
  }

  const maybeLoadOlder = useAutoLoadOlder({
    scroller,
    hasOlder: history?.hasOlder ?? false,
    busy: state.busy,
    error: state.error,
    loadOlder,
    itemsVersion: items,
  });

  return { state, items, scroller, loadOlder, maybeLoadOlder };
}

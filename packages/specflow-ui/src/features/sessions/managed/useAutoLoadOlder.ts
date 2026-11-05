import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useReaderScrollUp } from './useReaderScrollUp';

// "Near the top" as `ManagedSession.tsx`'s conversation scroller already applies it: not literally
// `scrollTop === 0`, a threshold reached shortly before it so the
// next page is ready before the user hits the physical edge.
const NEAR_TOP_PX = 200;

/** A page is productive when it makes the scroller's content at least this much taller: the
 * height of the smallest row the list renders (a one-line timeline entry), so "less than about
 * one row" is "nothing the reader could see was added". A page that merges into an existing
 * burst row, or whose entries a filter or search hides, adds nothing. */
const MIN_PRODUCTIVE_GROWTH_PX = 32;

/** Consecutive unproductive pages after which auto-loading stops and the reader decides. */
const MAX_UNPRODUCTIVE_PAGES = 3;

/**
 * Whether the older pages being loaded add anything to the list. The merged item list is not what
 * is on screen (a filter or search hides items, a long run of completed tools collapses into one
 * row), so growth is measured where it shows: the scroller's content height right before a page is
 * requested and in the commit that merges it (`olderVersion`). `stopped` turns true after
 * `MAX_UNPRODUCTIVE_PAGES` such pages in a row, and false again on `reset`.
 */
function useOlderPageYield(scroller: { current: HTMLElement | null }, olderVersion: number) {
  const startHeight = useRef<number | undefined>(undefined);
  const unproductive = useRef(0);
  const [stopped, setStopped] = useState(false);

  useLayoutEffect(() => {
    const node = scroller.current;
    const start = startHeight.current;
    startHeight.current = undefined;
    if (!node || start === undefined) {
      return;
    }

    unproductive.current =
      node.scrollHeight - start < MIN_PRODUCTIVE_GROWTH_PX ? unproductive.current + 1 : 0;
    setStopped(unproductive.current >= MAX_UNPRODUCTIVE_PAGES);
    // The scroller is a ref; only a merged page (a new `olderVersion`) is measured.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [olderVersion]);

  const begin = () => {
    startHeight.current = scroller.current?.scrollHeight;
  };

  const reset = useCallback(() => {
    unproductive.current = 0;
    setStopped(false);
  }, []);

  return { stopped, begin, reset, isStopped: () => unproductive.current >= MAX_UNPRODUCTIVE_PAGES };
}

/** Scroll-triggered auto-loading of older Work/ToolAction pages, replacing the old manual
 * "Load older" button, with the same
 * mechanism `ManagedSession.tsx`'s own conversation scroller uses for older messages:
 * `maybeLoadOlder` is called both from the scroller's own `onScroll` handler (interactive scroll)
 * and from a `useLayoutEffect` that re-checks after every items/busy/error change, so a page that
 * was just prepended and still leaves the scroller near the top keeps loading until
 * `hasOlder` is false, and a short Work/Actions list that never overflows (no scrollbar to
 * drive) still pages in its older history once mounted. Stops entirely on `error` — the caller
 * keeps a manual Retry action instead of looping a failing request.
 *
 * It continues only while it is productive (`useOlderPageYield`): after
 * `MAX_UNPRODUCTIVE_PAGES` pages in a row that added no visible row it stops and `stalled` is true
 * (while older history remains), for the caller to offer `loadMore`. A click on it, a change of
 * `resetKey` (the filter or search) and a reader's upward scroll gesture start counting again.
 */
export function useAutoLoadOlder({
  scroller,
  hasOlder,
  busy,
  error,
  loadOlder,
  itemsVersion,
  olderVersion,
  resetKey,
}: {
  scroller: { current: HTMLDivElement | null };
  hasOlder: boolean;
  busy: boolean;
  error: boolean;
  /** Requests the next older page; `begin` must be called by it before it changes anything. */
  loadOlder: (begin: () => void) => void | Promise<void>;
  itemsVersion: unknown;
  olderVersion: number;
  resetKey: unknown;
}) {
  const yielded = useOlderPageYield(scroller, olderVersion);
  const { reset } = yielded;

  function load() {
    void loadOlder(yielded.begin);
  }

  function maybeLoadOlder(node: HTMLDivElement) {
    if (!hasOlder || busy || error || yielded.isStopped()) {
      return;
    }

    if (node.scrollTop < NEAR_TOP_PX) {
      load();
    }
  }

  // A new filter or search starts a new look-through of the history.
  useLayoutEffect(() => {
    reset();
  }, [resetKey, reset]);
  useReaderScrollUp(scroller, reset);

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
  }, [itemsVersion, hasOlder, busy, error, yielded.stopped, resetKey]);

  return {
    maybeLoadOlder,
    stalled: yielded.stopped && hasOlder,
    /** The reader's explicit request for the next batch. */
    loadMore: () => {
      reset();
      load();
    },
  };
}

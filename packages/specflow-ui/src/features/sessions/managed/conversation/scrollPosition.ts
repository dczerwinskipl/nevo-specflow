/**
 * The conversation's scroll-position policy, as pure decisions over measured geometry. The reader
 * is either FOLLOWING the latest message (every change keeps the view pinned to the bottom) or
 * READING somewhere above it (every change keeps the entry they were reading where they were
 * reading it). `useConversationScroll` owns the one state and is the only code that applies these
 * decisions to the scroller.
 */

/** How close to the bottom still counts as following the latest message. */
export const FOLLOW_THRESHOLD_PX = 80;

export interface ScrollGeometry {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

export const maxScrollTop = (geometry: ScrollGeometry) =>
  Math.max(0, geometry.scrollHeight - geometry.clientHeight);

export const isAtLatest = (geometry: ScrollGeometry) =>
  maxScrollTop(geometry) - geometry.scrollTop <= FOLLOW_THRESHOLD_PX;

/**
 * What a `scroll` event means for the mode, given the `scrollTop` the policy last knew. Landing at
 * the latest message always resumes following. Otherwise only a move UP that the reader made starts
 * reading — the one way a reader leaves the latest message. A scroll that did not move the view up
 * (one handled before the policy re-pinned a re-wrapped, taller conversation) keeps the mode, and so
 * does a move up the browser made while re-laying the scroller out (`layoutInduced`: a scroll range
 * that shrank for a moment and clamped `scrollTop`).
 */
export function followingAfterScroll(
  following: boolean,
  geometry: ScrollGeometry,
  previousScrollTop: number,
  layoutInduced: boolean,
): boolean {
  if (isAtLatest(geometry)) {
    return true;
  }

  const movedUp = geometry.scrollTop < previousScrollTop - 0.5;

  return movedUp && !layoutInduced ? false : following;
}

/**
 * The entry the reader is reading: the first one still visible below the scroller's top edge, by
 * its position in the scroller's content (`contentTop`, independent of scrolling) and the
 * `scrollTop` it was seen at.
 */
export interface ReadingAnchor {
  id: string;
  contentTop: number;
  scrollTop: number;
}

/**
 * Where to scroll so the anchored entry keeps its place. On the scroller it was taken on only the
 * entry's own movement in the content is compensated, so the reader's own scrolling since then is
 * kept; on a different scroller (the layout swapped the scroll owner) the entry returns to the same
 * distance from the scroller's top edge.
 */
export function anchoredScrollTop(
  anchor: ReadingAnchor,
  now: { contentTop: number; geometry: ScrollGeometry },
  sameScroller: boolean,
): number {
  const target = sameScroller
    ? now.geometry.scrollTop + (now.contentTop - anchor.contentTop)
    : now.contentTop - (anchor.contentTop - anchor.scrollTop);

  return Math.min(maxScrollTop(now.geometry), Math.max(0, target));
}

/**
 * Index of the first of `count` vertically stacked items (in document order) whose bottom edge is
 * below `top`, or `count` when none is.
 */
export function firstBelow(count: number, bottomOf: (index: number) => number, top: number) {
  let low = 0;
  let high = count;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (bottomOf(middle) > top) {
      high = middle;
    } else {
      low = middle + 1;
    }
  }

  return low;
}

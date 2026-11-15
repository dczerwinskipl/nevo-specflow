import { useLayoutEffect, useState } from 'react';

/**
 * How far below the scroller's top the bar already counts as stuck: it takes its stuck surface a
 * few pixels before it docks, so a scroll step that docks it does not show the rows through it.
 */
export const stuckEarlyPx = 8;

/** Whether the sentinel sits above the root's top edge (less the early switch): the bar is docked. */
function above(sentinel: DOMRectReadOnly, rootTop: number) {
  return sentinel.top < rootTop + stuckEarlyPx;
}

/**
 * Whether a `position: sticky; top: 0` element is docked at the top of its scroller. The element
 * renders the returned sentinel (an absolutely positioned 1 px box at its own top, outside the
 * flow); the sentinel is observed in `root`, the scroll viewport, and the element is stuck while
 * the sentinel is above the root's top. The position is also read once when the observation
 * starts, so a scroller that opens already scrolled starts stuck.
 */
export function useStuck(root: HTMLElement | null) {
  const [sentinel, sentinelRef] = useState<HTMLElement | null>(null);
  const [stuck, setStuck] = useState(false);

  // An observer is the external system; the first read is before paint.
  useLayoutEffect(() => {
    if (!root || !sentinel) {
      return;
    }

    setStuck(above(sentinel.getBoundingClientRect(), root.getBoundingClientRect().top));
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries.at(-1);
        if (entry?.rootBounds) {
          // `rootBounds` already has the early switch subtracted.
          setStuck(entry.boundingClientRect.top < entry.rootBounds.top);
        }
      },
      { root, rootMargin: `-${stuckEarlyPx}px 0px 0px 0px`, threshold: [0, 1] },
    );
    observer.observe(sentinel);

    return () => observer.disconnect();
  }, [root, sentinel]);

  return { sentinelRef, stuck: stuck && root !== null && sentinel !== null };
}

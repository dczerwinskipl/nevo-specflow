import { useEffect, useRef } from 'react';

/** How long after a resize a `scroll` event is still attributed to the resize's layout shift. */
const LAYOUT_SETTLE_MS = 200;

/**
 * Tells a `scroll` event the reader caused apart from one the browser caused while re-laying the
 * scroller out: after the viewport (or the scroller's own box) resizes, scroll anchoring and
 * clamping move `scrollTop` and dispatch ordinary `scroll` events that carry no reading intent.
 * Treating such an event as "the reader scrolled away" makes a conversation that was pinned to the
 * bottom stop following it for good (live-traced: 430 -> 375px left the last message 160px short of
 * the bottom, indefinitely, on about two runs in three).
 *
 * `isLayoutInduced()` is true when the scroller's client box differs from the last one seen (by a
 * scroll event or by the scroller's `ResizeObserver`), or a resize (window, or the scroller's own
 * `ResizeObserver`) happened within `LAYOUT_SETTLE_MS`. The caller then refuses to ENTER the away state from that event (leaving it —
 * landing back near the bottom — is always honoured). Nothing here looks at content growth, so a
 * reader who scrolls up while an answer streams in is never mistaken for a layout shift.
 */
export function useLayoutInducedScroll(scroller: HTMLElement | null): () => boolean {
  const resizedAt = useRef(Number.NEGATIVE_INFINITY);
  const clientBox = useRef<{ width: number; height: number } | undefined>(undefined);

  useEffect(() => {
    if (!scroller) {
      return undefined;
    }

    const mark = () => {
      resizedAt.current = performance.now();
    };

    clientBox.current = { width: scroller.clientWidth, height: scroller.clientHeight };
    window.addEventListener('resize', mark);
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      let first = true;
      observer = new ResizeObserver(() => {
        // The initial notification only reports the box the effect already recorded.
        if (first) {
          first = false;

          return;
        }

        // Records the new box too: a later scroll event (the reader's) must not be mistaken for the
        // one that first observes this resize.
        clientBox.current = { width: scroller.clientWidth, height: scroller.clientHeight };
        mark();
      });
      observer.observe(scroller);
    }

    return () => {
      window.removeEventListener('resize', mark);
      observer?.disconnect();
    };
  }, [scroller]);

  return () => {
    if (!scroller) {
      return false;
    }

    const previous = clientBox.current;
    clientBox.current = { width: scroller.clientWidth, height: scroller.clientHeight };

    return (
      (previous !== undefined &&
        (previous.width !== scroller.clientWidth || previous.height !== scroller.clientHeight)) ||
      performance.now() - resizedAt.current < LAYOUT_SETTLE_MS
    );
  };
}

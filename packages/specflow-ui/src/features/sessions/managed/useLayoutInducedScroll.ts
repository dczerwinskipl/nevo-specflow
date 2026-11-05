import { useEffect, useRef } from 'react';

/** How long after a resize a scroll no reader input claims is attributed to the resize's layout. */
const LAYOUT_SETTLE_MS = 200;

/** Keys that move a scroller's view up when no editable control consumes them. */
const UP_KEYS = new Set(['ArrowUp', 'PageUp', 'Home']);

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.matches('input, textarea, select'));

/**
 * Tells a `scroll` event the reader caused apart from one the browser caused while re-laying the
 * scroller out. After the viewport (or the scroller's own box) resizes, the scroll range can shrink
 * for a moment and clamp `scrollTop` up, dispatching ordinary `scroll` events that carry no reading
 * intent; treating them as "the reader scrolled away" makes a conversation pinned to the bottom stop
 * following it for good (live-traced: 430 -> 375px left the last message 160px short of the bottom,
 * indefinitely, on about two runs in three).
 *
 * The reader's own gesture is recognised by its input, however recently the layout changed: a wheel
 * turned up, a touch drag pulling the content down, an upward scrolling key outside an editable
 * control, or the scroller's own scrollbar held down. The browser delivers the scroll such input
 * causes with the next frame, so the input claims every scroll until the second frame after it (a
 * held scrollbar for as long as it is held). Only a scroll no input claims is judged by the layout:
 * `isLayoutInduced()` is true when the scroller's client box differs from the last one seen (by a
 * scroll event or by the scroller's `ResizeObserver`), or a resize (window, or the scroller's own
 * `ResizeObserver`) happened within `LAYOUT_SETTLE_MS`. The caller then refuses to ENTER the away
 * state from it (leaving it — landing back near the bottom — is always honoured). Nothing here looks
 * at content growth, so a reader who scrolls up while an answer streams in is never mistaken for a
 * layout shift.
 */
export function useLayoutInducedScroll(scroller: HTMLElement | null): () => boolean {
  const resizedAt = useRef(Number.NEGATIVE_INFINITY);
  const clientBox = useRef<{ width: number; height: number } | undefined>(undefined);
  const readerInput = useRef(false);
  const scrollbarHeld = useRef(false);

  useEffect(() => {
    if (!scroller) {
      return undefined;
    }

    const mark = () => {
      resizedAt.current = performance.now();
    };

    let expiry = 0;
    const claimNextScroll = () => {
      readerInput.current = true;
      cancelAnimationFrame(expiry);
      expiry = requestAnimationFrame(() => {
        expiry = requestAnimationFrame(() => {
          readerInput.current = false;
        });
      });
    };

    const wheel = (event: WheelEvent) => {
      if (event.deltaY < 0) {
        claimNextScroll();
      }
    };

    let touchY: number | undefined;
    const touchStart = (event: TouchEvent) => {
      touchY = event.touches[0]?.clientY;
    };

    // A finger moving down drags the content down: the view moves up.
    const touchMove = (event: TouchEvent) => {
      const y = event.touches[0]?.clientY;
      if (y !== undefined && touchY !== undefined && y > touchY) {
        claimNextScroll();
      }

      touchY = y;
    };

    const key = (event: KeyboardEvent) => {
      const up = UP_KEYS.has(event.key) || (event.key === ' ' && event.shiftKey);
      if (up && !isEditable(event.target)) {
        claimNextScroll();
      }
    };

    // Only a press on the scroller itself (its scrollbar): a press on a control inside the
    // conversation (opening Work, which re-lays the scroller out) is not a scrolling gesture.
    const pointerDown = (event: PointerEvent) => {
      if (event.target === scroller) {
        scrollbarHeld.current = true;
      }
    };

    const pointerUp = () => {
      scrollbarHeld.current = false;
    };

    clientBox.current = { width: scroller.clientWidth, height: scroller.clientHeight };
    window.addEventListener('resize', mark);
    scroller.addEventListener('wheel', wheel, { passive: true });
    scroller.addEventListener('touchstart', touchStart, { passive: true });
    scroller.addEventListener('touchmove', touchMove, { passive: true });
    scroller.addEventListener('keydown', key);
    scroller.addEventListener('pointerdown', pointerDown);
    window.addEventListener('pointerup', pointerUp);
    window.addEventListener('pointercancel', pointerUp);
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
      cancelAnimationFrame(expiry);
      readerInput.current = false;
      scrollbarHeld.current = false;
      window.removeEventListener('resize', mark);
      scroller.removeEventListener('wheel', wheel);
      scroller.removeEventListener('touchstart', touchStart);
      scroller.removeEventListener('touchmove', touchMove);
      scroller.removeEventListener('keydown', key);
      scroller.removeEventListener('pointerdown', pointerDown);
      window.removeEventListener('pointerup', pointerUp);
      window.removeEventListener('pointercancel', pointerUp);
      observer?.disconnect();
    };
  }, [scroller]);

  return () => {
    if (!scroller) {
      return false;
    }

    const previous = clientBox.current;
    clientBox.current = { width: scroller.clientWidth, height: scroller.clientHeight };
    if (readerInput.current || scrollbarHeld.current) {
      return false;
    }

    return (
      (previous !== undefined &&
        (previous.width !== scroller.clientWidth || previous.height !== scroller.clientHeight)) ||
      performance.now() - resizedAt.current < LAYOUT_SETTLE_MS
    );
  };
}

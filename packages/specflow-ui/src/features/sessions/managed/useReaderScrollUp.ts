import { useEffect } from 'react';

/** Keys that move a scroller's view up when no editable control consumes them. */
const UP_KEYS = new Set(['ArrowUp', 'PageUp', 'Home']);

const isEditable = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable || target.matches('input, textarea, select'));

/**
 * Calls `onScrollUp` when the reader asks the scroller to move up: a wheel turned up, a touch drag
 * pulling the content down, or an upward scrolling key outside an editable control. It listens to
 * the input, not to `scrollTop`, so it also fires at the very top edge (where no `scroll` event
 * can follow) and is never triggered by a scroll the layout caused (an anchor restored after an
 * older page, a resize). `onScrollUp` should be stable (it re-subscribes when it changes).
 */
export function useReaderScrollUp(
  scroller: { current: HTMLElement | null },
  onScrollUp: () => void,
) {
  useEffect(() => {
    const node = scroller.current;
    if (!node) {
      return undefined;
    }

    const wheel = (event: WheelEvent) => {
      if (event.deltaY < 0) {
        onScrollUp();
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
        onScrollUp();
      }

      touchY = y;
    };

    const key = (event: KeyboardEvent) => {
      const up = UP_KEYS.has(event.key) || (event.key === ' ' && event.shiftKey);
      if (up && !isEditable(event.target)) {
        onScrollUp();
      }
    };

    node.addEventListener('wheel', wheel, { passive: true });
    node.addEventListener('touchstart', touchStart, { passive: true });
    node.addEventListener('touchmove', touchMove, { passive: true });
    node.addEventListener('keydown', key);

    return () => {
      node.removeEventListener('wheel', wheel);
      node.removeEventListener('touchstart', touchStart);
      node.removeEventListener('touchmove', touchMove);
      node.removeEventListener('keydown', key);
    };
  }, [scroller, onScrollUp]);
}

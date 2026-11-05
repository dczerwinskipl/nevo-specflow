import { useCallback, useLayoutEffect, useRef } from 'react';
import { readHistoryAnchor, restoreHistoryAnchor, type HistoryAnchor } from './pagedHistoryAnchor';

/**
 * The single owner of a paged history scroller's position (the Work and Actions screens): the entry
 * the reader is reading (`pagedHistoryAnchor.ts`), and every `scrollTop` write that keeps it in
 * place. Nothing else writes `scrollTop`.
 *
 * Every change goes through one `apply`: an older page landing (a commit of the screen,
 * `layoutChanged`), content growing or shrinking by itself after it rendered (a ToolAction's
 * parameters or response arriving, a long Thinking's remaining text, a disclosure animating), the
 * scroller resizing, and the reader's own scrolling. `apply` first moves the view by however far the
 * anchored entry moved in the content since the anchor was read — never undoing the reader's own
 * movement, which is not the entry's — and then reads the anchor again.
 *
 * Only a move the policy did not make chooses a new entry to read: a `scroll` event finding the view
 * away from where the policy last left it is the reader's (or the browser clamping a shrunk range).
 * Every other `apply` keeps reading the same entry, so content the policy brought into view above
 * it (an older page, a response arriving) never becomes the anchor. A `scroll` event delivered after
 * content grew but before that growth was applied compensates the growth before anything is re-read,
 * so the anchor is never taken from content that just moved.
 *
 * The browser's own scroll anchoring is switched off on the scroller, so the browser and this
 * policy never both correct the same change (Chromium corrected late Actions content only partly,
 * and anchors nothing at the top edge, where an older page must still land under the reader).
 */
export function usePagedHistoryScroll(
  scroller: { current: HTMLElement | null },
  /** The element holding the scroller's content; its size changes are the content's. */
  content: { current: HTMLElement | null },
) {
  const anchor = useRef<HistoryAnchor | undefined>(undefined);
  // The `scrollTop` the policy last left the scroller at (after its own write, or the reader's move).
  const known = useRef<number | undefined>(undefined);

  const apply = useCallback(
    (readerMayHaveMoved = false) => {
      const node = scroller.current;
      if (!node) {
        return;
      }

      const readerMoved =
        readerMayHaveMoved &&
        (known.current === undefined || Math.abs(node.scrollTop - known.current) >= 1);
      const kept = anchor.current ? restoreHistoryAnchor(node, anchor.current) : undefined;
      anchor.current = readHistoryAnchor(node, readerMoved ? undefined : kept);
      known.current = node.scrollTop;
    },
    [scroller],
  );

  useLayoutEffect(() => {
    const node = scroller.current;
    if (!node) {
      return undefined;
    }

    const previousAnchoring = node.style.overflowAnchor;
    node.style.overflowAnchor = 'none';
    const scrolled = () => apply(true);
    const resized = () => apply();
    node.addEventListener('scroll', scrolled, { passive: true });
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(resized);
    observer?.observe(node);
    if (content.current) {
      observer?.observe(content.current);
    }

    apply();

    return () => {
      node.style.overflowAnchor = previousAnchoring;
      node.removeEventListener('scroll', scrolled);
      observer?.disconnect();
    };
  }, [apply, content, scroller]);

  const layoutChanged = useCallback(() => apply(), [apply]);

  return { layoutChanged };
}

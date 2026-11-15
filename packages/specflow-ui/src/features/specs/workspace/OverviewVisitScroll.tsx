import { useEffect, useLayoutEffect, useRef } from 'react';
import { useElementScrollRestoration, useRouterState } from '@tanstack/react-router';
import { useWorkspacePrimaryScroll } from '@nevo/ui';

/** The Overview's scroller as the router's scroll restoration knows it (`router.tsx`). */
export const overviewScrollRestorationId = 'specification-overview';

/** The reader's own input ends the re-apply below. */
const readerInput = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

/**
 * Narrow (the workspace owns Primary's scroll): names the Overview's scroller for the router's
 * scroll restoration, which remembers it per history entry (also across a reload). The router
 * restores on render; sections that load a moment later grow the page, so the remembered position
 * is applied again while the content grows, until the reader scrolls or presses a key; after that
 * input nothing re-applies it for the rest of this visit, even when late data re-renders the page. A visit
 * reached by a Back (a returning entry, or a navigation marked `specflowFocusTitle`) puts the focus
 * on the page title, so it does not drop to the document body.
 */
export function OverviewVisitScroll() {
  const scroller = useWorkspacePrimaryScroll();
  const remembered = useElementScrollRestoration({ id: overviewScrollRestorationId });
  const focusTitle = useRouterState({
    select: (state) => state.location.state.specflowFocusTitle === true,
  });
  const top = remembered?.scrollY;
  // One mount is one visit: once the reader acts, the visit's position is theirs.
  const readerActed = useRef(false);

  useLayoutEffect(() => {
    scroller?.setAttribute('data-scroll-restoration-id', overviewScrollRestorationId);
  }, [scroller]);

  useEffect(() => {
    if (!scroller) {
      return;
    }

    let observer: ResizeObserver | undefined;
    const stop = () => {
      readerActed.current = true;
      observer?.disconnect();
    };

    if (top !== undefined && !readerActed.current) {
      const apply = () => {
        scroller.scrollTop = top;
      };

      apply();
      observer = new ResizeObserver(apply);
      for (const child of scroller.children) {
        observer.observe(child);
      }

      for (const name of readerInput) {
        scroller.addEventListener(name, stop, { passive: true, once: true });
      }
    }

    const frame =
      top !== undefined || focusTitle
        ? requestAnimationFrame(() =>
            scroller
              .querySelector<HTMLElement>('[data-page-title]')
              ?.focus({ preventScroll: true }),
          )
        : 0;

    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      for (const name of readerInput) {
        scroller.removeEventListener(name, stop);
      }
    };
    // Only a new visit's remembered position or scroller re-applies; the focus flag belongs to it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scroller, top]);

  return null;
}

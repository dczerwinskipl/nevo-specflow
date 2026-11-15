import { useEffect } from 'react';
import { useRouterState } from '@tanstack/react-router';
import { useWorkspacePrimaryScroll } from '@nevo/ui';

/** How many Overview visits keep a scroll position; the oldest is forgotten first. */
const limit = 50;

/**
 * The Overview's scroll position by history entry, for this tab. The Overview unmounts when a
 * document is opened from it; a Back that steps back to that visit (`backByHistory`) remounts it
 * here, so it returns where it was left. A new push is a new entry and starts at the top.
 */
const positions = new Map<string, number>();

function remember(entry: string, top: number) {
  positions.delete(entry);
  positions.set(entry, top);
  if (positions.size > limit) {
    const oldest = positions.keys().next().value;
    if (oldest !== undefined) {
      positions.delete(oldest);
    }
  }
}

/** The reader's own input ends a restore. */
const readerInput = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

/** Test seam: forget every remembered visit. */
export function forgetOverviewVisits() {
  positions.clear();
}

/**
 * Narrow (the workspace owns Primary's scroll): restores the scroll of a returning Overview visit
 * and keeps it while reading. A visit reached by a Back (a returning entry, or a navigation marked
 * `specflowFocusTitle`) puts the focus on the page title, so it does not drop to the document body.
 */
export function OverviewVisitScroll() {
  const scroller = useWorkspacePrimaryScroll();
  const entry = useRouterState({ select: (state) => state.location.state.__TSR_key });
  const focusTitle = useRouterState({
    select: (state) => state.location.state.specflowFocusTitle === true,
  });

  useEffect(() => {
    if (!scroller || !entry) {
      return;
    }

    const remembered = positions.get(entry);
    // Restoring: the Overview's sections may still be growing (a cached read renders at once, a
    // section's own read a moment later), so the position is applied each frame until it holds on
    // two frames, the reader scrolls or presses a key, or about two seconds pass.
    let restoring = remembered !== undefined;
    let frame = 0;
    const stopRestoring = () => {
      restoring = false;
    };

    for (const name of readerInput) {
      scroller.addEventListener(name, stopRestoring, { passive: true, once: true });
    }

    const restore = (remaining: number, stable: number) => {
      frame = requestAnimationFrame(() => {
        if (!restoring || remembered === undefined) {
          return;
        }

        scroller.scrollTop = remembered;
        const next = Math.abs(scroller.scrollTop - remembered) < 1 ? stable + 1 : 0;
        if (next < 2 && remaining > 1) {
          restore(remaining - 1, next);
        } else {
          restoring = false;
        }
      });
    };

    if (remembered !== undefined) {
      scroller.scrollTop = remembered;
      restore(120, 0);
    }

    let focusFrame = 0;
    if (remembered !== undefined || focusTitle) {
      focusFrame = requestAnimationFrame(() =>
        scroller.querySelector<HTMLElement>('[data-page-title]')?.focus({ preventScroll: true }),
      );
    }

    // Only the reader's own scrolling counts: not the restore above, and not while a stacked
    // Secondary covers the Overview (it is inert then) and the workspace may move its scroll.
    const save = () => {
      if (!restoring && !scroller.closest('[inert], [aria-hidden="true"]')) {
        remember(entry, scroller.scrollTop);
      }
    };

    scroller.addEventListener('scroll', save, { passive: true });

    return () => {
      restoring = false;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(focusFrame);
      scroller.removeEventListener('scroll', save);
      for (const name of readerInput) {
        scroller.removeEventListener(name, stopRestoring);
      }
    };
    // Only a new visit (entry) or scroller restores; the focus flag belongs to that visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scroller, entry]);

  return null;
}

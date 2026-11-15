import { useLayoutEffect, useState } from 'react';
import { createEntryPositions } from '../article/readingPositions';

/** The pane's scroll of every reader history entry of this tab. */
const panePositions = createEntryPositions();

/** What stops a restore that is still waiting for its rows: the user moving the pane. */
const userInput = ['wheel', 'touchstart', 'keydown', 'pointerdown'] as const;

/**
 * The tree pane's scroll, kept per history entry: Back and Forward return the results (or the
 * tree) where they were scrolled for that entry. The rows of an entry may still be rendering (an
 * answer that loads again, the tree), so the position is set again as the content grows, until it
 * is reached or the user scrolls. An entry with no position yet (a push, a pick) keeps the pane
 * where it is. Returns the ref of the scroll viewport.
 */
export function usePaneScrollMemory(entry: string) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);

  // Before paint, so a restored entry never shows the previous entry's position first.
  useLayoutEffect(() => {
    if (!viewport) {
      return;
    }

    let pending = panePositions.get(entry);
    if (pending === undefined) {
      panePositions.set(entry, viewport.scrollTop);
    }

    const apply = () => {
      if (pending === undefined) {
        return;
      }

      viewport.scrollTop = pending;
      if (Math.abs(viewport.scrollTop - pending) < 1) {
        pending = undefined;
      }
    };

    const save = () => {
      if (pending === undefined) {
        panePositions.set(entry, viewport.scrollTop);
      }
    };

    const stop = () => {
      pending = undefined;
    };

    apply();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(apply);
    observer?.observe(viewport);
    if (viewport.firstElementChild) {
      observer?.observe(viewport.firstElementChild);
    }

    viewport.addEventListener('scroll', save, { passive: true });
    for (const type of userInput) {
      viewport.addEventListener(type, stop, { passive: true });
    }

    return () => {
      observer?.disconnect();
      viewport.removeEventListener('scroll', save);
      for (const type of userInput) {
        viewport.removeEventListener(type, stop);
      }
    };
  }, [viewport, entry]);

  return setViewport;
}

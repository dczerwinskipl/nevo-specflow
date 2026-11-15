import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { OutlineHeading } from './markdownOutline';

/** How far below the top of the panel a chosen heading comes to rest (px). */
const headingOffset = 16;
/** A heading this close below the panel's top already counts as the one being read (px). */
const currentThreshold = 48;

export interface GoToHeadingOptions {
  /** Chosen with a mouse or a finger: the heading takes focus without a ring. */
  readonly pointer?: boolean;
  /** Jump without the smooth scroll (entering a document at a section). */
  readonly instant?: boolean;
}

/**
 * Moving between the headings of a rendered document (`MarkdownDocument sourceLines`) in its scroll
 * `viewport`, one behaviour for every reading surface:
 * - `goTo` scrolls the heading to 16 px below the top (smoothly unless motion is reduced), focuses
 *   it (no ring after a pointer: `data-quiet-focus`, dropped by `DocumentReadingColumns`), tints it
 *   briefly and keeps it current until the reader scrolls by hand, so the marker neither walks
 *   through the sections the scroll passes nor yields to the end of the document. The move is
 *   announced like a user scroll (`wheel`, `scroll`), so reading-position trackers follow it.
 * - `measureActive` reads the heading being read: the chosen one, else the last section at the very
 *   end, else the last heading that reached the top.
 * - `activeLine` is that heading, kept current while `live` (a Contents column on screen, or a
 *   Contents sheet open) and set by `goTo` otherwise.
 */
export function useHeadingNavigation(
  viewport: HTMLElement | null,
  headings: readonly OutlineHeading[],
  { live }: { live: boolean },
) {
  const [activeLine, setActiveLine] = useState<number>();
  const pinned = useRef<number | undefined>(undefined);
  const headingElement = useCallback(
    (line: number) =>
      viewport?.querySelector<HTMLElement>(
        `:is(h1, h2, h3, h4, h5, h6)[data-source-line="${line}"]`,
      ) ?? null,
    [viewport],
  );

  useEffect(() => {
    if (!viewport) {
      return;
    }

    const release = () => {
      pinned.current = undefined;
    };

    // Reading on by hand ends the choice; scrolling done by the choice itself does not.
    const events = ['wheel', 'touchmove', 'keydown'] as const;
    for (const name of events) {
      viewport.addEventListener(name, release, { passive: true });
    }

    return () => {
      for (const name of events) {
        viewport.removeEventListener(name, release);
      }
    };
  }, [viewport]);

  const measureActive = useCallback(() => {
    if (!viewport) {
      return undefined;
    }

    if (pinned.current !== undefined) {
      return pinned.current;
    }

    // At the very end the last section is the one being read, even if its heading never reaches the top.
    const scrollable = viewport.scrollHeight - viewport.clientHeight > 2;
    if (scrollable && viewport.scrollTop + viewport.clientHeight >= viewport.scrollHeight - 2) {
      return headings.at(-1)?.line;
    }

    const top = viewport.getBoundingClientRect().top + currentThreshold;
    let current: number | undefined;
    for (const heading of headings) {
      const element = headingElement(heading.line);
      if (element && element.getBoundingClientRect().top <= top) {
        current = heading.line;
      }
    }

    return current ?? headings[0]?.line;
  }, [viewport, headings, headingElement]);

  // A layout effect: a sheet opened in this commit focuses its current entry a frame later, so the
  // measured line must be committed before then.
  useLayoutEffect(() => {
    if (!viewport || !live || headings.length === 0) {
      return;
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      setActiveLine(measureActive());
    };

    const schedule = () => {
      if (!frame) {
        frame = requestAnimationFrame(update);
      }
    };

    update();
    viewport.addEventListener('scroll', schedule, { passive: true });

    return () => {
      viewport.removeEventListener('scroll', schedule);
      if (frame) {
        cancelAnimationFrame(frame);
      }
    };
  }, [viewport, live, headings, measureActive]);

  /** Returns whether the heading was found. */
  const goTo = useCallback(
    (line: number, { pointer = false, instant = false }: GoToHeadingOptions = {}) => {
      const element = headingElement(line);
      if (!viewport || !element) {
        return false;
      }

      // A deliberate move: reading-position trackers follow it like a user scroll.
      viewport.dispatchEvent(new Event('wheel'));
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      viewport.scrollTo({
        top:
          viewport.scrollTop +
          element.getBoundingClientRect().top -
          viewport.getBoundingClientRect().top -
          headingOffset,
        behavior: reduced || instant ? 'auto' : 'smooth',
      });
      viewport.dispatchEvent(new Event('scroll'));
      element.tabIndex = -1;
      // After a pointer the heading's ring is dropped; after the keyboard the browser's own ring stays.
      viewport.querySelector('[data-quiet-focus]')?.removeAttribute('data-quiet-focus');
      element.setAttribute('data-quiet-focus', pointer ? 'pointer' : 'keyboard');
      // The tint fades by itself (Web Animations, no timer to clean up) unless motion is reduced.
      if (!reduced) {
        element.animate?.(
          [
            { backgroundColor: 'var(--color-surface-selected)' },
            { backgroundColor: 'transparent' },
          ],
          { duration: 600, easing: 'ease-out' },
        );
      }

      element.addEventListener('blur', () => element.removeAttribute('data-quiet-focus'), {
        once: true,
      });
      element.focus({ preventScroll: true });
      pinned.current = line;
      setActiveLine(line);

      return true;
    },
    [viewport, headingElement],
  );

  return { activeLine, goTo, measureActive };
}

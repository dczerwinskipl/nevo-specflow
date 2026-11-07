import { useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';

/**
 * Whether an element is at least `minWidth` CSS pixels wide: a container breakpoint for the cases a
 * CSS container query cannot express, where the DOM structure or order itself has to change with
 * the space (for example one column versus two independent columns with their own reading order).
 * Style-only changes belong in a container query, not here.
 *
 * Never paints the wrong arrangement: the first value is read in a layout effect, before the first
 * paint, and a crossing seen by the `ResizeObserver` is committed synchronously, before the browser
 * paints that layout. Widths that stay on the same side of the breakpoint cause no render.
 * `matches` is `false` until the element is attached (and during SSR).
 * Attach with the returned `setElement` callback ref.
 */
export function useContainerMinWidth<T extends HTMLElement = HTMLDivElement>(minWidth: number) {
  const [element, setElement] = useState<T | null>(null);
  const [matches, setMatches] = useState(false);

  useLayoutEffect(() => {
    if (!element) {
      return undefined;
    }

    const read = () => element.getBoundingClientRect().width >= minWidth;
    let current = read();
    setMatches(current);
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      const next = read();
      if (next !== current) {
        current = next;
        flushSync(() => setMatches(next));
      }
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [element, minWidth]);

  return { matches, setElement };
}

import { useLayoutEffect, useState } from 'react';
import { flushSync } from 'react-dom';

export interface ContainerMinWidthOptions {
  /**
   * Exit margin in CSS px: once matched, `matches` stays `true` until the width drops below
   * `minWidth - hysteresis`. Use it when the change itself can move the width by a few pixels
   * (a scrollbar appearing with the new content), so the arrangement cannot oscillate at the
   * breakpoint. Default `0`.
   */
  readonly hysteresis?: number;
}

/**
 * Whether an element is at least `minWidth` CSS pixels wide: a container breakpoint for the cases a
 * CSS container query cannot express, where the DOM structure or order itself has to change with
 * the space (for example one column versus two independent columns with their own reading order).
 * Style-only changes belong in a container query, not here.
 *
 * Never paints the wrong arrangement: the first value is read in a layout effect, before the first
 * paint, and a crossing seen by the `ResizeObserver` is committed synchronously, before the browser
 * paints that layout. Widths that stay on the same side of the breakpoint cause no render.
 *
 * Observe an element whose size the arrangement does not change, typically a zero-height,
 * full-width sentinel at the top of the container: observing the content itself would resize the
 * observed element on every crossing and raise "ResizeObserver loop completed with undelivered
 * notifications". Attach it with the returned `setElement` callback ref.
 *
 * `measured` is `false` until the first read (and during SSR, where `matches` stays `false`), so a
 * consumer can hold back the parts whose place depends on `matches` instead of mounting them in the
 * wrong arrangement first.
 */
export function useContainerMinWidth<T extends HTMLElement = HTMLDivElement>(
  minWidth: number,
  { hysteresis = 0 }: ContainerMinWidthOptions = {},
) {
  const [element, setElement] = useState<T | null>(null);
  const [state, setState] = useState({ matches: false, measured: false });

  useLayoutEffect(() => {
    if (!element) {
      return undefined;
    }

    const width = () => element.getBoundingClientRect().width;
    let current = width() >= minWidth;
    setState({ matches: current, measured: true });
    if (typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      const next = current ? width() >= minWidth - hysteresis : width() >= minWidth;
      if (next !== current) {
        current = next;
        flushSync(() => setState({ matches: next, measured: true }));
      }
    });
    observer.observe(element);

    return () => observer.disconnect();
  }, [element, minWidth, hysteresis]);

  return { ...state, setElement };
}

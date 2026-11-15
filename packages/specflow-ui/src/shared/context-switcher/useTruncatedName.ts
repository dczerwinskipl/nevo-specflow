import { useLayoutEffect, useState } from 'react';
import { fitMiddle, nameTruncation, type NameTruncation } from './nameTruncation';
import { textMeasurer } from './measureText';

interface Measured {
  readonly name: string;
  readonly text: string;
  readonly truncated: boolean;
}

export interface TruncatedName {
  /** Attach to the one-line name box: its width is the space the name may take. */
  readonly ref: (element: HTMLElement | null) => void;
  readonly mode: NameTruncation;
  /** What to render: the whole name, or (middle mode) the name cut to fit. */
  readonly text: string;
  /** The name does not show whole: only then does the trigger offer it in a tooltip. */
  readonly truncated: boolean;
}

/**
 * Fits a name on one line. Middle mode measures the name in the box's font and cuts it exactly
 * (`fitMiddle`); end mode leaves the cut to CSS and only reads whether it happened. Re-measured when
 * the box resizes and once web fonts are ready. Until measured (no layout yet, a closed drawer: a
 * width of 0) the whole name shows, clipped by CSS, and counts as not truncated.
 */
export function useTruncatedName(name: string): TruncatedName {
  const [element, ref] = useState<HTMLElement | null>(null);
  const mode = nameTruncation(name);
  const [measured, setMeasured] = useState<Measured | null>(null);

  useLayoutEffect(() => {
    if (!element) {
      return;
    }

    let disposed = false;
    const settle = (next: Measured | null) =>
      setMeasured((previous) =>
        previous?.name === next?.name &&
        previous?.text === next?.text &&
        previous?.truncated === next?.truncated
          ? previous
          : next,
      );
    const measure = () => {
      if (disposed) {
        return;
      }

      const available = element.getBoundingClientRect().width;
      if (available <= 0) {
        settle(null);

        return;
      }

      if (mode === 'end') {
        settle({ name, text: name, truncated: element.scrollWidth > element.clientWidth });

        return;
      }

      const width = textMeasurer(element);
      if (!width) {
        settle(null);

        return;
      }

      // Whole pixels: a sub-pixel overflow would add CSS's own ellipsis to the cut name.
      const text = fitMiddle(name, Math.floor(available), width);
      settle({ name, text, truncated: text !== name });
    };

    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(element);
    void document.fonts?.ready.then(measure);

    return () => {
      disposed = true;
      observer?.disconnect();
    };
  }, [element, name, mode]);

  const current = measured?.name === name ? measured : null;

  return { ref, mode, text: current?.text ?? name, truncated: current?.truncated ?? false };
}

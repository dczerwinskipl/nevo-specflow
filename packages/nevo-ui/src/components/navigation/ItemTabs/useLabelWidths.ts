import { useLayoutEffect, useState } from 'react';

const MEASURE_ATTRIBUTE = 'data-item-tabs-measure';

/** The attribute a measuring layer puts on each label span, keyed by the item id. */
export const measureAttribute = (id: string) => ({ [MEASURE_ATTRIBUTE]: id });

function sameWidths(a: Readonly<Record<string, number>>, b: Readonly<Record<string, number>>) {
  const keys = Object.keys(a);

  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
}

/**
 * Rendered label widths (px) of a hidden measuring layer, by item id: each tab is then exactly as
 * wide as its own text needs, in the real font. Re-measures when the labels change and once the
 * document's web fonts are ready (a fallback font has different widths). The width is the
 * unrounded layout width: `offsetWidth` rounds (down as well as up), which can leave a label
 * short of its text and truncated at a high device scale factor. Where nothing is laid out
 * (jsdom), every width reads 0 and the caller falls back to its estimate.
 */
export function useLabelWidths(signature: string) {
  const [layer, setLayer] = useState<HTMLElement | null>(null);
  const [widths, setWidths] = useState<Readonly<Record<string, number>>>({});

  useLayoutEffect(() => {
    if (!layer) {
      return;
    }

    let current = true;
    const measure = () => {
      if (!current) {
        return;
      }

      const next: Record<string, number> = {};
      for (const element of layer.querySelectorAll<HTMLElement>(`[${MEASURE_ATTRIBUTE}]`)) {
        next[element.getAttribute(MEASURE_ATTRIBUTE)!] = element.getBoundingClientRect().width;
      }

      setWidths((previous) => (sameWidths(previous, next) ? previous : next));
    };

    measure();
    void document.fonts?.ready.then(measure);

    return () => {
      current = false;
    };
  }, [layer, signature]);

  return { widths, setLayer };
}

/**
 * Keeps the entry the reader is reading in place when an older page is prepended to a paged
 * history list (the Work and Actions screens, `usePagedHistory`). The same principle as the
 * conversation's scroll owner (`conversation/scrollPosition.ts`): anchor a concrete entry by its
 * distance from the scroller's top edge, never the whole list's height delta — that delta also
 * holds every other change made in the meantime (a disclosure expanded or collapsed, a search
 * narrowing the list, a tool's content arriving), which would move the entry being read by that
 * much as well.
 *
 * The anchor is read immediately before the commit that merges the page, so it describes what
 * the reader sees at that moment: every earlier change (including the reader's own scrolling) is
 * already part of it, and only the page itself is compensated.
 */

const ENTRY_ATTRIBUTE = 'data-history-entry';

/** Marks one entry of a paged history list with its stable identity (its Work or ToolAction id). */
export const historyEntry = (id: string) => ({ 'data-history-entry': id });

/** Every rendered entry's distance from the scroller's top edge, in document order, and which one
 * the reader is reading: the first still visible below that edge. */
export interface HistoryAnchor {
  entries: readonly { id: string; offset: number }[];
  reading: number;
}

function renderedEntries(scroller: HTMLElement) {
  return [...scroller.querySelectorAll<HTMLElement>(`[${ENTRY_ATTRIBUTE}]`)].flatMap((element) => {
    const id = element.getAttribute(ENTRY_ATTRIBUTE);

    return id ? [{ id, element }] : [];
  });
}

export function readHistoryAnchor(scroller: HTMLElement): HistoryAnchor | undefined {
  const top = scroller.getBoundingClientRect().top;
  const measured = renderedEntries(scroller).map(({ id, element }) => {
    const rect = element.getBoundingClientRect();

    return { id, offset: rect.top - top, bottom: rect.bottom - top };
  });
  if (measured.length === 0) {
    return undefined;
  }

  const reading = measured.findIndex((entry) => entry.bottom > 0);

  return {
    entries: measured.map(({ id, offset }) => ({ id, offset })),
    reading: reading === -1 ? measured.length - 1 : reading,
  };
}

/** Indices of `count` entries ordered by distance from `from`, the following one first on a tie. */
export function nearestFirst(count: number, from: number): number[] {
  const order: number[] = [];
  for (let distance = 0; order.length < count; distance += 1) {
    for (const index of distance === 0 ? [from] : [from + distance, from - distance]) {
      if (index >= 0 && index < count) {
        order.push(index);
      }
    }
  }

  return order;
}

/**
 * Scrolls so the anchored entry is back at its distance from the top edge. When the merge itself
 * replaced that entry (an older page joining it into a different group), the nearest entry that
 * is still rendered keeps its place instead — preferring the one after it, which the reader was
 * about to read. With none left, the position is left as the browser laid it out.
 */
export function restoreHistoryAnchor(scroller: HTMLElement, anchor: HistoryAnchor) {
  const rendered = new Map(renderedEntries(scroller).map(({ id, element }) => [id, element]));
  for (const index of nearestFirst(anchor.entries.length, anchor.reading)) {
    const { id, offset } = anchor.entries[index]!;
    const element = rendered.get(id);
    if (element) {
      const shift =
        element.getBoundingClientRect().top - scroller.getBoundingClientRect().top - offset;
      if (Math.abs(shift) >= 0.5) {
        scroller.scrollTop += shift;
      }

      return;
    }
  }
}

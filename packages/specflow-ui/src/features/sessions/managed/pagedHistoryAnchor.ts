/**
 * The reading position of a paged history list (the Work and Actions screens): the entry the reader
 * is reading and where it is. The same principle as the conversation's scroll owner
 * (`conversation/scrollPosition.ts`): anchor a concrete entry, never the whole list's height delta —
 * that delta also holds every other change (a disclosure expanded or collapsed, a search narrowing
 * the list, a tool's content arriving), which would move the entry being read by that much as well.
 *
 * `usePagedHistoryScroll` records the anchor after every change it applies and every scroll, and
 * restores it on the next change, so only the change since then is compensated.
 */

const ENTRY_ATTRIBUTE = 'data-history-entry';
const LIST_ATTRIBUTE = 'data-history-list';

/** Marks one entry of a paged history list with its stable identity (its Work or ToolAction id). */
export const historyEntry = (id: string) => ({ 'data-history-entry': id });

/** Marks the element holding a history list's entries, below the list's own controls (filter,
 * loading indicator, older-history button, notices). */
export const historyList = { 'data-history-list': '' };

/** Every rendered entry's distance from the scroller's top edge, in document order, which one the
 * reader is reading, and the `scrollTop` they were seen at. At the top edge also where the list
 * starts in the scroller's content (`listTop`). */
export interface HistoryAnchor {
  entries: readonly { id: string; offset: number }[];
  reading: number;
  scrollTop: number;
  listTop?: number;
}

/** How much of an entry must still show below the top edge for the reader to be reading it: one
 * line of text. An entry scrolled past but for its last few pixels is not what the reader reads —
 * the one under it is, and it must not move when the one above grows. */
const READABLE_PX = 24;

function renderedEntries(scroller: HTMLElement) {
  return [...scroller.querySelectorAll<HTMLElement>(`[${ENTRY_ATTRIBUTE}]`)].flatMap((element) => {
    const id = element.getAttribute(ENTRY_ATTRIBUTE);

    return id ? [{ id, element }] : [];
  });
}

/** Where the list starts in the scroller's content, independent of scrolling. */
function listTopOf(scroller: HTMLElement) {
  const list = scroller.querySelector<HTMLElement>(`[${LIST_ATTRIBUTE}]`);

  return list
    ? list.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    : undefined;
}

/**
 * Measures the anchor. The entry being read is `keep` while it is rendered — a change the policy
 * applied leaves the reader reading what they were reading, even when it brought other entries
 * into view above it — and otherwise (the reader scrolled, or that entry is gone) the first entry
 * with at least a line still visible below the top edge.
 */
export function readHistoryAnchor(scroller: HTMLElement, keep?: string): HistoryAnchor | undefined {
  const top = scroller.getBoundingClientRect().top;
  const measured = renderedEntries(scroller).map(({ id, element }) => {
    const rect = element.getBoundingClientRect();

    return { id, offset: rect.top - top, bottom: rect.bottom - top };
  });
  if (measured.length === 0) {
    return undefined;
  }

  const kept = keep === undefined ? -1 : measured.findIndex((entry) => entry.id === keep);
  const reading = kept !== -1 ? kept : measured.findIndex((entry) => entry.bottom > READABLE_PX);

  return {
    entries: measured.map(({ id, offset }) => ({ id, offset })),
    reading: reading === -1 ? measured.length - 1 : reading,
    scrollTop: scroller.scrollTop,
    listTop: scroller.scrollTop < 0.5 ? listTopOf(scroller) : undefined,
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
 * Scrolls by however far the anchored entry moved in the scroller's content since the anchor was
 * read, so it is back where the reader saw it — plus any scrolling of the reader's own since then,
 * which is kept. Returns the entry it kept in place. When that entry is gone (an older page joined it into a different group, a search
 * hid it), the nearest entry that is still rendered keeps its place instead — preferring the one
 * after it, which the reader was about to read. With none left, the position is left alone.
 *
 * At the top edge the list's own controls growing above it (the loading indicator, a failure
 * notice, the older-history button) push it down instead, so a reader at the top sees them; an
 * older page joining the list, and controls going away, still keep the entry in place.
 */
export function restoreHistoryAnchor(
  scroller: HTMLElement,
  anchor: HistoryAnchor,
): string | undefined {
  const rendered = new Map(renderedEntries(scroller).map(({ id, element }) => [id, element]));
  for (const index of nearestFirst(anchor.entries.length, anchor.reading)) {
    const { id, offset } = anchor.entries[index]!;
    const element = rendered.get(id);
    if (element) {
      const top = element.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      const moved = top + scroller.scrollTop - (offset + anchor.scrollTop);
      const listTop = anchor.listTop === undefined ? undefined : listTopOf(scroller);
      const controlsGrew =
        anchor.listTop === undefined || listTop === undefined
          ? 0
          : Math.max(0, listTop - anchor.listTop);
      const shift = moved - controlsGrew;
      // Sub-pixel noise is not a move: writing it would interrupt the reader's smooth scrolling.
      if (Math.abs(shift) >= 1) {
        scroller.scrollTop += shift;
      }

      return id;
    }
  }

  return undefined;
}

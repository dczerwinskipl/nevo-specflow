// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { nearestFirst, readHistoryAnchor, restoreHistoryAnchor } from './pagedHistoryAnchor';

/** A scroller of `ids` entries, `ROW` px each, laid out by `scrollTop` (jsdom has no layout). */
const ROW = 100;

function scrollerWith(ids: string[]) {
  const scroller = document.createElement('div');
  scroller.className = 'scroller';
  let scrollTop = 0;
  Object.defineProperty(scroller, 'scrollTop', {
    get: () => scrollTop,
    set: (value: number) => {
      scrollTop = value;
    },
  });
  const render = (next: string[]) => {
    scroller.replaceChildren(
      ...next.map((id) => {
        const entry = document.createElement('div');
        entry.setAttribute('data-history-entry', id);

        return entry;
      }),
    );
  };

  render(ids);
  document.body.append(scroller);

  return { scroller, render };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

function layOut() {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    const scroller = this.closest<HTMLElement>('.scroller');
    const index = scroller && this !== scroller ? [...scroller.children].indexOf(this) : -1;
    const top = index < 0 ? 0 : index * ROW - scroller!.scrollTop;

    return { top, bottom: index < 0 ? 0 : top + ROW } as DOMRect;
  });
}

describe('nearestFirst', () => {
  it('orders by distance from the read entry, the following one first', () => {
    expect(nearestFirst(5, 2)).toEqual([2, 3, 1, 4, 0]);
    expect(nearestFirst(3, 0)).toEqual([0, 1, 2]);
    expect(nearestFirst(3, 2)).toEqual([2, 1, 0]);
  });
});

describe('older page anchoring', () => {
  it('reads the first entry still visible below the top edge', () => {
    layOut();
    const { scroller } = scrollerWith(['a', 'b', 'c']);
    scroller.scrollTop = 150;

    const anchor = readHistoryAnchor(scroller)!;

    expect(anchor.entries[anchor.reading]).toEqual({ id: 'b', offset: -50 });
  });

  it('keeps the read entry where it was when a page is prepended above it', () => {
    layOut();
    const { scroller, render } = scrollerWith(['a', 'b', 'c']);
    scroller.scrollTop = 150;
    const anchor = readHistoryAnchor(scroller)!;

    render(['old-1', 'old-2', 'a', 'b', 'c']);
    restoreHistoryAnchor(scroller, anchor);

    expect(scroller.scrollTop).toBe(350);
  });

  it('keeps the nearest following entry in place when the merge replaced the read one', () => {
    layOut();
    const { scroller, render } = scrollerWith(['a', 'b', 'c', 'd']);
    scroller.scrollTop = 150;
    const anchor = readHistoryAnchor(scroller)!;

    // `b` was joined into a new group by the older page: `c` (at 50px) is the one kept.
    render(['old-1', 'old-2', 'a', 'group', 'c', 'd']);
    restoreHistoryAnchor(scroller, anchor);

    expect(scroller.scrollTop).toBe(350);
  });

  it('leaves the position alone when no anchored entry is rendered any more', () => {
    layOut();
    const { scroller, render } = scrollerWith(['a', 'b']);
    scroller.scrollTop = 50;
    const anchor = readHistoryAnchor(scroller)!;

    render(['x', 'y', 'z']);
    restoreHistoryAnchor(scroller, anchor);

    expect(scroller.scrollTop).toBe(50);
  });
});

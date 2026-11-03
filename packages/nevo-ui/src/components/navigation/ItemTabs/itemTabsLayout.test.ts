import { describe, expect, it } from 'vitest';
import {
  ITEM_TAB_GAP,
  ITEM_TAB_MAX_WIDTH,
  ITEM_TAB_MIN_WIDTH,
  fitItemTabs,
  maxLabelChars,
  splitMiddle,
} from './itemTabsLayout';

const items = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `i${index}`, label: `item-${index}.md` }));

describe('fitItemTabs', () => {
  it('shows every tab when N x 140 plus gaps fits, within the 140-180 width range', () => {
    const fit = fitItemTabs(items(3), 3 * ITEM_TAB_MIN_WIDTH + 2 * ITEM_TAB_GAP, 'i0');
    expect(fit.overflowing).toBe(false);
    expect(fit.visible).toHaveLength(3);
    for (const width of fit.widths) {
      expect(width).toBeGreaterThanOrEqual(ITEM_TAB_MIN_WIDTH);
      expect(width).toBeLessThanOrEqual(ITEM_TAB_MAX_WIDTH);
    }
  });

  it('shows floor(room / 140) tabs and overflows the rest', () => {
    const fit = fitItemTabs(items(8), 700, 'i0');
    expect(fit.overflowing).toBe(true);
    // room = 700 - 52 = 648 -> 4 tabs + 3 gaps: floor((648 - 6) / 4) = 160
    expect(fit.visible.map((item) => item.id)).toEqual(['i0', 'i1', 'i2', 'i3']);
    expect(fit.widths.every((width) => width === 160)).toBe(true);
  });

  it('never lets tabs plus gaps exceed the available width', () => {
    for (const n of [1, 2, 3, 5, 8, 12]) {
      for (let available = 100; available <= 1200; available += 7) {
        const fit = fitItemTabs(items(n), available, 'i0');
        const used =
          fit.widths.reduce((sum, w) => sum + w, 0) + (fit.widths.length - 1) * ITEM_TAB_GAP;
        // A single tab may exceed a container narrower than its minimum width.
        if (fit.widths.length > 1 || available >= ITEM_TAB_MIN_WIDTH + 52) {
          expect(used + (fit.overflowing ? 52 : 0)).toBeLessThanOrEqual(available);
        }
      }
    }
  });

  it('counts the gap when deciding whether all tabs fit', () => {
    expect(fitItemTabs(items(3), 3 * ITEM_TAB_MIN_WIDTH, 'i0').overflowing).toBe(true);
    expect(fitItemTabs(items(3), 3 * ITEM_TAB_MIN_WIDTH + 2 * ITEM_TAB_GAP, 'i0').overflowing).toBe(
      false,
    );
  });

  it('always keeps the active tab visible, replacing the last visible one', () => {
    const fit = fitItemTabs(items(8), 700, 'i6');
    expect(fit.visible.map((item) => item.id)).toEqual(['i0', 'i1', 'i2', 'i6']);
  });

  it('keeps at least one tab even in a very small container', () => {
    const fit = fitItemTabs(items(3), 100, 'i2');
    expect(fit.visible.map((item) => item.id)).toEqual(['i2']);
    expect(fit.widths).toEqual([ITEM_TAB_MIN_WIDTH]);
  });
});

describe('splitMiddle', () => {
  it('returns the whole label when it fits', () => {
    expect(splitMiddle('notes.md', 20)).toEqual({ head: 'notes.md', tail: '' });
    expect(splitMiddle('notes.md')).toEqual({ head: 'notes.md', tail: '' });
  });

  it('keeps the extension and a few trailing characters visible', () => {
    const { head, tail } = splitMiddle('authentication-flow-overview.md', 16);
    expect(tail.endsWith('.md')).toBe(true);
    expect(head + tail).toBe('authentication-flow-overview.md');
  });

  it('counts user-perceived characters, never cutting an emoji or combining mark', () => {
    const family = '\u{1F468}‍\u{1F469}‍\u{1F467}';
    const label = `${family}${family}${family}${family}-notes.md`;
    const { head, tail } = splitMiddle(label, 8);
    expect(head + tail).toBe(label);
    expect(tail.endsWith('.md')).toBe(true);
    expect(head.endsWith('‍')).toBe(false);
    const combining = 'é'.repeat(10) + '.md';
    const split = splitMiddle(combining, 6);
    expect(split.head + split.tail).toBe(combining);
    expect(split.tail.startsWith('́')).toBe(false);
    expect(splitMiddle(`${family}.md`, 4)).toEqual({ head: `${family}.md`, tail: '' });
  });

  it('computes the characters available for a tab width', () => {
    expect(maxLabelChars(180)).toBeGreaterThan(maxLabelChars(140));
  });
});

import { describe, expect, it } from 'vitest';
import {
  ITEM_TABS_OVERFLOW_WIDTH,
  ITEM_TAB_CLOSE_SLOT,
  ITEM_TAB_COMPRESSED_WIDTH,
  ITEM_TAB_GAP,
  ITEM_TAB_GLYPH,
  ITEM_TAB_MAX_WIDTH,
  ITEM_TAB_MIN_WIDTH,
  ITEM_TAB_PADDING_END,
  ITEM_TAB_PADDING_START,
  fitItemTabs,
  itemTabChromeWidth,
  itemTabNaturalWidth,
  maxLabelChars,
  splitMiddle,
} from './itemTabsLayout';

const items = (count: number) =>
  Array.from({ length: count }, (_, index) => ({ id: `i${index}`, label: `item-${index}.md` }));

const used = (widths: readonly number[]) =>
  widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * ITEM_TAB_GAP;

describe('itemTabNaturalWidth', () => {
  it('is the chrome plus the measured label: padding, glyph, and the close slot only when closable', () => {
    expect(itemTabChromeWidth({})).toBe(ITEM_TAB_PADDING_START + ITEM_TAB_CLOSE_SLOT);
    expect(itemTabChromeWidth({ glyph: true })).toBe(
      ITEM_TAB_PADDING_START + ITEM_TAB_GLYPH + ITEM_TAB_CLOSE_SLOT,
    );
    expect(itemTabChromeWidth({ closable: false })).toBe(
      ITEM_TAB_PADDING_START + ITEM_TAB_PADDING_END,
    );
    // A measured 80 px label: 80 + 1 spare pixel against the rounded offsetWidth.
    expect(itemTabNaturalWidth('Historia pracy', {}, 80)).toBe(42 + 81);
    expect(itemTabNaturalWidth('Kontekst', { closable: false }, 52)).toBe(20 + 53);
  });

  it('follows the content: a short label gives a narrower tab than a long one', () => {
    expect(itemTabNaturalWidth('Plan', {}, 26)).toBeLessThan(
      itemTabNaturalWidth('Historia pracy', {}, 80),
    );
  });

  it('clamps to 64-240 px and estimates the label when it was not measured', () => {
    expect(itemTabNaturalWidth('A', { closable: false }, 8)).toBe(ITEM_TAB_MIN_WIDTH);
    expect(itemTabNaturalWidth('x'.repeat(200), {}, 1200)).toBe(ITEM_TAB_MAX_WIDTH);
    expect(itemTabNaturalWidth('abcdefghij', {})).toBe(42 + 64);
    expect(itemTabNaturalWidth('abcdefghij', {}, 0)).toBe(42 + 64);
  });
});

describe('fitItemTabs', () => {
  it('shows every tab at its own content width when they all fit', () => {
    const natural = [73, 123, 180];
    const fit = fitItemTabs(items(3), used(natural), 'i0', natural);
    expect(fit.overflowing).toBe(false);
    expect(fit.widths).toEqual(natural);
  });

  it('shrinks only the widest tabs, never below the compressed width, before overflowing', () => {
    const natural = [73, 240, 200];
    const fit = fitItemTabs(items(3), 400, 'i0', natural);
    expect(fit.overflowing).toBe(false);
    expect(fit.widths[0]).toBe(73);
    expect(used(fit.widths)).toBeLessThanOrEqual(400);
    expect(fit.widths[1]).toBe(fit.widths[2]);
    expect(fit.widths[1]).toBeGreaterThanOrEqual(ITEM_TAB_COMPRESSED_WIDTH);
  });

  it('overflows the trailing tabs once even the compressed widths do not fit', () => {
    const natural = Array.from({ length: 8 }, () => 150);
    const fit = fitItemTabs(items(8), 700, 'i0', natural);
    expect(fit.overflowing).toBe(true);
    // room = 700 - 52 = 648; at 120 px + 2 px gaps five tabs fit (5 x 120 + 4 x 2 = 608).
    expect(fit.visible.map((item) => item.id)).toEqual(['i0', 'i1', 'i2', 'i3', 'i4']);
    // The spare room is shared out again, up to each tab's content width.
    expect(used(fit.widths)).toBeLessThanOrEqual(700 - ITEM_TABS_OVERFLOW_WIDTH);
    expect(fit.widths.every((width) => width > ITEM_TAB_COMPRESSED_WIDTH)).toBe(true);
  });

  it('never lets tabs plus gaps exceed the available width', () => {
    for (const n of [1, 2, 3, 5, 8, 12]) {
      for (let available = 100; available <= 1400; available += 7) {
        const natural = Array.from({ length: n }, (_, index) => 64 + ((index * 37) % 177));
        const fit = fitItemTabs(items(n), available, 'i0', natural);
        expect(
          used(fit.widths) + (fit.overflowing ? ITEM_TABS_OVERFLOW_WIDTH : 0),
        ).toBeLessThanOrEqual(Math.max(available, ITEM_TAB_MIN_WIDTH + ITEM_TABS_OVERFLOW_WIDTH));
        for (const [index, width] of fit.widths.entries()) {
          const item = fit.visible[index]!;
          expect(width).toBeLessThanOrEqual(natural[Number(item.id.slice(1))]!);
        }
      }
    }
  });

  it('counts the gap when deciding whether all tabs fit', () => {
    const natural = [100, 100, 100];
    expect(fitItemTabs(items(3), 300, 'i0', natural).overflowing).toBe(true);
    expect(fitItemTabs(items(3), 300 + 2 * ITEM_TAB_GAP, 'i0', natural).overflowing).toBe(false);
  });

  it('always keeps the active tab visible, replacing the last visible ones', () => {
    const natural = Array.from({ length: 8 }, () => 150);
    const fit = fitItemTabs(items(8), 700, 'i6', natural);
    expect(fit.visible.map((item) => item.id)).toEqual(['i0', 'i1', 'i2', 'i3', 'i6']);
  });

  it('keeps one tab, shrunk to the room, in a very small container', () => {
    const fit = fitItemTabs(items(3), 100, 'i2', [150, 150, 150]);
    expect(fit.visible.map((item) => item.id)).toEqual(['i2']);
    expect(fit.widths).toEqual([ITEM_TAB_MIN_WIDTH]);
    const single = fitItemTabs(items(1), 150, 'i0', [240]);
    expect(single).toEqual({ visible: items(1), widths: [150], overflowing: false });
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
    const combining = 'é'.repeat(10) + '.md';
    const split = splitMiddle(combining, 6);
    expect(split.head + split.tail).toBe(combining);
    expect(split.tail.startsWith('́')).toBe(false);
    expect(splitMiddle(`${family}.md`, 4)).toEqual({ head: `${family}.md`, tail: '' });
  });

  it('keeps a tab at its content width whole and truncates a narrower one proportionally', () => {
    const label = 'authentication-flow-overview.md';
    expect(maxLabelChars(label, 240, 240, {})).toBeUndefined();
    const half = maxLabelChars(label, 42 + 99, 42 + 198, {})!;
    expect(half).toBe(Math.floor(label.length / 2));
  });
});

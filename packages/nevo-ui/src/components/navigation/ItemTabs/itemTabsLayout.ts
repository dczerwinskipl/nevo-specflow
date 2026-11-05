/**
 * Width policy of the tab strip: a tab is as wide as its own content (padding, glyph, label, close
 * slot), between `ITEM_TAB_MIN_WIDTH` and `ITEM_TAB_MAX_WIDTH`. When the content widths do not fit,
 * long tabs first give up width down to `ITEM_TAB_COMPRESSED_WIDTH` (their labels truncate in the
 * middle); only when even that does not fit, the trailing tabs go to the `Opened (N)` menu.
 */
export const ITEM_TAB_MIN_WIDTH = 64;
/** The width a long tab may shrink to before tabs start going to the Opened menu. */
export const ITEM_TAB_COMPRESSED_WIDTH = 120;
export const ITEM_TAB_MAX_WIDTH = 240;
/** Container width below which the strip is replaced by the switcher button. */
export const ITEM_TABS_SWITCHER_BELOW = 480;
export const ITEM_TABS_OVERFLOW_WIDTH = 52;
/**
 * The rail's switcher threshold: two compressed tabs and the Opened trigger, the room the editor
 * tabs of a Secondary are meant to stay a strip in (the Secondary root-tab strip passes the same).
 */
export const ITEM_TABS_RAIL_SWITCHER_BELOW =
  2 * ITEM_TAB_COMPRESSED_WIDTH + ITEM_TABS_OVERFLOW_WIDTH;
/** Space between tabs (px). Coupled to the `gap-0.5` on the tablist and on the close-slot layer. */
export const ITEM_TAB_GAP = 2;
/**
 * Pixels around the label. Coupled to the tab classes: `pl-2.5` (10) before the glyph or label, the
 * 16 px `sm` glyph plus `gap-2` (8), and at the end either `pr-8` (32, the slot reserved for the x of
 * a closable tab) or `pr-2.5` (10). Change them together.
 */
export const ITEM_TAB_PADDING_START = 10;
export const ITEM_TAB_GLYPH = 16 + 8;
export const ITEM_TAB_CLOSE_SLOT = 32;
export const ITEM_TAB_PADDING_END = 10;
/**
 * Average glyph width (text-label-sm), used only where the label cannot be measured (no layout,
 * for example jsdom or the first render before measurement).
 */
export const ITEM_TAB_CHAR_WIDTH = 6.4;

/** The numbers that depend on a tab's look: the chrome around the label and the space between tabs. */
export interface ItemTabMetrics {
  gap: number;
  paddingStart: number;
  glyph: number;
  closeSlot: number;
  paddingEnd: number;
  charWidth: number;
}

/** `header` (the Documents strip): rounded tabs 2 px apart, 12 px / 600 labels. */
const HEADER_METRICS: ItemTabMetrics = {
  gap: ITEM_TAB_GAP,
  paddingStart: ITEM_TAB_PADDING_START,
  glyph: ITEM_TAB_GLYPH,
  closeSlot: ITEM_TAB_CLOSE_SLOT,
  paddingEnd: ITEM_TAB_PADDING_END,
  charWidth: ITEM_TAB_CHAR_WIDTH,
};

/**
 * `rail` (the split Secondary's editor tabs): square tabs that touch (separated by their own 1 px
 * edge, inside the width), 12 px padding, a 14 px glyph plus `gap-2`, 14 px / 400 labels. Coupled
 * to the rail tab classes in `ItemTabs.tsx` (`pl-3`, `pr-8` / `pr-3`, `text-body-md`).
 */
const RAIL_METRICS: ItemTabMetrics = {
  gap: 0,
  paddingStart: 12,
  glyph: 14 + 8,
  closeSlot: ITEM_TAB_CLOSE_SLOT,
  paddingEnd: 12,
  charWidth: 7.4,
};

export type ItemTabDensity = 'header' | 'rail';

export function itemTabMetrics(density: ItemTabDensity = 'header'): ItemTabMetrics {
  return density === 'rail' ? RAIL_METRICS : HEADER_METRICS;
}

export interface FitItem {
  id: string;
  label: string;
}

/** What decides a tab's chrome around its label. */
export interface ItemTabChrome {
  closable?: boolean;
  /** The tab shows a leading glyph (an icon, a spinner or a warning). */
  glyph?: boolean;
}

export interface ItemTabsFit<T extends FitItem> {
  visible: readonly T[];
  widths: readonly number[];
  overflowing: boolean;
}

/** Pixels a tab needs around its label. */
export function itemTabChromeWidth(
  { closable = true, glyph = false }: ItemTabChrome,
  metrics: ItemTabMetrics = HEADER_METRICS,
) {
  return (
    metrics.paddingStart +
    (glyph ? metrics.glyph : 0) +
    (closable ? metrics.closeSlot : metrics.paddingEnd)
  );
}

/**
 * The content width of a tab: its chrome plus the label, measured (`labelWidth`) when the layout
 * is known, else estimated from its length, clamped to 64-240 px.
 */
export function itemTabNaturalWidth(
  label: string,
  chrome: ItemTabChrome,
  labelWidth?: number,
  metrics: ItemTabMetrics = HEADER_METRICS,
) {
  const text =
    labelWidth !== undefined && labelWidth > 0
      ? // `offsetWidth` is rounded: one spare pixel keeps a fitting label from a sub-pixel ellipsis.
        Math.ceil(labelWidth) + 1
      : Math.round(label.length * metrics.charWidth);

  return Math.min(
    ITEM_TAB_MAX_WIDTH,
    Math.max(ITEM_TAB_MIN_WIDTH, itemTabChromeWidth(chrome, metrics) + text),
  );
}

function totalWidth(widths: readonly number[], gap: number) {
  return widths.reduce((sum, width) => sum + width, 0) + Math.max(0, widths.length - 1) * gap;
}

/**
 * Shrinks the widest tabs first (one common cap, never below their compressed width) until the
 * tabs fit `space`. Short tabs keep their content width.
 */
function compress(natural: readonly number[], space: number, gap: number): number[] {
  const floor = natural.map((width) => Math.min(width, ITEM_TAB_COMPRESSED_WIDTH));
  if (totalWidth(natural, gap) <= space) {
    return [...natural];
  }

  let low = ITEM_TAB_COMPRESSED_WIDTH;
  let high = Math.max(...natural);
  while (low < high) {
    const cap = Math.ceil((low + high) / 2);
    if (
      totalWidth(
        natural.map((width) => Math.min(width, cap)),
        gap,
      ) <= space
    ) {
      low = cap;
    } else {
      high = cap - 1;
    }
  }

  return natural.map((width, index) => Math.max(floor[index]!, Math.min(width, low)));
}

/**
 * Which tabs are visible and how wide each one is. `naturalWidths[i]` is the content width of
 * `items[i]` (`itemTabNaturalWidth`); without it the width is estimated from the label length.
 *
 * 1. All content widths fit: every tab at its content width.
 * 2. Else, if every tab fits at no less than its compressed width (120 px, or its content width when
 *    narrower): all tabs visible, the widest ones shrunk to one common cap.
 * 3. Else the leading tabs that fit next to the overflow trigger stay visible, always including the
 *    active one (it replaces the last ones that no longer fit), and the rest go to the Opened menu.
 *    One tab always stays visible, shrunk to the room when it is wider.
 */
export function fitItemTabs<T extends FitItem>(
  items: readonly T[],
  available: number,
  activeId: string | null,
  naturalWidths?: readonly number[],
  metrics: ItemTabMetrics = HEADER_METRICS,
): ItemTabsFit<T> {
  const gap = metrics.gap;
  const natural = items.map(
    (item, index) =>
      naturalWidths?.[index] ?? itemTabNaturalWidth(item.label, {}, undefined, metrics),
  );
  const floor = natural.map((width) => Math.min(width, ITEM_TAB_COMPRESSED_WIDTH));
  if (items.length <= 1 || totalWidth(floor, gap) <= available) {
    const widths = compress(natural, available, gap);
    if (items.length === 1 && widths[0]! > available) {
      widths[0] = Math.max(ITEM_TAB_MIN_WIDTH, Math.floor(available));
    }

    return { visible: items, widths, overflowing: false };
  }

  const room = available - ITEM_TABS_OVERFLOW_WIDTH;
  const activeIndex = items.findIndex((item) => item.id === activeId);
  let indices: number[] = [];
  for (let index = 0; index < items.length; index += 1) {
    if (
      totalWidth(
        [...indices, index].map((i) => floor[i]!),
        gap,
      ) > room
    ) {
      break;
    }

    indices.push(index);
  }

  if (activeIndex >= 0 && !indices.includes(activeIndex)) {
    while (
      indices.length > 0 &&
      totalWidth(
        [...indices, activeIndex].map((i) => floor[i]!),
        gap,
      ) > room
    ) {
      indices = indices.slice(0, -1);
    }

    indices.push(activeIndex);
  }

  if (indices.length === 0) {
    indices = [0];
  }

  const visible = indices.map((index) => items[index]!);
  const widths = compress(
    indices.map((index) => natural[index]!),
    room,
    gap,
  );
  if (widths.length === 1 && widths[0]! > room) {
    widths[0] = Math.max(ITEM_TAB_MIN_WIDTH, Math.floor(room));
  }

  return { visible, widths, overflowing: true };
}

/**
 * How many characters of a label fit in a tab of `tabWidth`, given its content width: the label is
 * whole when the tab has its content width, else proportionally shorter (the middle truncation
 * keeps the tail, the CSS ellipsis absorbs the rest of the difference).
 */
export function maxLabelChars(
  label: string,
  tabWidth: number,
  naturalWidth: number,
  chrome: ItemTabChrome,
  metrics: ItemTabMetrics = HEADER_METRICS,
) {
  if (tabWidth >= naturalWidth) {
    return undefined;
  }

  const chromeWidth = itemTabChromeWidth(chrome, metrics);
  const ratio = Math.max(0, tabWidth - chromeWidth) / Math.max(1, naturalWidth - chromeWidth);

  return Math.max(1, Math.floor(label.length * ratio));
}

const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter() : undefined;

/** User-perceived characters (emoji sequences and combining marks stay whole). */
function graphemes(text: string): string[] {
  return segmenter ? Array.from(segmenter.segment(text), (part) => part.segment) : Array.from(text);
}

/**
 * Splits a label for middle truncation: the tail (extension and last characters) stays visible
 * and the head shrinks. The label is returned whole when it fits. Counts characters as the user
 * sees them, so a split never cuts an emoji or a combining mark apart.
 */
export function splitMiddle(text: string, maxChars?: number) {
  const chars = graphemes(text);
  if (maxChars === undefined || chars.length <= maxChars) {
    return { head: text, tail: '' };
  }

  const dot = chars.lastIndexOf('.');
  const extLength = dot > 0 ? chars.length - dot : 0;
  const tailLength = Math.min(extLength + 4, Math.max(extLength, Math.floor(maxChars * 0.5)));
  if (tailLength === 0) {
    return { head: text, tail: '' };
  }

  return {
    head: chars.slice(0, chars.length - tailLength).join(''),
    tail: chars.slice(chars.length - tailLength).join(''),
  };
}

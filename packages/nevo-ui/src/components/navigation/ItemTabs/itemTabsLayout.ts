export const ITEM_TAB_MIN_WIDTH = 140;
export const ITEM_TAB_MAX_WIDTH = 180;
/** Container width below which the strip is replaced by the switcher button. */
export const ITEM_TABS_SWITCHER_BELOW = 480;
export const ITEM_TABS_OVERFLOW_WIDTH = 52;
/**
 * Pixels around the label: left padding, icon, gap and the right slot reserved for the x.
 * Coupled to the tab classes `pl-2.5` (10), the 16 px `sm` icon, `gap-2` (8) and `pr-8` (32): change
 * them together.
 */
export const ITEM_TAB_CHROME = 10 + 16 + 8 + 32;
/** Average glyph width (text-label-sm) used to size tabs and decide how many characters fit. */
export const ITEM_TAB_CHAR_WIDTH = 6.4;

export interface FitItem {
  id: string;
  label: string;
}

export interface ItemTabsFit<T extends FitItem> {
  visible: readonly T[];
  widths: readonly number[];
  overflowing: boolean;
}

function naturalWidth(label: string) {
  return Math.min(
    ITEM_TAB_MAX_WIDTH,
    Math.max(ITEM_TAB_MIN_WIDTH, Math.round(ITEM_TAB_CHROME + label.length * ITEM_TAB_CHAR_WIDTH)),
  );
}

/**
 * Width policy: a tab is never narrower than 140 px nor wider than 180 px. All tabs are visible
 * when N x 140 <= available; otherwise floor((available - overflow button) / 140) tabs are
 * visible (always including the active one) and the rest go to the Opened menu.
 */
export function fitItemTabs<T extends FitItem>(
  items: readonly T[],
  available: number,
  activeId: string | null,
): ItemTabsFit<T> {
  if (items.length * ITEM_TAB_MIN_WIDTH <= available) {
    const spare = Math.floor(available / Math.max(1, items.length));
    return {
      visible: items,
      widths: items.map((item) =>
        Math.min(naturalWidth(item.label), Math.max(ITEM_TAB_MIN_WIDTH, spare)),
      ),
      overflowing: false,
    };
  }
  const room = available - ITEM_TABS_OVERFLOW_WIDTH;
  const count = Math.max(1, Math.floor(room / ITEM_TAB_MIN_WIDTH));
  let visible = items.slice(0, count);
  const active = items.find((item) => item.id === activeId);
  if (active && !visible.includes(active)) visible = [...visible.slice(0, count - 1), active];
  const width = Math.min(
    ITEM_TAB_MAX_WIDTH,
    Math.max(ITEM_TAB_MIN_WIDTH, Math.floor(room / visible.length)),
  );
  return { visible, widths: visible.map(() => width), overflowing: true };
}

/** How many characters of a label fit in a tab of the given width. */
export function maxLabelChars(tabWidth: number) {
  return Math.round((tabWidth - ITEM_TAB_CHROME) / ITEM_TAB_CHAR_WIDTH);
}

/**
 * Splits a label for middle truncation: the tail (extension and last characters) stays visible
 * and the head shrinks. The label is returned whole when it fits.
 */
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
  if (maxChars === undefined || chars.length <= maxChars) return { head: text, tail: '' };
  const dot = chars.lastIndexOf('.');
  const extLength = dot > 0 ? chars.length - dot : 0;
  const tailLength = Math.min(extLength + 4, Math.max(extLength, Math.floor(maxChars * 0.5)));
  if (tailLength === 0) return { head: text, tail: '' };
  return {
    head: chars.slice(0, chars.length - tailLength).join(''),
    tail: chars.slice(chars.length - tailLength).join(''),
  };
}

/**
 * PROTOTYPE ONLY (App Shell geometry review, not for merge).
 * Selects a layout variant from `localStorage['proto.layout']`:
 * - `base`: current main behaviour.
 * - `A`: explicit Focused (Specs Overview, Create) and Workspace (everything else) modes.
 * - `A2`: A after the independent visual review: the Focused width is the existing
 *   `content-standard` (Specs Overview unchanged, Create adopts it), the Specification Overview
 *   column is centred in its full-width pane, and a small leftover margin snaps the shell left.
 * - `E`: A2, but Create Specification uses the Specification workspace geometry: its form sits in
 *   the same centred column and a Secondary previews what will be created (Create Session principle).
 * - `A3`: A2 completed: the real project Create form in two columns, the footer aligned with the
 *   form, the progress page content kept at `content-form` inside the shared frame
 *   (`localStorage['proto.progress']` = start | center), and an operational two-column
 *   Specification Overview instead of a centred reading column.
 * - `A3h`: A3, and on a wide viewport Activity history becomes the last section of the Specification
 *   Overview's side column instead of a separate Secondary.
 * - `B`: one full-width shell; content is constrained or rearranged inside the workspace.
 * - `C`: one shared page frame for Specs Overview, Create and Specification Overview (the
 *   Specification Overview's own bounded width); tool screens stay full width.
 * - `D`: current widths, but the shell is anchored to the left edge instead of centred.
 */
export type LayoutPrototype = 'base' | 'A' | 'A2' | 'A3' | 'A3h' | 'B' | 'C' | 'D' | 'E';

export const layoutPrototype: LayoutPrototype = (() => {
  try {
    const value = globalThis.localStorage?.getItem('proto.layout');

    return value === 'A' ||
      value === 'A2' ||
      value === 'A3' ||
      value === 'A3h' ||
      value === 'B' ||
      value === 'C' ||
      value === 'D' ||
      value === 'E'
      ? value
      : 'base';
  } catch {
    return 'base';
  }
})();

/** Width class of a Focused screen's content in variant A (shared by Specs Overview and Create). */
export const focusedWidthClass = 'w-content-wide';

/**
 * Prototype-only pixel widths that make the bounded workspace of Specs Overview / Create match
 * exactly (Create adds a 20 px scrollbar gutter). Variant C matches the Specification Overview
 * frame (content-standard Primary + Secondary). Production would need a Nevo UI page-frame
 * capability instead of pixel classes.
 */
export const overviewWidthClass = { A: 'w-content-wide', C: 'w-[1573px]' } as const;
export const createColumnWidthClass = {
  A: 'w-[1260px]',
  A2: 'w-[1080px]',
  A3: 'w-[1070px]',
  A3h: 'w-[1070px]',
  C: 'w-[1553px]',
} as const;

/** A2 snap rule: below this leftover width a centred shell is anchored left instead. */
export const snapLeftBelowPx = 240;

/** Variants that share A2's Focused/Workspace behaviour outside Create. */
export const isA2Family =
  layoutPrototype === 'A2' ||
  layoutPrototype === 'A3' ||
  layoutPrototype === 'A3h' ||
  layoutPrototype === 'E';

export const progressAlign: 'start' | 'center' = (() => {
  try {
    return globalThis.localStorage?.getItem('proto.progress') === 'center' ? 'center' : 'start';
  } catch {
    return 'start';
  }
})();

/** A3 and its history-in-page sibling share every A3 behaviour. */
export const isA3Family = layoutPrototype === 'A3' || layoutPrototype === 'A3h';

/** PROTOTYPE (iteration 4) sub-flags, each compared against plain A3. */
const flag = <T extends string>(key: string, values: readonly T[], fallback: T): T => {
  try {
    const value = globalThis.localStorage?.getItem(key);

    return values.includes(value as T) ? (value as T) : fallback;
  } catch {
    return fallback;
  }
};

/** `snap240`: anchor left under 240 px leftover; `center`: always centre; `fill`: below that width the Focused frame fills the workspace while controls keep their limits. */
export const protoSnap = flag('proto.snap', ['snap240', 'center', 'fill'] as const, 'snap240');
/** Where the recent Session sits in the two-column Specification Overview. */
export const protoOverview = flag('proto.overview', ['side', 'left', 'row'] as const, 'side');
/** `rows`: the Git defaults block as three decision rows. */
export const protoGit = flag('proto.git', ['old', 'rows'] as const, 'old');
/** `on`: a blocked Create leads to the first faulty field. */
export const protoGuide = flag('proto.guide', ['off', 'on'] as const, 'off');

/** Viewport width under which `fill` lets the Focused frame use the available width. */
export const fillBelowViewportPx = 260 + 8 + 1102 + snapLeftBelowPx;

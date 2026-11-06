/**
 * PROTOTYPE ONLY (App Shell geometry review, not for merge).
 * Selects a layout variant from `localStorage['proto.layout']`:
 * - `base`: current main behaviour.
 * - `A`: explicit Focused (Specs Overview, Create) and Workspace (everything else) modes.
 * - `A2`: A after the independent visual review: the Focused width is the existing
 *   `content-standard` (Specs Overview unchanged, Create adopts it), the Specification Overview
 *   column is centred in its full-width pane, and a small leftover margin snaps the shell left.
 * - `B`: one full-width shell; content is constrained or rearranged inside the workspace.
 * - `C`: one shared page frame for Specs Overview, Create and Specification Overview (the
 *   Specification Overview's own bounded width); tool screens stay full width.
 * - `D`: current widths, but the shell is anchored to the left edge instead of centred.
 */
export type LayoutPrototype = 'base' | 'A' | 'A2' | 'B' | 'C' | 'D';

export const layoutPrototype: LayoutPrototype = (() => {
  try {
    const value = globalThis.localStorage?.getItem('proto.layout');

    return value === 'A' || value === 'A2' || value === 'B' || value === 'C' || value === 'D'
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
  C: 'w-[1553px]',
} as const;

/** A2 snap rule: below this leftover width a centred shell is anchored left instead. */
export const snapLeftBelowPx = 240;

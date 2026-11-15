/*
 * The geometry of a tree pane (the Documents explorer, the documentation reader), measured from
 * the pane's inner edge: blocks at 8 px, the search field's border at 12 px (`TreeSearchBar`), and
 * the text column at 16 px, where row content, notes, result titles and the empty result start.
 */

/**
 * The scroller's content (the pane stack): the vertical inset only, so a full-width block (the
 * sticky search bar) needs no negative margins; blocks are 12 px apart and have no margins.
 */
export const treePaneContentClassName = 'grid content-start gap-3 py-2';

/** The inline inset every block of the pane carries itself (8 px). */
export const treePaneBlockClassName = 'px-2';

/** A text block on the pane's text column: the block inset plus 8 px (16 px). */
export const treePaneTextClassName = 'px-4';

/**
 * The tree block: section heading, search bar, filter status, notes and the list, the results or
 * the empty result, 4 px apart. A part that renders nothing renders no element. Positioned, so a
 * sticky search bar's sentinel (at the block's top) scrolls with the block.
 */
export const treeBlockClassName = 'relative grid min-w-0 gap-1';

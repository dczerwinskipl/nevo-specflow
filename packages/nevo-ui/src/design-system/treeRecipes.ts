import { fastColorTransitionClassName, hitAreaBlockClassName } from './interactionRecipes';

/*
 * Compact explorer-tree recipe. Products own data, expansion state, actions and ARIA; the DS owns the
 * geometry that has to line up with control padding, border and icon size. There are no guide lines:
 * hierarchy is carried by a small indent step and the chevron + folder icon + name alignment.
 *
 *   <ul className={treeRootClassName}>                                // top-level list: no indent
 *     <li className={treeNodeClassName}>
 *       <div className={treeRowClassName}>                            // row line: item + trailing action
 *         <button className={treeItemClassName}>                      // folder
 *           <span className={treeGlyphSlotClassName}>chevron</span>
 *           <Icon />  <span className={treeItemLabelTruncateClassName}>name</span>
 *         </button>
 *         ...trailing action (sibling, never nested in the item; treeRowActionClassName)
 *       </div>
 *       <ul className={treeBranchClassName}>...</ul>                  // children of an expanded folder
 *       <p className={treeHintClassName}>...</p>                      // optional quiet hint of an opened empty folder
 *     </li>
 *   </ul>
 *
 * A leaf uses `treeLeafItemClassName` (no glyph slot): its icon aligns with the sibling folders' icons.
 * The visual row is one compact control height; the hit area keeps the DS target size (24px, 44px on
 * coarse pointers) through `hitAreaBlockClassName` on the item and `IconButton`'s own hit area, so
 * touch never enlarges the visual rhythm. Neighbouring hit areas may overlap on coarse pointers; the
 * later DOM sibling wins (see the Target size rules).
 * Selection is `aria-current` and means the opened item only.
 */

// Class strings stay literal so Tailwind can detect them.
/** Indented group of child nodes under an expanded folder (one small indent step per level). */
export const treeBranchClassName = 'm-0 grid min-w-0 list-none p-0 pl-tree-indent';

/** Top-level list: no indent. */
export const treeRootClassName = 'm-0 grid min-w-0 list-none p-0';

/** One node: its row plus an optional nested branch and hint. */
export const treeNodeClassName = 'relative min-w-0';

/** The row line of a node (folder or leaf): item plus trailing action. */
export const treeRowClassName =
  'group/tree-row @container/tree-row relative flex min-w-0 items-center gap-1';

/**
 * Interactive tree row (disclosure button or document button): one compact control height, glyph/icon/name
 * gap from `--spacing-tree-gap`, hit area expanded on the block axis only. Selection is `aria-current`
 * (a clear tint and an accent file icon); keyboard focus uses the global focus ring; disabled follows
 * the DS action treatment. Do not add local opacity, outline or selected classes.
 */
export const treeItemClassName = [
  hitAreaBlockClassName,
  'flex min-h-tree-row-height min-w-0 flex-1 items-center gap-tree-gap rounded-control border border-solid border-transparent px-control-padding-inline text-left text-body-md',
  'bg-transparent text-content-secondary',
  'hover:bg-surface-hover hover:text-content-primary',
  '[&[aria-current]:not([aria-current=false])]:bg-surface-selected [&[aria-current]:not([aria-current=false])]:text-content-primary [&[aria-current]:not([aria-current=false])]:*:first:text-content-link',
  'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-content-secondary',
  fastColorTransitionClassName,
].join(' ');

/**
 * Interactive leaf item. It has no disclosure slot and starts where a sibling folder's icon
 * column starts, so the selected/hover box wraps only the leaf's own icon and name.
 */
export const treeLeafItemClassName = [treeItemClassName, 'ml-tree-leaf-offset'].join(' ');

/** Fixed glyph slot (disclosure chevron) so folder icons align across levels. */
export const treeGlyphSlotClassName = 'flex size-icon-md shrink-0 items-center justify-center';

/** Item name: wraps long names (use `treeItemLabelTruncateClassName` for one line). */
export const treeItemLabelClassName = 'min-w-0 flex-1 break-words leading-(--spacing-icon-md)';

/**
 * Single-line item name with an ellipsis. The full name must be reachable elsewhere (title bar,
 * tooltip hook or the opened item): an ellipsis alone is not an accessible path to the value.
 */
export const treeItemLabelTruncateClassName = 'min-w-0 flex-1 truncate leading-(--spacing-icon-md)';

/**
 * Trailing row action trigger (an `IconButton size="sm"` sibling of the item, inside `treeRowClassName`).
 * Fine pointers reveal it on row hover, keyboard focus inside the row, an open menu or the selected
 * (`aria-current`) row; coarse pointers and `hover: none` always show it. The slot keeps its box when
 * hidden, so the label never reflows; it stays focusable and announced (opacity, not display).
 */
export const treeRowActionClassName = [
  'shrink-0',
  'pointer-fine:opacity-0',
  'pointer-fine:group-hover/tree-row:opacity-100',
  'pointer-fine:group-focus-within/tree-row:opacity-100',
  'pointer-fine:group-has-[[aria-current]:not([aria-current=false])]/tree-row:opacity-100',
  'pointer-fine:data-[state=open]:opacity-100',
  'pointer-fine:focus-visible:opacity-100',
].join(' ');

/**
 * Required-item marker inside a row's item: quiet muted text on the right, before the row action.
 * The text is always in the DOM (one accessible "Required"); the row's own width (the
 * `@container/tree-row` set by `treeRowClassName`) decides how it shows, so the name keeps its room
 * on a narrow Primary:
 * - wide rows (>= `@3xs`): `<span className={treeRequiredLabelClassName}>Required</span>` is visible;
 * - narrow rows: the text becomes visually hidden (`sr-only`) and
 *   `<span aria-hidden className={treeRequiredMarkerClassName}><Icon name="workflow" size="sm" /></span>`
 *   stands in for it.
 * It never reorders the tree and never selects the row.
 */
export const treeRequiredLabelClassName =
  'shrink-0 self-center whitespace-nowrap text-body-sm text-content-muted @max-3xs/tree-row:sr-only';

/** Compact decorative icon form of the required marker; pair it with the label. See the label recipe. */
export const treeRequiredMarkerClassName =
  'inline-flex shrink-0 self-center text-content-muted @3xs/tree-row:hidden';

/**
 * Quiet trailing label of a row item (for example the item's type), on the right before the row
 * action. It is shown in full or not at all: on a row narrower than `@xs` (20rem, room for the
 * glyph, about 16 characters of name and the label) it is visually hidden, so the name keeps its
 * room. It is never shortened and always stays in the item's accessible name. One rule at every
 * pane width, decided by the row's own width (`@container/tree-row`).
 */
export const treeTrailingLabelClassName =
  'shrink-0 self-center whitespace-nowrap text-body-sm text-content-muted @max-xs/tree-row:sr-only';

/**
 * Trailing label of a row STATE the reader must always see (for example "Read-only"): it never
 * hides, the name truncates instead. Quiet muted text, no pill.
 */
export const treeStateLabelClassName =
  'shrink-0 self-center whitespace-nowrap text-body-sm text-content-muted';

/**
 * Attention form of the state label (for example "File missing"); pair the row's icon with the same
 * tone (`treeAttentionGlyphClassName`) and keep the text, never colour alone.
 */
export const treeAttentionStateLabelClassName =
  'shrink-0 self-center whitespace-nowrap text-body-sm text-status-attention';

/**
 * Attention tone of a row item's leading icon (for example a warning glyph of a missing file). It
 * wins over the selected row's accent icon colour: the warning stays a warning when the row is open.
 */
export const treeAttentionGlyphClassName = 'shrink-0 text-status-attention!';

/**
 * Quiet inline hint under an opened empty folder (for example "Folder is empty. Add a file or folder
 * from the menu."): muted text aligned to the folder's name column, no icon, not focusable and not a
 * tree item. The product removes it as soon as the folder has content.
 */
export const treeHintClassName =
  'm-0 min-w-0 py-1 pl-tree-name-offset pr-control-padding-inline text-body-sm text-content-muted';

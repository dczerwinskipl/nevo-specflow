/** Measured trail width (px) under which `overflow="collapse"` hides every middle segment. */
export const BREADCRUMBS_COLLAPSE_BELOW = 480;
/** Most segments `overflow="collapse"` shows at any width: the root, two ancestors, the current. */
export const BREADCRUMBS_MAX_VISIBLE = 4;

export interface BreadcrumbsCollapse {
  /** Indices of the segments rendered inline, in order. */
  visible: readonly number[];
  /** Indices of the middle segments folded into the `…` menu, in order (empty: no `…`). */
  hidden: readonly number[];
}

/**
 * Collapse rule for a single-line trail. The first segment (the root) and the last (the current
 * page) are always shown — they are the two a reader needs to orient, and the root is the usual
 * jump target. Middle segments fold into one `…` (a menu that still reaches them):
 * - narrow (`width < collapseBelow`): every middle segment folds, so 3+ levels read
 *   `Root › … › Current`;
 * - otherwise at most `BREADCRUMBS_MAX_VISIBLE` segments show; the ones closest to the current
 *   page stay, the oldest middle ones fold first.
 * An unmeasured width (`undefined`, first render/SSR) is treated as wide.
 */
export function collapseBreadcrumbs(
  count: number,
  width: number | undefined,
  collapseBelow = BREADCRUMBS_COLLAPSE_BELOW,
): BreadcrumbsCollapse {
  const all = Array.from({ length: count }, (_, index) => index);
  if (count <= 2) {
    return { visible: all, hidden: [] };
  }

  const narrow = width !== undefined && width < collapseBelow;
  const keepBeforeCurrent = narrow ? 0 : BREADCRUMBS_MAX_VISIBLE - 2;
  const firstKept = Math.max(1, count - 1 - keepBeforeCurrent);
  const hidden = all.slice(1, firstKept);

  return {
    visible: all.filter((index) => index === 0 || index >= firstKept),
    hidden,
  };
}

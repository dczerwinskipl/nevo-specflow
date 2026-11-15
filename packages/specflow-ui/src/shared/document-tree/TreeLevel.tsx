import { createContext, useContext, type ReactNode } from 'react';
import { treeBranchClassName, treeRootClassName } from '@nevo/ui';

const FlatLevel = createContext(false);

/** Whether the rows being drawn are in a flat level (see `TreeLevel`). */
export const useFlatLevel = () => useContext(FlatLevel);

/**
 * One list of a document tree: the top level or an open folder's children (one indent step).
 * `flat`: a top level without folders, whose documents start at the row edge because there is no
 * folder icon column to line up with (an offset would read as nesting). Each level sets it for its
 * own rows only. The rows' tooltips need a `TooltipProvider` at the screen root.
 */
export function TreeLevel({
  top,
  flat = false,
  labelledBy,
  children,
}: {
  top: boolean;
  flat?: boolean;
  /** The id of what names the top level (a root header). */
  labelledBy?: string;
  children: ReactNode;
}) {
  return (
    <FlatLevel.Provider value={flat}>
      <ul className={top ? treeRootClassName : treeBranchClassName} aria-labelledby={labelledBy}>
        {children}
      </ul>
    </FlatLevel.Provider>
  );
}

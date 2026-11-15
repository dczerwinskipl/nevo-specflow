import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@nevo/ui';
import { useStuck } from './useStuck';

interface TreeSearchBarProps extends HTMLAttributes<HTMLDivElement> {
  /** The `TreeSearchField` (give it `flex-1`) and an optional trailing control. */
  children: ReactNode;
  /**
   * Stays at the top of the scroller (opt-in). The bar must then be the first child of its block,
   * where its sentinel sits.
   */
  sticky?: boolean;
  /** The scroll viewport the sticky bar docks in (the `ScrollArea` viewport element). */
  scrollRoot?: HTMLElement | null;
}

/**
 * The search row of a tree pane: the field and an optional trailing control across the pane's full
 * width, the field's border at 12 px from the pane's edge. At rest it has no surface and no divider
 * (a transparent border keeps its height). A sticky bar docked at the top paints the opaque docked
 * material of the workspace and its bottom divider, so nothing scrolled underneath shows through.
 */
export const TreeSearchBar = forwardRef<HTMLDivElement, TreeSearchBarProps>(function TreeSearchBar(
  { children, sticky = false, scrollRoot = null, className, ...props },
  ref,
) {
  const { sentinelRef, stuck } = useStuck(sticky ? scrollRoot : null);

  return (
    <>
      {sticky && (
        // Out of the flow (no grid gap): the static position of an absolute box in a grid is the
        // block's top, where the bar sits at rest.
        <span
          ref={sentinelRef}
          aria-hidden="true"
          className="pointer-events-none invisible absolute h-px w-px"
        />
      )}
      <div
        ref={ref}
        role="search"
        data-stuck={stuck || undefined}
        className={cn(
          'flex min-w-0 items-center gap-1 border-b border-transparent px-3 py-1',
          sticky && 'sticky top-0 z-10',
          stuck && 'workspace-docked-bar border-divider',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </>
  );
});

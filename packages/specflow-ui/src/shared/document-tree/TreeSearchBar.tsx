import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@nevo/ui';
import { useStuck } from './useStuck';

interface TreeSearchBarProps extends HTMLAttributes<HTMLDivElement> {
  /** The `TreeSearchField` (give it `flex-1`) and an optional trailing control. */
  children: ReactNode;
  /**
   * Stays at the top of the scroller (opt-in). The bar must then be the first child of a
   * positioned block (`treeBlockClassName`), at whose top its sentinel sits.
   */
  sticky?: boolean;
  /** The scroll viewport the sticky bar docks in (the `ScrollArea` viewport element). */
  scrollRoot?: HTMLElement | null;
}

/**
 * The search row of a tree pane: the field and an optional trailing control across the pane's full
 * width, the field's border at 12 px from the pane's edge, with no divider at rest (a transparent
 * border keeps its height). A bar that is not sticky has no surface of its own.
 *
 * A sticky bar always paints the opaque docked material of the workspace (at rest it matches the
 * pane's flat surface), so nothing scrolled underneath ever shows through, also in the frame before
 * the stuck state is known (an observer answers after that frame's paint: a scroll restore, a jump
 * or a resize would otherwise show one transparent frame). Only the divider follows `useStuck`.
 */
export const TreeSearchBar = forwardRef<HTMLDivElement, TreeSearchBarProps>(function TreeSearchBar(
  { children, sticky = false, scrollRoot = null, className, ...props },
  ref,
) {
  const { sentinelRef, stuck } = useStuck(sticky ? scrollRoot : null);

  return (
    <>
      {sticky && (
        // Out of the flow (no grid gap), at the top of the positioned block (`treeBlockClassName`),
        // where the bar sits at rest.
        <span
          ref={sentinelRef}
          aria-hidden="true"
          className="pointer-events-none invisible absolute top-0 left-0 h-px w-px"
        />
      )}
      <div
        ref={ref}
        role="search"
        data-stuck={stuck || undefined}
        className={cn(
          'flex min-w-0 items-center gap-1 border-b px-3 py-1',
          sticky && 'workspace-docked-bar sticky top-0 z-10',
          stuck ? 'border-divider' : 'border-transparent',
          className,
        )}
        {...props}
      >
        {children}
      </div>
    </>
  );
});

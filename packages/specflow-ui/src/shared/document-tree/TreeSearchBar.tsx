import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '@nevo/ui';
import { useStuck } from './useStuck';

/** The browser drives the docked surface from the scroll position itself (`workspace-docked-sticky`). */
const scrollTimelines = () =>
  typeof CSS !== 'undefined' &&
  typeof CSS.supports === 'function' &&
  CSS.supports('animation-timeline: view()');

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
 * A sticky bar is `workspace-docked-sticky`: where scroll-driven animations exist, the scroller's
 * position (through the sentinel's view timeline) switches the docked material and the divider at
 * the exact dock point, transparent at rest. Elsewhere the material is always on (an observer
 * answers only after the frame it measured is painted, so tying the material to it would show a
 * transparent frame on a jump, a scroll restore or a resize) and the divider follows `useStuck`,
 * which runs only there.
 */
export const TreeSearchBar = forwardRef<HTMLDivElement, TreeSearchBarProps>(function TreeSearchBar(
  { children, sticky = false, scrollRoot = null, className, ...props },
  ref,
) {
  const { sentinelRef, stuck } = useStuck(sticky && !scrollTimelines() ? scrollRoot : null);

  return (
    <>
      {sticky && (
        // Out of the flow (no grid gap), at the top of the positioned block (`treeBlockClassName`),
        // where the bar sits at rest.
        <span
          ref={sentinelRef}
          aria-hidden="true"
          className="workspace-docked-sentinel pointer-events-none invisible absolute top-0 left-0 h-px w-px"
        />
      )}
      <div
        ref={ref}
        role="search"
        data-stuck={stuck || undefined}
        className={cn(
          'flex min-w-0 items-center gap-1 border-b px-3 py-1',
          sticky && 'workspace-docked-sticky sticky top-0 z-10',
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

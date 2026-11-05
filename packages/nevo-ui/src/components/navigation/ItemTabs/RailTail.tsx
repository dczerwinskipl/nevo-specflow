import type { HTMLAttributes } from 'react';
import { cn } from '../../../lib';

/**
 * The right end of a `density="rail"` strip: the strip's own fill and bottom divider (the same as
 * the inactive tabs and the filler `ItemTabs` draws), carrying the controls that belong to the
 * rail (Outline, view modes, the `...` menu). Place it as the next sibling of the `ItemTabs`, in a
 * flex row that is the rail's height, so the strip reads as one band from the first tab to the edge.
 */
export function RailTail({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        'flex shrink-0 items-center gap-1 self-stretch border-b border-border-subtle bg-tab-strip px-1',
        className,
      )}
    />
  );
}

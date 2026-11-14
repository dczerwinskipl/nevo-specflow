import { Skeleton } from '@nevo/ui';

const widths = [72, 56, 64, 48, 80, 60, 52];

/**
 * Skeleton rows of the tree (and of results being searched). `label` announces the loading; omit it
 * where another live region already says it (the search's status row).
 */
export function TreeSkeleton({ label }: { label?: string }) {
  return (
    <div
      role={label ? 'status' : undefined}
      aria-busy="true"
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className="grid gap-2 px-2 pt-1"
    >
      {widths.map((width, index) => (
        <Skeleton key={index} className="h-5" style={{ width: `${width}%` }} />
      ))}
    </div>
  );
}

import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../../lib';
import { useDesignMetadata } from '@nevo/figma-capture/metadata';

export interface SkeletonProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Pulse while content is actively loading (default). Pass `false` for a static placeholder,
   * e.g. while a request is paused/offline. Reduced motion always disables the pulse.
   */
  animated?: boolean;
}

export const Skeleton = forwardRef<HTMLDivElement, SkeletonProps>(function Skeleton(
  { animated = true, className, ...props },
  ref,
) {
  const capture = useDesignMetadata('Skeleton');
  return (
    <div
      ref={ref}
      aria-hidden
      data-animated={animated ? 'true' : 'false'}
      className={cn(
        animated && 'animate-pulse motion-reduce:animate-none',
        'rounded-control bg-surface-selected',
        className,
      )}
      {...props}
      {...capture}
    />
  );
});

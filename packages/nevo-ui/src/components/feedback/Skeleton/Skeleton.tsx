import { forwardRef, type HTMLAttributes } from 'react';
import { cn } from '../../../lib';
import { useDesignMetadata } from '@nevo/figma-capture/metadata';
export const Skeleton = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  function Skeleton({ className, ...props }, ref) {
    const capture = useDesignMetadata('Skeleton');
    return (
      <div
        ref={ref}
        aria-hidden
        className={cn('animate-pulse rounded-control bg-surface-selected', className)}
        {...props}
        {...capture}
      />
    );
  },
);

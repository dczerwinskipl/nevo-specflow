import { forwardRef, type HTMLAttributes } from 'react';
import { designLayerMetadata, useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../lib';

type ProgressAccessibilityProps =
  | {
      'aria-label': string;
      'aria-labelledby'?: never;
    }
  | {
      'aria-label'?: never;
      'aria-labelledby': string;
    };

export type ProgressProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  'aria-label' | 'aria-labelledby' | 'children'
> &
  ProgressAccessibilityProps & {
    value: number;
    max?: number;
  };

export function normalizeProgressValue(value: number, max: number) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const safeValue = Number.isFinite(value) ? Math.min(Math.max(value, 0), safeMax) : 0;

  return {
    max: safeMax,
    value: safeValue,
    percentage: (safeValue / safeMax) * 100,
  };
}

export const Progress = forwardRef<HTMLDivElement, ProgressProps>(function Progress(
  { className, max = 100, value, style, ...props },
  ref,
) {
  const normalized = normalizeProgressValue(value, max);
  const capture = useDesignMetadata('Progress');

  return (
    <div
      ref={ref}
      aria-valuemax={normalized.max}
      aria-valuemin={0}
      aria-valuenow={normalized.value}
      className={cn(
        'h-progress-track w-full overflow-hidden rounded-full bg-surface-control',
        className,
      )}
      role="progressbar"
      style={style}
      {...props}
      {...capture}
    >
      <div
        className="h-full rounded-[inherit] bg-progress-fill transition-[width] [transition-duration:var(--motion-duration-normal)] [transition-timing-function:var(--motion-ease-standard)] motion-reduce:transition-none"
        style={{ width: `${normalized.percentage}%` }}
        {...designLayerMetadata({ key: 'fill', layer: 'fill' })}
      />
    </div>
  );
});




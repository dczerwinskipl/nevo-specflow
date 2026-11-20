import { forwardRef, useEffect, useRef, useState, type HTMLAttributes } from 'react';
import { designLayerMetadata, useDesignMetadata } from '@nevo/figma-capture/metadata';
import { cn } from '../../../lib';
import { tv } from 'tailwind-variants/lite';

const progressVariants = tv({
  base: 'overflow-hidden rounded-full',
  variants: {
    size: { default: 'h-progress-track', compact: 'h-1' },
    representation: {
      segmented: 'flex w-full gap-0.5',
      continuous: 'w-full bg-surface-control',
      // Intrinsic width (20 px segments, a 40 px current one) up to 16rem; the segments shrink to
      // fit a narrower container and never below 4 px.
      position: 'flex w-fit max-w-[min(100%,16rem)] gap-0.5',
    },
  },
});

/**
 * Where a step sits among `total` workflow steps. A position, not progress: after a return to an
 * earlier step the current segment moves back. `step` is 1-based.
 */
export type ProgressPosition =
  | { readonly state: 'not-started' }
  | { readonly state: 'current'; readonly step: number }
  | { readonly state: 'completed' }
  | { readonly state: 'abandoned'; readonly step: number };

type PositionSegment = 'before' | 'current' | 'after' | 'next' | 'completed' | 'ended';

const positionSegmentClasses: Record<PositionSegment, string> = {
  before: 'w-5 bg-content-secondary/60',
  current: 'w-10 bg-status-info',
  after: 'w-5 bg-surface-control',
  // Not started: the first step is outlined as the one that comes next.
  next: 'w-5 bg-surface-control shadow-[inset_0_0_0_1px_var(--color-status-info)]',
  completed: 'w-5 bg-status-success',
  ended: 'w-5 bg-content-muted',
};

export function validProgressPosition(position: ProgressPosition, total: number) {
  if (!Number.isSafeInteger(total) || total <= 0) {
    return false;
  }

  return position.state === 'current' || position.state === 'abandoned'
    ? Number.isSafeInteger(position.step) && position.step >= 1 && position.step <= total
    : true;
}

/** The kind of each of the `total` segments for a position (index 0 is step 1). */
export function progressPositionSegments(
  position: ProgressPosition,
  total: number,
): PositionSegment[] {
  return Array.from({ length: total }, (_, index): PositionSegment => {
    const step = index + 1;
    switch (position.state) {
      case 'not-started':
        return step === 1 ? 'next' : 'after';
      case 'completed':
        return 'completed';
      case 'abandoned':
        return step <= position.step ? 'ended' : 'after';
      case 'current':
        return step < position.step ? 'before' : step === position.step ? 'current' : 'after';
    }
  });
}

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
    size?: 'default' | 'compact';
  } & (
    | {
        variant: 'segmented';
        completed: number;
        total: number;
        position?: never;
        value?: never;
        max?: never;
      }
    | {
        /**
         * Position mode: one segment per step showing where the step sits, not how much is done.
         * Renders `role="img"`; the accessible label names the position ("Step 4 of 7: Review").
         */
        variant: 'segmented';
        position: ProgressPosition;
        total: number;
        completed?: never;
        value?: never;
        max?: never;
      }
    | {
        variant?: 'continuous';
        value: number;
        max?: number;
        completed?: never;
        total?: never;
        position?: never;
      }
  );

export function fitsProgressSegments(width: number, total: number) {
  return total > 0 && (width - (total - 1) * 2) / total >= 4;
}

export function validProgressCounts(completed: number, total: number) {
  return (
    Number.isSafeInteger(total) &&
    total > 0 &&
    Number.isSafeInteger(completed) &&
    completed >= 0 &&
    completed <= total
  );
}

export function normalizeProgressValue(value: number, max: number) {
  const safeMax = Number.isFinite(max) && max > 0 ? max : 100;
  const safeValue = Number.isFinite(value) ? Math.min(Math.max(value, 0), safeMax) : 0;

  return {
    max: safeMax,
    value: safeValue,
    percentage: (safeValue / safeMax) * 100,
  };
}

export const Progress = forwardRef<HTMLDivElement, ProgressProps>(function Progress(input, ref) {
  const {
    className,
    variant = 'continuous',
    size = 'default',
    style,
    completed: _completed,
    total: _total,
    value: _value,
    max: _max,
    position: _position,
    ...props
  } = input;
  const element = useRef<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(0);
  const position = input.variant === 'segmented' ? input.position : undefined;
  const counts =
    input.variant === 'segmented' && input.position === undefined
      ? { completed: input.completed, total: input.total }
      : undefined;
  const segmented = Boolean(counts);
  const valid = position
    ? validProgressPosition(position, input.total ?? 0)
    : !counts || validProgressCounts(counts.completed, counts.total);
  const normalized =
    input.variant === 'segmented'
      ? normalizeProgressValue(input.completed ?? 0, input.total)
      : normalizeProgressValue(input.value, input.max ?? 100);
  useEffect(() => {
    if (!segmented || !element.current) {
      return;
    }

    const node = element.current;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(node);

    return () => observer.disconnect();
  }, [segmented, valid]);
  const capture = useDesignMetadata('Progress', {
    size,
    variant: position ? 'segmented-position' : variant,
  });
  if (!valid) {
    return null;
  }

  if (position) {
    // No ResizeObserver and no transition: the segments shrink with CSS, and a position change
    // is a new fact rather than a movement to animate.
    return (
      <div
        ref={ref}
        className={progressVariants({ size, representation: 'position', className })}
        role="img"
        data-progress-representation="position"
        data-progress-position={position.state}
        style={style}
        {...props}
        {...capture}
      >
        {progressPositionSegments(position, input.total ?? 0).map((kind, index) => (
          <div
            key={index}
            aria-hidden="true"
            data-progress-segment={kind}
            className={cn('h-full min-w-1 shrink rounded-[2px]', positionSegmentClasses[kind])}
          />
        ))}
      </div>
    );
  }

  const showSegments = counts && fitsProgressSegments(width, counts.total);

  return (
    <div
      ref={(node) => {
        element.current = node;
        if (typeof ref === 'function') {
          return ref(node);
        }

        if (ref) {
          ref.current = node;
        }
      }}
      aria-valuemax={normalized.max}
      aria-valuemin={0}
      aria-valuenow={normalized.value}
      className={progressVariants({
        size,
        representation: showSegments ? 'segmented' : 'continuous',
        className,
      })}
      role="progressbar"
      data-progress-representation={showSegments ? 'segmented' : 'continuous'}
      style={style}
      {...props}
      {...capture}
    >
      {showSegments ? (
        Array.from({ length: counts.total }, (_, index) => (
          <div
            key={index}
            aria-hidden="true"
            data-progress-segment
            data-completed={index < counts.completed ? 'true' : 'false'}
            className={cn(
              'h-full min-w-0 flex-1 rounded-[2px]',
              index < counts.completed ? 'bg-progress-fill' : 'bg-surface-control',
            )}
          />
        ))
      ) : (
        <div
          className="h-full rounded-[inherit] bg-progress-fill transition-[width] [transition-duration:var(--motion-duration-normal)] [transition-timing-function:var(--motion-ease-standard)] motion-reduce:transition-none"
          style={{ width: `${normalized.percentage}%` }}
          {...designLayerMetadata({ key: 'fill', layer: 'fill' })}
        />
      )}
    </div>
  );
});

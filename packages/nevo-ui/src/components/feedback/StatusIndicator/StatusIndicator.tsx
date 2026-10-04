import { forwardRef, type HTMLAttributes } from 'react';
import { tv, type VariantProps } from 'tailwind-variants/lite';
import { useDesignMetadata } from '@nevo/figma-capture/metadata';
import type { StatusTone } from '../../../design-system/statusTone';
import { cn } from '../../../lib';

export const statusIndicatorVariants = tv({
  base: 'inline-block shrink-0 rounded-full',
  variants: {
    tone: {
      neutral: 'bg-content-muted',
      info: 'bg-status-info',
      success: 'bg-status-success',
      attention: 'bg-status-attention',
      danger: 'bg-status-danger',
    },
    size: {
      sm: 'size-status-indicator-sm',
      md: 'size-status-indicator-md',
    },
  },
  defaultVariants: {
    tone: 'neutral',
    size: 'sm',
  },
});

export type StatusIndicatorSize = NonNullable<VariantProps<typeof statusIndicatorVariants>['size']>;

type StatusIndicatorAccessibilityProps =
  | {
      decorative?: true;
      'aria-label'?: never;
    }
  | {
      decorative: false;
      'aria-label': string;
    };

export type StatusIndicatorProps = Omit<
  HTMLAttributes<HTMLSpanElement>,
  'aria-label' | 'children'
> &
  Pick<VariantProps<typeof statusIndicatorVariants>, 'size'> &
  StatusIndicatorAccessibilityProps & {
    tone?: StatusTone;
  };

export const StatusIndicator = forwardRef<HTMLSpanElement, StatusIndicatorProps>(
  function StatusIndicator(
    {
      'aria-label': ariaLabel,
      className,
      decorative = true,
      size = 'sm',
      tone = 'neutral',
      ...props
    },
    ref,
  ) {
    const capture = useDesignMetadata('StatusIndicator', { tone, size });

    return (
      <span
        ref={ref}
        aria-hidden={decorative || undefined}
        aria-label={decorative ? undefined : ariaLabel}
        role={decorative ? undefined : 'img'}
        className={cn(statusIndicatorVariants({ tone, size }), className)}
        {...props}
        {...capture}
      />
    );
  },
);

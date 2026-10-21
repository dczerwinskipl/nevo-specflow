import { forwardRef, type HTMLAttributes } from 'react';
import { tv } from 'tailwind-variants/lite';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import type { StatusTone } from '../../../design-system/statusTone';
import { cn } from '../../../lib';

export const badgeVariants = tv({
  base: 'inline-flex w-fit items-center rounded-full border px-2 font-sans text-label-sm',
  variants: {
    /** `compact` has no minimum height or vertical padding, so it fits inside a one-line row. */
    size: {
      default: 'min-h-5 py-0.5',
      compact: 'py-0',
    },
    tone: {
      neutral: 'border-border-default bg-surface-subtle text-content-secondary',
      info: 'border-status-info/30 bg-status-info/10 text-status-info',
      success: 'border-status-success/30 bg-status-success/10 text-status-success',
      attention: 'border-status-attention/30 bg-status-attention/10 text-status-attention',
      danger: 'border-status-danger/30 bg-status-danger/10 text-status-danger',
    },
  },
  defaultVariants: { size: 'default', tone: 'neutral' },
});

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: StatusTone;
  /** `compact` for rows with a fixed one-line height (tree rows). Default `default`. */
  size?: 'default' | 'compact';
}
export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(function Badge(
  { children, className, size = 'default', tone, ...props },
  ref,
) {
  const resolvedTone = tone ?? 'neutral';
  const capture = useDesignMetadata('Badge', { tone: resolvedTone });
  return (
    <span
      ref={ref}
      className={cn(badgeVariants({ size, tone: resolvedTone }), className)}
      {...props}
      {...capture}
    >
      <span {...designSlot('Badge', 'label')}>{children}</span>
    </span>
  );
});

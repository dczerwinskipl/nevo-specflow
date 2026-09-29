import { type HTMLAttributes } from 'react';
import { cn } from '../../../lib';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { Icon } from '../../foundations/Icon';
export interface SpinnerProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
  label?: string;
  size?: 'sm' | 'md';
}
export function Spinner({ className, label, size = 'md', ...props }: SpinnerProps) {
  const capture = useDesignMetadata('Spinner', { size });
  return (
    <span
      className={cn('inline-flex items-center justify-center text-content-muted', className)}
      role={label ? 'status' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      {...props}
      {...capture}
    >
      <span className="inline-flex" {...designSlot('Spinner', 'icon')}>
        <Icon name="loader" size={size} className="animate-spin" />
      </span>
    </span>
  );
}

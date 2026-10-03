import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { tv } from 'tailwind-variants/lite';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import type { StatusTone } from '../../../design-system/statusTone';
import { cn } from '../../../lib';
import { Icon, type IconName } from '../../foundations/Icon';

export const alertVariants = tv({
  base: 'rounded-composite border px-4 py-3',
  variants: {
    tone: {
      neutral: 'border-border-default bg-surface-subtle',
      info: 'border-status-info/30 bg-status-info/5',
      success: 'border-status-success/30 bg-status-success/5',
      attention: 'border-status-attention/30 bg-status-attention/5',
      danger: 'border-status-danger/30 bg-status-danger/5',
    },
  },
  defaultVariants: { tone: 'neutral' },
});

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode;
  actions?: ReactNode;
  /** Override the semantic tone icon. Pass null to intentionally hide it. */
  icon?: IconName | null;
  tone?: StatusTone;
}
const toneIcons = {
  neutral: null,
  info: 'info',
  success: 'circle-check',
  attention: 'triangle-alert',
  danger: 'circle-alert',
} as const satisfies Record<StatusTone, IconName | null>;

const toneIconClasses = {
  neutral: 'text-content-muted',
  info: 'text-status-info',
  success: 'text-status-success',
  attention: 'text-status-attention',
  danger: 'text-status-danger',
} as const satisfies Record<StatusTone, string>;

export const Alert = forwardRef<HTMLDivElement, AlertProps>(function Alert(
  { actions, children, className, icon, title, tone = 'neutral', role, ...props },
  ref,
) {
  const capture = useDesignMetadata('Alert', { tone });
  const resolvedIcon = icon === undefined ? toneIcons[tone] : icon;
  return (
    <div
      ref={ref}
      className={cn(alertVariants({ tone }), className)}
      role={role}
      {...props}
      {...capture}
    >
      <div className="flex items-start gap-3">
        {resolvedIcon ? (
          <span
            className={cn('mt-0.5 shrink-0', toneIconClasses[tone])}
            {...designSlot('Alert', 'icon')}
          >
            <Icon name={resolvedIcon} size="md" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          {title ? (
            <div className="text-label-md text-content-primary" {...designSlot('Alert', 'title')}>
              {title}
            </div>
          ) : null}
          {children ? (
            <div
              className={cn('text-body-sm text-content-secondary', title && 'mt-1')}
              {...designSlot('Alert', 'body')}
            >
              {children}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="shrink-0" {...designSlot('Alert', 'actions')}>
            {actions}
          </div>
        ) : null}
      </div>
    </div>
  );
});

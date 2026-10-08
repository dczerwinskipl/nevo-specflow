import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../../../lib';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import { Icon, type IconGlyph } from '../../foundations/Icon';
export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title: ReactNode;
  description?: ReactNode;
  icon?: IconGlyph;
  actions?: ReactNode;
}
export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { actions, className, description, icon, title, ...props },
  ref,
) {
  const capture = useDesignMetadata('EmptyState');
  return (
    <div
      ref={ref}
      className={cn(
        'flex min-h-40 flex-col items-center justify-center gap-2 rounded-composite border border-border-default px-6 py-10 text-center',
        className,
      )}
      {...props}
      {...capture}
    >
      {icon ? (
        <div className="text-content-muted" {...designSlot('EmptyState', 'icon')}>
          <Icon name={icon} size="md" />
        </div>
      ) : null}
      <div className="text-title-sm text-content-primary" {...designSlot('EmptyState', 'title')}>
        {title}
      </div>
      {description ? (
        <div
          className="max-w-md text-body-sm text-content-muted"
          {...designSlot('EmptyState', 'description')}
        >
          {description}
        </div>
      ) : null}
      {actions ? (
        <div
          className="flex flex-wrap justify-center gap-2"
          {...designSlot('EmptyState', 'actions')}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
});

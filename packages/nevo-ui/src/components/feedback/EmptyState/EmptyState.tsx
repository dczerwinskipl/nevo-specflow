import {
  forwardRef,
  isValidElement,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { tv } from 'tailwind-variants/lite';
import { cn } from '../../../lib';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import { Icon, type IconGlyph } from '../../foundations/Icon';

export type EmptyStateVariant = 'default' | 'pane';

export const emptyStateVariants = tv({
  base: 'flex min-w-0 flex-col items-center justify-center text-center',
  variants: {
    variant: {
      // An empty block inside a page: its own quiet boundary.
      default: 'min-h-40 rounded-composite border border-border-default px-6 py-10',
      // The whole area is empty: no boundary; it takes the host's free block size and centres itself.
      pane: 'min-h-full flex-1 px-6 py-12',
    },
  },
  defaultVariants: { variant: 'default' },
});

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** A short noun phrase without a full stop ("No current specifications"). */
  title: ReactNode;
  /** One or two sentences: why the area is empty and what the user can do. */
  description?: ReactNode;
  /**
   * The picture above the title (decorative): a registry glyph drawn large and muted, or an
   * element (a custom illustration) that replaces it.
   */
  icon?: IconGlyph | ReactElement;
  /** Glyph size; defaults to `xl` in a `pane` and `lg` in the `default` block. */
  iconSize?: 'lg' | 'xl';
  /**
   * The actions, in order. At most one primary (the filled default `Button`), and it comes first;
   * every other action is `variant="secondary"`. A state that only offers a way out (clear the
   * search, go back) has no primary.
   */
  actions?: ReactNode;
  /**
   * `default`: an empty block inside a page (bordered). `pane`: the whole area is empty
   * (borderless, fills the free height of its host and centres the content).
   */
  variant?: EmptyStateVariant;
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { actions, className, description, icon, iconSize, title, variant = 'default', ...props },
  ref,
) {
  const capture = useDesignMetadata('EmptyState', { variant });
  return (
    <div
      ref={ref}
      data-empty-state={variant}
      className={cn(emptyStateVariants({ variant }), className)}
      {...props}
      {...capture}
    >
      {icon ? (
        <div
          aria-hidden="true"
          className="mb-5 flex shrink-0 justify-center text-content-muted"
          {...designSlot('EmptyState', 'icon')}
        >
          {isValidElement(icon) ? (
            icon
          ) : (
            <Icon name={icon} size={iconSize ?? (variant === 'pane' ? 'xl' : 'lg')} />
          )}
        </div>
      ) : null}
      <div
        className="max-w-sm text-title-md text-balance text-content-primary"
        {...designSlot('EmptyState', 'title')}
      >
        {title}
      </div>
      {description ? (
        <div
          className="mt-2 max-w-sm text-body-md text-balance text-content-secondary"
          {...designSlot('EmptyState', 'description')}
        >
          {description}
        </div>
      ) : null}
      {actions ? (
        <div
          className="mt-6 flex max-w-full flex-wrap justify-center gap-3"
          {...designSlot('EmptyState', 'actions')}
        >
          {actions}
        </div>
      ) : null}
    </div>
  );
});

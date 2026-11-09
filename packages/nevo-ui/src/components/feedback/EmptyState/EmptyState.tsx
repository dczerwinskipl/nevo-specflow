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

export type EmptyStateVariant = 'default' | 'pane' | 'inline';

export const emptyStateVariants = tv({
  base: 'flex min-w-0',
  variants: {
    variant: {
      // An empty block inside a page: its own quiet boundary.
      default:
        'min-h-40 flex-col items-center justify-center rounded-composite border border-border-default px-6 py-10 text-center',
      // The whole area is empty: no boundary; it takes the host's free block size and centres itself.
      pane: 'min-h-full flex-1 flex-col items-center justify-center px-6 py-12 text-center',
      // An empty section body: no boundary, the height and inset of a list row, aligned to the start.
      inline: 'flex-row items-start gap-3 px-2 py-2 text-left',
    },
  },
  defaultVariants: { variant: 'default' },
});

const slots = {
  centred: {
    icon: 'mb-5 flex shrink-0 justify-center text-content-muted',
    title: 'max-w-sm text-title-md text-balance text-content-primary',
    description: 'mt-2 max-w-sm text-body-md text-balance text-content-secondary',
    actions: 'mt-6 flex max-w-full flex-wrap justify-center gap-3',
  },
  inline: {
    // A 20 px glyph centred on the first 24 px line of the title.
    icon: 'mt-0.5 flex shrink-0 text-content-muted',
    title: 'text-body-md font-medium text-content-primary',
    description: 'text-body-sm text-content-secondary',
    actions: 'mt-3 flex max-w-full flex-wrap gap-3',
  },
} as const;

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** A short noun phrase without a full stop ("No current specifications"). */
  title: ReactNode;
  /** One or two sentences: why the area is empty and what the user can do. */
  description?: ReactNode;
  /**
   * The picture (decorative): a registry glyph drawn muted (large above the title in `default` and
   * `pane`, control-sized beside it in `inline`), or an element (a custom illustration) that
   * replaces it.
   */
  icon?: IconGlyph | ReactElement;
  /** Illustration glyph size; defaults to `xl` in a `pane` and `lg` in the `default` block. */
  iconSize?: 'lg' | 'xl';
  /**
   * The actions, in order. At most one primary (the filled default `Button`), and it comes first;
   * every other action is `variant="secondary"`. A state that only offers a way out (clear the
   * search, go back) has no primary.
   */
  actions?: ReactNode;
  /**
   * `default`: an empty block inside a page (bordered). `pane`: the whole area is empty
   * (borderless, fills the free height of its host and centres the content). `inline`: the body of
   * a page section that has no rows (borderless, row-sized, aligned to the start, a control-sized
   * glyph beside the text).
   */
  variant?: EmptyStateVariant;
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(function EmptyState(
  { actions, className, description, icon, iconSize, title, variant = 'default', ...props },
  ref,
) {
  const capture = useDesignMetadata('EmptyState', { variant });
  const inline = variant === 'inline';
  const slot = inline ? slots.inline : slots.centred;
  const glyphSize = inline ? 'md' : (iconSize ?? (variant === 'pane' ? 'xl' : 'lg'));
  const text = (
    <>
      <div className={slot.title} {...designSlot('EmptyState', 'title')}>
        {title}
      </div>
      {description ? (
        <div className={slot.description} {...designSlot('EmptyState', 'description')}>
          {description}
        </div>
      ) : null}
      {actions ? (
        <div className={slot.actions} {...designSlot('EmptyState', 'actions')}>
          {actions}
        </div>
      ) : null}
    </>
  );

  return (
    <div
      ref={ref}
      data-empty-state={variant}
      className={cn(emptyStateVariants({ variant }), className)}
      {...props}
      {...capture}
    >
      {icon ? (
        <div aria-hidden="true" className={slot.icon} {...designSlot('EmptyState', 'icon')}>
          {isValidElement(icon) ? icon : <Icon name={icon} size={glyphSize} />}
        </div>
      ) : null}
      {inline ? <div className="grid min-w-0 gap-0.5">{text}</div> : text}
    </div>
  );
});

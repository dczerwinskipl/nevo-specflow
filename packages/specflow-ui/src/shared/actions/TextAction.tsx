import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Icon, cn, hitAreaBlockClassName } from '@nevo/ui';

/**
 * The one look of a text action (interaction-model.md "Visual conventions", Actions). Its hit area
 * reaches the target size on the block axis (24px, 44px on coarse pointers), as the DS `Link` does.
 */
export const textActionClassName = `${hitAreaBlockClassName} cursor-pointer rounded-control-inline text-left font-medium text-content-link underline-offset-2 hover:text-content-link-hover hover:underline focus-visible:outline-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed`;

export interface TextActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * A trailing chevron with its one meaning (Visual conventions, Disclosure): `navigate` (right)
   * opens details elsewhere. Expanding in place is {@link DisclosureToggle}.
   */
  readonly chevron?: 'navigate';
}

/**
 * A text action: an in-page action or a way to details that reads as a link ("View dependencies",
 * "See Tasks", "Show feedback"). It acts here rather than following an address, so it is a button;
 * an address is the DS `Link`. Blue is the action colour; it never carries status.
 */
export const TextAction = forwardRef<HTMLButtonElement, TextActionProps>(function TextAction(
  { className, chevron, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(textActionClassName, chevron && 'inline-flex items-center gap-1', className)}
      {...props}
    >
      {children}
      {chevron === 'navigate' ? (
        <Icon name="chevron-right" size="sm" aria-hidden="true" className="shrink-0" />
      ) : null}
    </button>
  );
});

/**
 * Expands or collapses content in place (Show more / Show less, Show feedback, Show description):
 * the text action with a chevron down that turns up while open. Every disclosure of the three
 * screens uses it, so they look and behave the same.
 */
export const DisclosureToggle = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { readonly expanded: boolean }
>(function DisclosureToggle({ expanded, className, children, ...props }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      aria-expanded={expanded}
      className={cn(
        textActionClassName,
        'inline-flex min-h-6 w-fit items-center gap-1 text-body-sm',
        className,
      )}
      {...props}
    >
      {children}
      <Icon
        name="chevron-down"
        size="sm"
        aria-hidden="true"
        className={cn(
          'shrink-0 transition-transform motion-reduce:transition-none',
          expanded && 'rotate-180',
        )}
      />
    </button>
  );
});

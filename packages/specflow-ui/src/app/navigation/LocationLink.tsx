import { forwardRef, type AnchorHTMLAttributes } from 'react';
import { createLink } from '@tanstack/react-router';
import { cn, Link } from '@nevo/ui';
/** Breadcrumbs own current-page semantics; ancestors still use canonical router links. */
export const LocationLink = createLink(
  forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(function AncestorLink(
    { className, ...props },
    ref,
  ) {
    return (
      <a
        {...props}
        ref={ref}
        className={cn(
          'outline-none focus-visible:outline-2 focus-visible:outline-focus-ring',
          className,
        )}
        aria-current={undefined}
      />
    );
  }),
);

/** A contextual "back" link standing alone in its own row: DS standalone layout owns the hit area. */
export const BackLink = createLink(
  forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(function BackAnchor(
    { className, ...props },
    ref,
  ) {
    return (
      <Link
        {...props}
        ref={ref}
        layout="standalone"
        tone="muted"
        className={cn('min-w-0 gap-1.5', className)}
        aria-current={undefined}
      />
    );
  }),
);

/** A router link that stands alone in its own row (for example "all sessions"): DS standalone layout owns the hit area. */
export const StandaloneLink = createLink(
  forwardRef<HTMLAnchorElement, AnchorHTMLAttributes<HTMLAnchorElement>>(function StandaloneAnchor(
    { className, ...props },
    ref,
  ) {
    return (
      <Link
        {...props}
        ref={ref}
        layout="standalone"
        className={cn('gap-1.5 text-body-sm', className)}
        aria-current={undefined}
      />
    );
  }),
);

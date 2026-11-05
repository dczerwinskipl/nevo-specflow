import { createContext, useContext, type HTMLAttributes, type ReactElement } from 'react';
import { cn } from '../../../lib';
import { Link, linkVariants } from '../../actions/Link';

export interface BreadcrumbItemProps extends HTMLAttributes<HTMLSpanElement> {
  current?: boolean;
  href?: string;
  /**
   * In-app navigation without a URL (for example popping a Secondary stack to this level): the
   * segment renders as a button with the muted link look. Takes precedence over `href`.
   */
  onPress?: () => void;
}

export type BreadcrumbItemElement = ReactElement<BreadcrumbItemProps, typeof BreadcrumbItem>;

/** Set by `Breadcrumbs` for the last segment, so the current page needs no explicit prop. */
export const BreadcrumbCurrentContext = createContext(false);

export function BreadcrumbItem({
  'aria-current': _ariaCurrent,
  children,
  className,
  current,
  href,
  onPress,
  title,
  ...props
}: BreadcrumbItemProps) {
  const inferredCurrent = useContext(BreadcrumbCurrentContext);
  const resolvedCurrent = current ?? inferredCurrent;
  const itemClassName = cn('block min-w-0 max-w-full truncate', className);
  // A segment truncates with an ellipsis; plain-text segments keep their full text reachable as
  // the native tooltip (the same convention as the Opened and overflow menus' truncated rows).
  const resolvedTitle = title ?? (typeof children === 'string' ? children : undefined);

  if (resolvedCurrent) {
    return (
      <span
        aria-current="page"
        className={cn(itemClassName, 'text-content-primary')}
        title={resolvedTitle}
        {...props}
      >
        {children}
      </span>
    );
  }

  if (onPress) {
    return (
      <button
        type="button"
        className={cn(linkVariants({ tone: 'muted' }), itemClassName, 'text-left')}
        onClick={onPress}
        title={resolvedTitle}
        {...props}
      >
        {children}
      </button>
    );
  }

  if (href) {
    return (
      <Link href={href} tone="muted" className={itemClassName} title={resolvedTitle} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <span className={cn(itemClassName, 'text-content-muted')} title={resolvedTitle} {...props}>
      {children}
    </span>
  );
}

import {
  Children,
  cloneElement,
  isValidElement,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../lib';
import { Link } from '../../actions/Link';
import { Icon } from '../../foundations/Icon';

export interface BreadcrumbsProps extends HTMLAttributes<HTMLElement> {
  children: ReactNode;
  label?: string;
}

export function Breadcrumbs({
  children,
  className,
  label = 'Breadcrumbs',
  ...props
}: BreadcrumbsProps) {
  const capture = useDesignMetadata('Breadcrumbs');
  const items = Children.toArray(children);

  return (
    <nav aria-label={label} className={className} {...props} {...capture}>
      <ol
        className="flex flex-wrap items-center gap-1 text-body-sm text-content-muted"
        {...designSlot('Breadcrumbs', 'items')}
      >
        {items.map((child, index) => (
          <li
            key={isValidElement(child) && child.key ? child.key : index}
            className="flex min-w-0 items-center gap-1"
          >
            {isValidElement(child)
              ? cloneElement(child as ReactElement<{ current?: boolean }>, {
                  current: index === items.length - 1,
                })
              : child}
            {index < items.length - 1 ? (
              <Icon aria-hidden name="chevron-right" size="sm" className="text-content-muted" />
            ) : null}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export interface BreadcrumbItemProps extends HTMLAttributes<HTMLSpanElement> {
  current?: boolean;
  href?: string;
}

export function BreadcrumbItem({
  'aria-current': _ariaCurrent,
  children,
  className,
  current,
  href,
  ...props
}: BreadcrumbItemProps) {
  const itemClassName = cn('block min-w-0 max-w-full truncate', className);

  if (current) {
    return (
      <span aria-current="page" className={cn(itemClassName, 'text-content-primary')} {...props}>
        {children}
      </span>
    );
  }

  if (href) {
    return (
      <Link href={href} tone="muted" className={itemClassName} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <span className={cn(itemClassName, 'text-content-muted')} {...props}>
      {children}
    </span>
  );
}




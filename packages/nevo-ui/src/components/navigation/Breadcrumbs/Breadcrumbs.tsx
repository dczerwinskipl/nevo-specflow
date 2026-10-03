import {
  Children,
  createContext,
  isValidElement,
  useContext,
  type HTMLAttributes,
  type ReactElement,
} from 'react';
import { designSlot, useDesignMetadata } from '@nevo/figma-core/metadata';
import { cn } from '../../../lib';
import { Link } from '../../actions/Link';
import { Icon } from '../../foundations/Icon';

export type BreadcrumbItemElement = ReactElement<BreadcrumbItemProps, typeof BreadcrumbItem>;

export interface BreadcrumbsProps extends HTMLAttributes<HTMLElement> {
  children: BreadcrumbItemElement | BreadcrumbItemElement[];
  label?: string;
}

const BreadcrumbCurrentContext = createContext(false);

function isBreadcrumbItemElement(child: unknown): child is BreadcrumbItemElement {
  return isValidElement(child) && child.type === BreadcrumbItem;
}

export function Breadcrumbs({
  children,
  className,
  label = 'Breadcrumbs',
  ...props
}: BreadcrumbsProps) {
  const capture = useDesignMetadata('Breadcrumbs');
  const items = Children.toArray(children).map((child) => {
    if (!isBreadcrumbItemElement(child)) {
      throw new Error('Breadcrumbs children must be BreadcrumbItem elements.');
    }
    return child;
  });

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
            <BreadcrumbCurrentContext.Provider value={index === items.length - 1}>
              {child}
            </BreadcrumbCurrentContext.Provider>
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
  const inferredCurrent = useContext(BreadcrumbCurrentContext);
  const resolvedCurrent = current ?? inferredCurrent;
  const itemClassName = cn('block min-w-0 max-w-full truncate', className);

  if (resolvedCurrent) {
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

import { Children, isValidElement, type HTMLAttributes, type ReactNode } from 'react';
import { designSlot, useDesignMetadata } from '@nevo/figma-capture/metadata';
import { cn } from '../../../lib';
import { Icon } from '../../foundations/Icon';
import { useElementWidth } from '../../behaviors/useElementWidth';
import {
  BreadcrumbCurrentContext,
  BreadcrumbItem,
  type BreadcrumbItemElement,
} from './BreadcrumbItem';
import { BreadcrumbOverflow } from './BreadcrumbOverflow';
import { collapseBreadcrumbs } from './breadcrumbsLayout';

export {
  BreadcrumbItem,
  type BreadcrumbItemElement,
  type BreadcrumbItemProps,
} from './BreadcrumbItem';
export {
  BREADCRUMBS_COLLAPSE_BELOW,
  BREADCRUMBS_MAX_VISIBLE,
  collapseBreadcrumbs,
} from './breadcrumbsLayout';

export interface BreadcrumbsProps extends HTMLAttributes<HTMLElement> {
  children: BreadcrumbItemElement | BreadcrumbItemElement[];
  label?: string;
  /**
   * `wrap` (default): segments wrap onto further lines. `collapse`: one line for a fixed-height
   * row — ancestors truncate at a capped width, the current page takes the remaining space and
   * truncates, and middle segments fold into a `…` menu (`collapseBreadcrumbs`): all of them
   * below `collapseBelow` measured px, else beyond four visible segments.
   */
  overflow?: 'wrap' | 'collapse';
  /** Measured width (px) under which `collapse` folds every middle segment. Default 480. */
  collapseBelow?: number;
  /** Accessible name of the `…` menu trigger. */
  collapsedLabel?: string;
  /** Content before the trail inside the same row (for example a one-level Back icon button). */
  leading?: ReactNode;
}

function isBreadcrumbItemElement(child: unknown): child is BreadcrumbItemElement {
  return isValidElement(child) && child.type === BreadcrumbItem;
}

function Separator() {
  return (
    <Icon aria-hidden name="chevron-right" size="sm" className="shrink-0 text-content-muted" />
  );
}

export function Breadcrumbs({
  children,
  className,
  label = 'Breadcrumbs',
  overflow = 'wrap',
  collapseBelow,
  collapsedLabel = 'Show hidden levels',
  leading,
  ...props
}: BreadcrumbsProps) {
  const capture = useDesignMetadata('Breadcrumbs');
  const { width, setElement } = useElementWidth<HTMLElement>();
  const items = Children.toArray(children).map((child) => {
    if (!isBreadcrumbItemElement(child)) {
      throw new Error('Breadcrumbs children must be BreadcrumbItem elements.');
    }

    return child;
  });
  const collapse = overflow === 'collapse';
  const { visible, hidden } = collapse
    ? collapseBreadcrumbs(items.length, width, collapseBelow)
    : { visible: items.map((_, index) => index), hidden: [] };
  const hiddenItems = hidden.map((index) => items[index]!);
  const last = items.length - 1;

  return (
    <nav
      aria-label={label}
      className={cn(collapse && 'flex min-w-0 items-center gap-1', className)}
      ref={collapse ? setElement : undefined}
      {...props}
      {...capture}
    >
      {leading}
      <ol
        className={cn(
          'flex items-center gap-1 text-body-sm text-content-muted',
          collapse ? 'min-w-0 flex-1 flex-nowrap' : 'flex-wrap',
        )}
        {...designSlot('Breadcrumbs', 'items')}
      >
        {visible.map((index, position) => {
          const child = items[index]!;
          const isCurrent = index === last;

          return [
            <li
              key={isValidElement(child) && child.key ? child.key : index}
              className={cn(
                'flex min-w-0 items-center gap-1',
                // Ancestors stop at a readable cap so the current page keeps the remaining room.
                collapse && !isCurrent && 'max-w-48',
              )}
            >
              <BreadcrumbCurrentContext.Provider value={isCurrent}>
                {child}
              </BreadcrumbCurrentContext.Provider>
              {isCurrent ? null : <Separator />}
            </li>,
            position === 0 && hiddenItems.length > 0 ? (
              <li key="breadcrumbs-overflow" className="flex shrink-0 items-center gap-1">
                <BreadcrumbOverflow items={hiddenItems} label={collapsedLabel} />
                <Separator />
              </li>
            ) : null,
          ];
        })}
      </ol>
    </nav>
  );
}

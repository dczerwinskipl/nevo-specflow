import { Fragment } from 'react';
import { cn } from '../../../lib';
import { Icon } from '../../foundations/Icon';
import { MenuItem, MenuLabel, MenuNote, MenuSeparator } from '../../overlays/Menu';
import type { ItemTab, ItemTabsLabels } from './itemTabsTypes';

export function DirtyDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('size-2 shrink-0 rounded-full bg-status-attention', className)}
    />
  );
}

const distinctDescription = (item: ItemTab) =>
  item.description !== undefined && item.description !== item.label;

export interface OpenedMenuProps {
  items: readonly ItemTab[];
  activeId: string | null;
  labels: ItemTabsLabels;
  hintId: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}

export function OpenedMenuBody({
  items,
  activeId,
  labels,
  hintId,
  onActivate,
  onClose,
}: OpenedMenuProps) {
  return (
    <>
      <MenuLabel>{labels.openedHeading}</MenuLabel>
      {items.map((item) => (
        <Fragment key={item.id}>
          <MenuItem
            onSelect={() => onActivate(item.id)}
            onKeyDown={(event) => {
              if (event.key === 'Delete') onClose(item.id);
            }}
            aria-current={item.id === activeId ? 'true' : undefined}
            leadingIcon={item.state === 'missing' ? 'triangle-alert' : item.icon}
            className={item.state === 'missing' ? 'text-content-muted' : undefined}
            // The rows stay one compact height: label and path each take one truncated line, the
            // full path is the tooltip and remains in the accessible text.
            title={distinctDescription(item) ? item.description : undefined}
          >
            <span className="flex w-full min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{item.label}</span>
                {/*
                 * Start truncation: the ellipsis eats the leading folders and the file-name end
                 * stays visible; the inner span isolates the path back to left-to-right. A row
                 * whose path is just its label (or that has none) keeps the line, hidden from
                 * assistive technology, so every row has the same height.
                 */}
                <span
                  dir="rtl"
                  aria-hidden={distinctDescription(item) ? undefined : 'true'}
                  className="block truncate text-left text-content-muted"
                >
                  <span dir="ltr">{item.description ?? '\u00a0'}</span>
                </span>
              </span>
              {item.dirty ? (
                <>
                  <DirtyDot />
                  <span className="sr-only">({labels.status.dirty})</span>
                </>
              ) : null}
              {item.id === activeId ? (
                <span className="sr-only">({labels.status.current})</span>
              ) : null}
              {/*
               * A button inside a menuitem is nested-interactive, so this x is a pointer-only,
               * aria-hidden affordance; the keyboard path is Delete on the highlighted row.
               * 44px on coarse pointers.
               */}
              <span
                aria-hidden="true"
                title={labels.menuClose}
                className="grid size-6 shrink-0 place-items-center rounded-control-inline text-content-muted hover:bg-surface-selected pointer-coarse:size-11"
                onClick={(event) => {
                  event.stopPropagation();
                  event.preventDefault();
                  onClose(item.id);
                }}
              >
                <Icon name="close" size="sm" />
              </span>
            </span>
          </MenuItem>
          {/*
           * Accessible close for screen-reader users without a keyboard (the x above is a pointer
           * affordance). Hidden until highlighted, so sighted users still see one row per item;
           * assistive technology reaches it as a normal menu item right after its row. The item
           * recipe's min-height, padding and relative position outrank a plain sr-only and left a
           * 29 px gap under every row, so the hidden state overrides them under the same variant.
           */}
          <MenuItem
            leadingIcon="close"
            className="not-data-[highlighted]:sr-only not-data-[highlighted]:absolute not-data-[highlighted]:min-h-0 not-data-[highlighted]:p-0"
            onSelect={() => onClose(item.id)}
          >
            {labels.close(item.label)}
          </MenuItem>
        </Fragment>
      ))}
      <MenuSeparator />
      <MenuNote id={hintId} className="pointer-coarse:hidden">
        {labels.menuHint}
      </MenuNote>
    </>
  );
}

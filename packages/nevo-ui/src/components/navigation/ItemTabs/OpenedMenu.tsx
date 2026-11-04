import { Fragment } from 'react';
import { cn } from '../../../lib';
import { Icon } from '../../foundations/Icon';
import { MenuItem, MenuLabel } from '../../overlays/Menu';
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
  heading: string;
  activeId: string | null;
  labels: ItemTabsLabels;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}

export function OpenedMenuBody({
  items,
  heading,
  activeId,
  labels,
  onActivate,
  onClose,
}: OpenedMenuProps) {
  // Rows are two lines only when some item has a description (a path); a list without any keeps
  // one-line rows instead of a blank second line under every label.
  const twoLine = items.some((item) => item.description !== undefined);

  return (
    <>
      <MenuLabel>{heading}</MenuLabel>
      {items.map((item) => (
        <Fragment key={item.id}>
          <MenuItem
            onSelect={() => onActivate(item.id)}
            onKeyDown={(event) => {
              if (event.key === 'Delete' && item.closable !== false) {
                onClose(item.id);
              }
            }}
            aria-current={item.id === activeId ? 'true' : undefined}
            data-item-id={item.id}
            leadingIcon={item.state === 'missing' ? 'triangle-alert' : item.icon}
            className={item.state === 'missing' ? 'text-content-muted' : undefined}
            // The rows stay one compact height: label and path each take one truncated line, the
            // full path is the tooltip and remains in the accessible text.
            title={distinctDescription(item) ? item.description : undefined}
          >
            <span className="flex w-full min-w-0 items-center gap-2">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{item.label}</span>
                {distinctDescription(item) ? (
                  // Start truncation: the ellipsis eats the leading folders and the file-name end
                  // stays visible; the inner span isolates the path back to left-to-right.
                  <span dir="rtl" className="block truncate text-left text-content-muted">
                    <span dir="ltr">{item.description}</span>
                  </span>
                ) : item.description !== undefined ? (
                  // The path is just the name (an item at the root): say where it is instead.
                  <span className="block truncate text-content-muted">{labels.rootLocation}</span>
                ) : twoLine ? (
                  // No description: the line is kept (hidden) so every row has the same height.
                  <span aria-hidden="true" className="block">
                    {'\u00a0'}
                  </span>
                ) : null}
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
               * 44px on coarse pointers. A non-closable item has no close path: it shows its pin in
               * the same slot (as on the rail), so every row's label column ends at one edge.
               */}
              {item.closable === false ? (
                <span
                  aria-hidden="true"
                  className="grid size-6 shrink-0 place-items-center text-content-muted pointer-coarse:size-11"
                >
                  <Icon name="pin" size="sm" />
                </span>
              ) : (
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
              )}
            </span>
          </MenuItem>
          {/*
           * Accessible close for screen-reader users without a keyboard (the x above is a pointer
           * affordance). Hidden until highlighted, so sighted users still see one row per item;
           * assistive technology reaches it as a normal menu item right after its row. The item
           * recipe's min-height, padding and relative position outrank a plain sr-only and left a
           * 29 px gap under every row, so the hidden state overrides them under the same variant.
           * Omitted entirely for a non-closable item: there is no close row to offer.
           */}
          {item.closable !== false ? (
            <MenuItem
              leadingIcon="close"
              className="not-data-[highlighted]:sr-only not-data-[highlighted]:absolute not-data-[highlighted]:min-h-0 not-data-[highlighted]:p-0"
              onSelect={() => onClose(item.id)}
            >
              {labels.close(item.label)}
            </MenuItem>
          ) : null}
        </Fragment>
      ))}
    </>
  );
}

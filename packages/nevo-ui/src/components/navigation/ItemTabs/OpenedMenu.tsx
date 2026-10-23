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

export interface OpenedMenuProps {
  items: readonly ItemTab[];
  activeId: string | null;
  labels: ItemTabsLabels;
  hintId: string;
  onActivate: (id: string) => void;
  /** `fromMenu` is true so the host can restore focus after the menu closes. */
  onClose: (id: string, fromMenu?: boolean) => void;
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
          >
            <span className="flex w-full min-w-0 items-center gap-2 whitespace-normal">
              <span className="min-w-0 flex-1">
                <span className="block break-all">{item.label}</span>
                {item.description && item.description !== item.label ? (
                  <span className="block break-all text-content-muted">{item.description}</span>
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
           * assistive technology reaches it as a normal menu item right after its row.
           */}
          <MenuItem
            leadingIcon="close"
            className="sr-only data-[highlighted]:not-sr-only"
            onSelect={() => onClose(item.id, true)}
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

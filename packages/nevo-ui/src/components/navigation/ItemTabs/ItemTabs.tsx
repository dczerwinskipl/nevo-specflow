import {
  forwardRef,
  useCallback,
  useLayoutEffect,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type Ref,
} from 'react';
import { cn } from '../../../lib';
import {
  fastColorTransitionClassName,
  hitAreaClassName,
} from '../../../design-system/interactionRecipes';
import { resolveRovingIndex } from '../../behaviors/rovingSelection';
import { Button } from '../../actions/Button';
import { Spinner } from '../../feedback/Spinner';
import { Icon } from '../../foundations/Icon';
import { Menu, MenuContent, MenuTrigger } from '../../overlays/Menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../overlays/Tooltip';
import { DirtyDot, OpenedMenuBody, type OpenedMenuProps } from './OpenedMenu';
import { useCloseFocus } from './useCloseFocus';
import { resolveLabels, statusText, type ItemTab, type ItemTabsLabels } from './itemTabsTypes';
import {
  ITEM_TABS_SWITCHER_BELOW,
  ITEM_TAB_MIN_WIDTH,
  fitItemTabs,
  maxLabelChars,
  splitMiddle,
} from './itemTabsLayout';

export type { ItemTab, ItemTabsLabels } from './itemTabsTypes';
export { defaultItemTabsLabels } from './itemTabsTypes';

export interface ItemTabsProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'children' | 'onChange' | 'role'
> {
  items: readonly ItemTab[];
  /** The active item id, or `null` when nothing is active. Controlled. */
  activeId: string | null;
  onActivate: (id: string) => void;
  /** Called for every close trigger (x, Delete, middle-click, menu). Guards belong to the host. */
  onClose: (id: string) => void;
  /**
   * Prefix tying tabs to the host-rendered panels: a tab `id` is `getItemTabId(scope, id)` and the
   * active tab controls `getItemTabPanelId(scope, id)`.
   */
  scope: string;
  /**
   * `manual` (default): arrows move focus, Enter/Space activates. `automatic`: focus activates.
   */
  activation?: 'manual' | 'automatic';
  /**
   * `auto` (default) swaps the strip for the switcher button when the container is narrower than
   * `switcherBelow`; `strip` and `switcher` force one presentation.
   */
  variant?: 'auto' | 'strip' | 'switcher';
  /** Container width in px under which `auto` renders the switcher. Default 480. */
  switcherBelow?: number;
  /** Replaceable copy. Defaults are English. */
  labels?: Partial<Omit<ItemTabsLabels, 'status'>> & { status?: Partial<ItemTabsLabels['status']> };
}

export const getItemTabId = (scope: string, id: string) => `${scope}-tab-${encodeURIComponent(id)}`;
export const getItemTabPanelId = (scope: string, id: string) =>
  `${scope}-panel-${encodeURIComponent(id)}`;

/** Keeps the tail (extension) visible. One accessible name: the visual halves are hidden. */
function MiddleTruncate({ text, maxChars }: { text: string; maxChars?: number }) {
  const { head, tail } = splitMiddle(text, maxChars);
  return (
    <span className="flex min-w-0 items-baseline">
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="min-w-0 truncate">
        {head}
      </span>
      {tail ? (
        <span aria-hidden="true" className="shrink-0 whitespace-pre">
          {tail}
        </span>
      ) : null}
    </span>
  );
}

function ItemGlyph({ item, badge = true }: { item: ItemTab; badge?: boolean }) {
  const glyph =
    item.state === 'loading' ? (
      <Spinner size="sm" />
    ) : item.state === 'missing' ? (
      <Icon name="triangle-alert" size="sm" className="text-content-muted" />
    ) : item.icon ? (
      <Icon name={item.icon} size="sm" />
    ) : null;
  const showBadge = badge && item.dirty;
  if (!glyph && !showBadge) return null;
  return (
    <span className="relative inline-flex shrink-0">
      {glyph}
      {showBadge ? <DirtyDot className={glyph ? 'absolute -left-1 -top-1' : undefined} /> : null}
    </span>
  );
}

interface TabProps {
  item: ItemTab;
  active: boolean;
  tabbable: boolean;
  width: number;
  scope: string;
  labels: ItemTabsLabels;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onHover: (id: string | null) => void;
  onFocusChange: (id: string | null) => void;
}

function Tab({
  item,
  active,
  tabbable,
  width,
  scope,
  labels,
  onActivate,
  onClose,
  onHover,
  onFocusChange,
}: TabProps) {
  const status = statusText(item, labels);
  const muted = item.state === 'missing' || item.state === 'loading';
  return (
    <div
      role="presentation"
      className="relative flex h-full shrink-0 items-stretch"
      // Inline: the width is computed per tab by fitItemTabs, not a design token.
      style={{ width }}
      onPointerEnter={() => onHover(item.id)}
      onPointerLeave={() => onHover(null)}
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            role="tab"
            id={getItemTabId(scope, item.id)}
            aria-selected={active}
            aria-controls={active ? getItemTabPanelId(scope, item.id) : undefined}
            tabIndex={tabbable ? 0 : -1}
            data-item-id={item.id}
            data-state={active ? 'active' : 'inactive'}
            onClick={() => onActivate(item.id)}
            onMouseDown={(event) => {
              // Keeps middle-click from starting browser autoscroll.
              if (event.button === 1) event.preventDefault();
            }}
            onAuxClick={(event) => {
              if (event.button === 1) {
                event.preventDefault();
                onClose(item.id);
              }
            }}
            onFocus={() => onFocusChange(item.id)}
            onBlur={() => onFocusChange(null)}
            className={cn(
              'flex min-w-0 flex-1 cursor-pointer items-center gap-2 border-b-2 border-solid border-transparent pl-2.5 pr-8 text-label-sm',
              'hover:bg-surface-hover hover:text-content-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring',
              fastColorTransitionClassName,
              active
                ? 'border-b-action-primary text-content-primary'
                : muted
                  ? 'text-content-muted'
                  : 'text-content-secondary',
            )}
          >
            <ItemGlyph item={item} />
            <MiddleTruncate text={item.label} maxChars={maxLabelChars(width)} />
            {status ? <span className="sr-only">({status})</span> : null}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <span className="block">{item.description ?? item.label}</span>
          <span className="block text-content-muted">{labels.closeHint}</span>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

/**
 * Close button of one tab, pinned to the right edge of that tab. It lives in a layer beside the
 * tablist, never inside it (a tablist may only own tabs), and stays out of the tab order: the
 * keyboard path is Delete on the focused tab.
 */
function CloseSlot({
  item,
  width,
  shown,
  labels,
  onClose,
  onHover,
}: {
  item: ItemTab;
  width: number;
  shown: boolean;
  labels: ItemTabsLabels;
  onClose: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  return (
    <div className="pointer-events-none relative h-full shrink-0" style={{ width }}>
      <span className="absolute right-1 top-1/2 size-6 -translate-y-1/2">
        <button
          type="button"
          aria-label={labels.close(item.label)}
          tabIndex={-1}
          onClick={() => onClose(item.id)}
          onPointerEnter={() => onHover(item.id)}
          onPointerLeave={() => onHover(null)}
          className={cn(
            hitAreaClassName,
            'pointer-events-auto grid size-6 cursor-pointer place-items-center rounded-control-inline text-content-muted hover:bg-surface-selected hover:text-content-primary focus-visible:outline-2 focus-visible:outline-focus-ring',
            shown ? 'opacity-100' : 'opacity-0 pointer-coarse:opacity-100',
          )}
        >
          <Icon name="close" size="sm" />
        </button>
      </span>
    </div>
  );
}

/*
 * Measures the root width. Kept local: the other ResizeObserver users in this package (AppShell,
 * AppWorkspace, WorkspaceHeader, ScrollArea, Progress) each derive their own value from the
 * observer, and none exposes a reusable width hook.
 */
function useElementWidth() {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState<number>();
  useLayoutEffect(() => {
    if (!element) return undefined;
    const update = () => setWidth(element.getBoundingClientRect().width);
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element]);
  return { width, element, setElement };
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') ref(value);
  else if (ref) ref.current = value;
}

/**
 * Tab strip for a set of opened items, hosted in a workspace header. Controlled and content-blind:
 * the host owns the items and the active id, and renders the tab panel (see `getItemTabPanelId`).
 * Visible tabs are 140-180 px wide; the rest go to an `Opened (N)` menu. Below `switcherBelow`
 * the strip becomes a single switcher button opening the same menu. `className` styles the root; by default the root is as tall as the 56 px workspace header slot minus its 1 px divider (`h-[calc(3.5rem-1px)]`), so it needs no host sizing inside `WorkspaceHeader.identityContent`.
 */
export const ItemTabs = forwardRef<HTMLDivElement, ItemTabsProps>(function ItemTabs(
  {
    items,
    activeId,
    onActivate,
    onClose: onCloseItem,
    scope,
    activation = 'manual',
    variant = 'auto',
    switcherBelow = ITEM_TABS_SWITCHER_BELOW,
    labels: labelOverrides,
    className,
    ...props
  },
  forwardedRef,
) {
  const labels = resolveLabels(labelOverrides);
  const { width, element: root, setElement } = useElementWidth();
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      setElement(node);
      assignRef(forwardedRef, node);
    },
    [forwardedRef, setElement],
  );
  const [hoveredId, setHovered] = useState<string | null>(null);
  const [focusedId, setFocused] = useState<string | null>(null);
  // Removed tabs never fire blur / pointerleave, so ids that left `items` are ignored.
  const hovered = items.some((item) => item.id === hoveredId) ? hoveredId : null;
  const focused = items.some((item) => item.id === focusedId) ? focusedId : null;

  const { onClose, onCloseFromMenu, onCloseAutoFocus } = useCloseFocus(items, root, onCloseItem);

  const switcher =
    variant === 'switcher' || (variant === 'auto' && width !== undefined && width < switcherBelow);
  const hintId = `${scope}-opened-hint`;
  const { visible, widths, overflowing } = fitItemTabs(
    items,
    width ?? items.length * ITEM_TAB_MIN_WIDTH,
    activeId,
  );
  const tabStopId =
    focused && visible.some((item) => item.id === focused)
      ? focused
      : visible.some((item) => item.id === activeId)
        ? activeId
        : visible[0]?.id;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.getAttribute('role') !== 'tab') return;
    if (event.key === 'Delete') {
      event.preventDefault();
      const id = target.dataset.itemId;
      if (id) onClose(id);
      return;
    }
    const tabs = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')];
    const next = resolveRovingIndex(event.key, tabs.indexOf(target), tabs.length);
    if (next === null) return;
    event.preventDefault();
    const nextTab = tabs[next];
    nextTab?.focus();
    const id = nextTab?.dataset.itemId;
    if (id && activation === 'automatic') onActivate(id);
  };

  const menu: OpenedMenuProps = {
    items,
    activeId,
    labels,
    hintId,
    onActivate,
    onClose: onCloseFromMenu,
  };

  if (switcher) {
    const current = items.find((item) => item.id === activeId);
    return (
      <div
        {...props}
        ref={setRef}
        className={cn('relative flex h-[calc(3.5rem-1px)] w-full min-w-0 items-center', className)}
      >
        <Menu>
          <MenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              trailingIcon="chevron-down"
              labelOverflow="truncate"
              className="min-w-0 max-w-full"
              aria-label={
                current
                  ? labels.switcher({
                      label: current.label,
                      count: items.length,
                      dirty: Boolean(current.dirty),
                    })
                  : labels.openedMenu(items.length)
              }
            >
              <span className="flex min-w-0 items-center gap-2">
                {current ? <ItemGlyph item={current} badge={false} /> : null}
                <MiddleTruncate text={current?.label ?? labels.noItem} />
                {current?.dirty ? <DirtyDot /> : null}
                <span className="shrink-0 text-content-muted">({items.length})</span>
              </span>
            </Button>
          </MenuTrigger>
          <MenuContent
            align="start"
            onCloseAutoFocus={onCloseAutoFocus}
            // Arbitrary: 20rem, but never wider than the viewport minus the collision padding.
            className="w-[min(20rem,calc(100vw-1rem))]"
            aria-describedby={hintId}
          >
            <OpenedMenuBody {...menu} />
          </MenuContent>
        </Menu>
      </div>
    );
  }

  return (
    <div
      {...props}
      ref={setRef}
      className={cn('relative flex h-[calc(3.5rem-1px)] w-full min-w-0 items-stretch', className)}
    >
      <TooltipProvider delayDuration={400}>
        <div
          role="tablist"
          aria-label={labels.tablist}
          aria-orientation="horizontal"
          className="flex h-full min-w-0 items-stretch"
          onKeyDown={onKeyDown}
        >
          {visible.map((item, index) => (
            <Tab
              key={item.id}
              item={item}
              active={item.id === activeId}
              tabbable={item.id === tabStopId}
              width={widths[index]!}
              scope={scope}
              labels={labels}
              onActivate={onActivate}
              onClose={onClose}
              onHover={setHovered}
              onFocusChange={setFocused}
            />
          ))}
        </div>
        <div className="pointer-events-none absolute left-0 top-0 flex h-full">
          {visible.map((item, index) => (
            <CloseSlot
              key={item.id}
              item={item}
              width={widths[index]!}
              shown={hovered === item.id || focused === item.id || item.id === activeId}
              labels={labels}
              onClose={onClose}
              onHover={setHovered}
            />
          ))}
        </div>
      </TooltipProvider>
      {overflowing ? (
        <div className="flex shrink-0 items-center pl-1">
          <Menu>
            <MenuTrigger asChild>
              <button
                type="button"
                aria-label={labels.openedMenu(items.length)}
                className="inline-flex h-control-height-compact cursor-pointer items-center gap-0.5 rounded-control px-1.5 text-label-sm text-content-muted hover:bg-surface-hover hover:text-content-primary focus-visible:outline-2 focus-visible:outline-focus-ring"
              >
                <Icon name="chevron-down" size="sm" />
                <span>{items.length}</span>
              </button>
            </MenuTrigger>
            <MenuContent
              align="end"
              className="w-80"
              aria-describedby={hintId}
              onCloseAutoFocus={onCloseAutoFocus}
            >
              <OpenedMenuBody {...menu} />
            </MenuContent>
          </Menu>
        </div>
      ) : null}
    </div>
  );
});

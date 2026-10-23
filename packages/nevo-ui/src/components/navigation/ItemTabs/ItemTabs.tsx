import {
  forwardRef,
  useCallback,
  useRef,
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
import { Icon, type IconGlyph } from '../../foundations/Icon';
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuLabel,
  MenuNote,
  MenuSeparator,
  MenuTrigger,
} from '../../overlays/Menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../overlays/Tooltip';
import {
  ITEM_TABS_SWITCHER_BELOW,
  ITEM_TAB_MIN_WIDTH,
  fitItemTabs,
  maxLabelChars,
  splitMiddle,
} from './itemTabsLayout';

export interface ItemTab {
  /** Stable identity, unique within the strip. */
  id: string;
  /** Visible name. Middle-truncated when the tab is narrower than the name. */
  label: string;
  /** Full description (for example a path): tooltip and Opened menu rows. */
  description?: string;
  /** Leading glyph. Replaced by a spinner while loading and by a warning when missing. */
  icon?: IconGlyph;
  /** Shows the attention badge on the icon (left, always visible). */
  dirty?: boolean;
  state?: 'ready' | 'loading' | 'missing';
}

export interface ItemTabsLabels {
  /** Accessible name of the tablist. */
  tablist: string;
  /** Accessible name of the overflow trigger. */
  openedMenu: (count: number) => string;
  /** Heading of the Opened menu. */
  openedHeading: string;
  /** Accessible name of one tab's close button. */
  close: (label: string) => string;
  /** Last line of every tab tooltip. */
  closeHint: string;
  /** Note at the bottom of the Opened menu. */
  menuHint: string;
  /** Pointer-only close affordance title inside Opened menu rows. */
  menuClose: string;
  /** Visually hidden suffixes announced after the item name. */
  status: { loading: string; missing: string; dirty: string; current: string };
  /** Accessible name of the switcher button. */
  switcher: (info: { label: string; count: number; dirty: boolean }) => string;
  /** Switcher text when no item is active. */
  noItem: string;
}

export const defaultItemTabsLabels: ItemTabsLabels = {
  tablist: 'Opened items',
  openedMenu: (count) => `Opened items (${count})`,
  openedHeading: 'Opened items',
  close: (label) => `Close ${label}`,
  closeHint: 'Close: Delete or middle-click',
  menuHint: 'Delete closes the highlighted item.',
  menuClose: 'Close',
  status: {
    loading: 'loading',
    missing: 'not found',
    dirty: 'unsaved changes',
    current: 'current',
  },
  switcher: ({ label, count, dirty }) =>
    `${label}${dirty ? ', unsaved changes' : ''}, ${count} opened`,
  noItem: 'No item',
};

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

function resolveLabels(overrides: ItemTabsProps['labels']): ItemTabsLabels {
  return {
    ...defaultItemTabsLabels,
    ...overrides,
    status: { ...defaultItemTabsLabels.status, ...overrides?.status },
  };
}

function statusText(item: ItemTab, labels: ItemTabsLabels) {
  if (item.state === 'loading') return labels.status.loading;
  if (item.state === 'missing') return labels.status.missing;
  return item.dirty ? labels.status.dirty : '';
}

function DirtyDot({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('size-2 shrink-0 rounded-full bg-status-attention', className)}
    />
  );
}

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

interface OpenedMenuProps {
  items: readonly ItemTab[];
  activeId: string | null;
  labels: ItemTabsLabels;
  hintId: string;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
}

function OpenedMenuBody({ items, activeId, labels, hintId, onActivate, onClose }: OpenedMenuProps) {
  return (
    <>
      <MenuLabel>{labels.openedHeading}</MenuLabel>
      {items.map((item) => (
        <MenuItem
          key={item.id}
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
      ))}
      <MenuSeparator />
      <MenuNote id={hintId} className="pointer-coarse:hidden">
        {labels.menuHint}
      </MenuNote>
    </>
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

  // After a close, focus moves to the right neighbour (else the left one) once the host has
  // actually removed the item. A cancelled close (guard answered "no") leaves focus alone. When
  // the last item closes there is nothing to focus: the host decides where focus goes next.
  const afterClose = useRef<{ id: string; neighbourId: string | null } | null>(null);
  const onClose = (id: string) => {
    const index = items.findIndex((item) => item.id === id);
    afterClose.current = {
      id,
      neighbourId: (items[index + 1] ?? items[index - 1])?.id ?? null,
    };
    onCloseItem(id);
  };
  useLayoutEffect(() => {
    const pending = afterClose.current;
    if (!pending || !root || items.some((item) => item.id === pending.id)) return;
    afterClose.current = null;
    const owner = document.activeElement;
    if (owner && owner !== document.body && !root.contains(owner)) return;
    const tabs = [...root.querySelectorAll<HTMLElement>('[role="tab"]')];
    const target =
      tabs.find((tab) => tab.dataset.itemId === pending.neighbourId) ??
      tabs.find((tab) => tab.getAttribute('aria-selected') === 'true');
    target?.focus();
  }, [items, root]);

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

  const menu: OpenedMenuProps = { items, activeId, labels, hintId, onActivate, onClose };

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
            <MenuContent align="end" className="w-80" aria-describedby={hintId}>
              <OpenedMenuBody {...menu} />
            </MenuContent>
          </Menu>
        </div>
      ) : null}
    </div>
  );
});

import {
  forwardRef,
  useCallback,
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
import { useElementWidth } from '../../behaviors/useElementWidth';
import { Button } from '../../actions/Button';
import { Spinner } from '../../feedback/Spinner';
import { Icon } from '../../foundations/Icon';
import { typographyVariantClasses } from '../../foundations/Typography/Typography';
import { Menu, MenuContent, MenuTrigger } from '../../overlays/Menu';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../overlays/Tooltip';
import { DirtyDot, OpenedMenuBody, type OpenedMenuProps } from './OpenedMenu';
import { useCloseFocus } from './useCloseFocus';
import { resolveLabels, statusText, type ItemTab, type ItemTabsLabels } from './itemTabsTypes';
import {
  ITEM_TABS_RAIL_SWITCHER_BELOW,
  ITEM_TABS_SWITCHER_BELOW,
  fitItemTabs,
  itemTabMetrics,
  itemTabNaturalWidth,
  maxLabelChars,
  splitMiddle,
  type ItemTabChrome,
  type ItemTabDensity,
} from './itemTabsLayout';
import { measureAttribute, useLabelWidths } from './useLabelWidths';

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
  /** Container width in px under which `auto` renders the switcher. Default 480, `rail` 292. */
  switcherBelow?: number;
  /**
   * Root height and tab look. `header` (default): fills a 56px `WorkspaceHeader` slot (minus its 1px
   * divider), one-control-high rounded tabs 2px apart, anchored to its bottom edge, 12px / 600
   * labels, a primary underline on the active tab — the Documents tab header. `rail`: the split
   * Secondary's editor tabs, `--spacing-tab-rail` (36px, divider included) tall: square tabs that
   * touch, 14px labels, 1px neutral separators, inactive tabs on the darker `tab-strip` and the
   * active tab on the panel's own surface (no bottom border, a 2px primary top accent). The root draws
   * the strip's bottom divider itself, so its host row has no border. The width policy is the same.
   */
  density?: ItemTabDensity;
  /** Replaceable copy. Defaults are English. */
  labels?: Partial<Omit<ItemTabsLabels, 'status'>> & { status?: Partial<ItemTabsLabels['status']> };
}

export const getItemTabId = (scope: string, id: string) => `${scope}-tab-${encodeURIComponent(id)}`;
export const getItemTabPanelId = (scope: string, id: string) =>
  `${scope}-panel-${encodeURIComponent(id)}`;

/**
 * Keeps the tail (extension) visible. One accessible name: the visual halves are hidden. Both halves
 * keep their white space (`whitespace-pre`): a space at the split point would otherwise collapse at
 * the end of the head ("Single sign-on- UX").
 */
function MiddleTruncate({ text, maxChars }: { text: string; maxChars?: number }) {
  const { head, tail } = splitMiddle(text, maxChars);

  return (
    <span className="flex min-w-0 items-baseline">
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className="min-w-0 overflow-hidden text-ellipsis whitespace-pre">
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

/** The chrome around a tab's label, shared by its classes and its width (`itemTabChromeWidth`). */
function tabChrome(item: ItemTab, density: ItemTabDensity): ItemTabChrome {
  return {
    // `closable` reserves the trailing slot. On the rail a pinned (non-closable) tab shows its pin
    // there, so it keeps the slot too.
    closable: item.closable !== false || density === 'rail',
    // The dirty dot stands in the glyph slot of an iconless tab (the rail), so it reserves it too.
    glyph:
      Boolean(item.icon) ||
      item.state === 'loading' ||
      item.state === 'missing' ||
      Boolean(item.dirty),
  };
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
  if (!glyph && !showBadge) {
    return null;
  }

  return (
    <span className="relative inline-flex shrink-0">
      {glyph}
      {showBadge ? <DirtyDot className={glyph ? 'absolute -left-1 -top-1' : undefined} /> : null}
    </span>
  );
}

interface TabProps {
  density: ItemTabDensity;
  item: ItemTab;
  active: boolean;
  tabbable: boolean;
  width: number;
  /** The tab's content width; a narrower `width` truncates the label in the middle. */
  naturalWidth: number;
  scope: string;
  labels: ItemTabsLabels;
  onActivate: (id: string) => void;
  onClose: (id: string) => void;
  onHover: (id: string | null) => void;
  onFocusChange: (id: string | null) => void;
}

function Tab({
  density,
  item,
  active,
  tabbable,
  width,
  naturalWidth,
  scope,
  labels,
  onActivate,
  onClose,
  onHover,
  onFocusChange,
}: TabProps) {
  const status = statusText(item, labels);
  const muted = item.state === 'missing' || item.state === 'loading';
  const chrome = tabChrome(item, density);
  const rail = density === 'rail';

  return (
    <div
      role="presentation"
      className="relative flex h-full shrink-0 items-stretch"
      // Inline: the width is the tab's measured content width (fitItemTabs), not a design token.
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
              if (event.button === 1) {
                event.preventDefault();
              }
            }}
            onAuxClick={(event) => {
              if (event.button === 1) {
                event.preventDefault();
                if (item.closable !== false) {
                  onClose(item.id);
                }
              }
            }}
            onFocus={() => onFocusChange(item.id)}
            onBlur={() => onFocusChange(null)}
            className={cn(
              'flex min-w-0 flex-1 cursor-pointer items-center gap-2 whitespace-nowrap border-solid',
              'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring',
              fastColorTransitionClassName,
              rail
                ? cn(
                    // Editor tab. `pl-3`, the glyph gap and `pr-8`/`pr-3` are the rail metrics'
                    // numbers (`itemTabMetrics`). 1px separator on every end edge; the active tab
                    // is the panel's own surface (no fill, no bottom border) under a 2px primary
                    // accent, the inactive ones sit on the darker strip with its bottom divider.
                    // The accent is a pseudo-element over the 1px top border, so activating a tab
                    // never moves its label.
                    typographyVariantClasses['body-md'],
                    'relative border-y border-r border-r-border-subtle pl-3',
                    chrome.closable ? 'pr-8' : 'pr-3',
                    active
                      ? "border-t-border-subtle border-b-transparent text-content-primary before:pointer-events-none before:absolute before:inset-x-0 before:-top-px before:h-0.5 before:bg-action-primary before:content-['']"
                      : cn(
                          'border-t-transparent border-b-border-subtle bg-tab-strip hover:bg-surface-hover hover:text-content-primary',
                          muted ? 'text-content-muted' : 'text-content-secondary',
                        ),
                  )
                : cn(
                    // `pl-2.5`, the glyph gap and `pr-8`/`pr-2.5` are `itemTabChromeWidth`'s numbers.
                    'border-b-2 border-transparent pl-2.5 text-label-sm hover:bg-surface-hover hover:text-content-primary',
                    chrome.closable ? 'pr-8' : 'pr-2.5',
                    // The active tab is the primary underline plus primary text, nothing else: no
                    // fill, no rounded card. A fill (on every tab, or only on the active one) read
                    // as a row of separate buttons and competed with the underline. Inactive tabs
                    // are plain secondary text until hovered.
                    active
                      ? 'border-b-action-primary text-content-primary'
                      : muted
                        ? 'text-content-muted'
                        : 'text-content-secondary',
                  ),
            )}
          >
            <ItemGlyph item={item} />
            <MiddleTruncate
              text={item.label}
              maxChars={maxLabelChars(
                item.label,
                width,
                naturalWidth,
                chrome,
                itemTabMetrics(density),
              )}
            />
            {status ? <span className="sr-only">({status})</span> : null}
          </button>
        </TooltipTrigger>
        <TooltipContent>
          <span className="block">{item.description ?? item.label}</span>
          {item.closable !== false ? (
            <span className="block text-content-muted">{labels.closeHint}</span>
          ) : null}
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

/**
 * Close button of one tab, pinned to the right edge of that tab. It lives in a layer beside the
 * tablist, never inside it (a tablist may only own tabs), and stays out of the tab order: the
 * keyboard path is Delete on the focused tab. On the rail, like an editor's tabs, the `x` of
 * every closable tab is always visible and a pinned tab shows a pin in the same slot.
 */
function CloseSlot({
  density,
  item,
  width,
  shown,
  labels,
  onClose,
  onHover,
}: {
  density: ItemTabDensity;
  item: ItemTab;
  width: number;
  shown: boolean;
  labels: ItemTabsLabels;
  onClose: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const rail = density === 'rail';

  return (
    <div className="pointer-events-none relative h-full shrink-0" style={{ width }}>
      {item.closable === false && rail ? (
        <span
          aria-hidden="true"
          className="absolute right-1 top-1/2 grid size-6 -translate-y-1/2 place-items-center text-content-muted"
          data-item-pinned="true"
        >
          <Icon name="pin" size="sm" />
        </span>
      ) : null}
      {item.closable !== false ? (
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
              shown || rail ? 'opacity-100' : 'opacity-0 pointer-coarse:opacity-100',
            )}
          >
            <Icon name="close" size="sm" />
          </button>
        </span>
      ) : null}
    </div>
  );
}

function assignRef<T>(ref: Ref<T> | undefined, value: T | null) {
  if (typeof ref === 'function') {
    ref(value);
  } else if (ref) {
    ref.current = value;
  }
}

/**
 * Tab strip for a set of opened items, hosted in a workspace header. Controlled and content-blind:
 * the host owns the items and the active id, and renders the tab panel (see `getItemTabPanelId`).
 * Each tab is as wide as its content (64-240 px, the label measured in the rendered font); long tabs
 * shrink to 120 px before the trailing ones go to a `More (N)` menu that lists only those hidden
 * tabs. Below `switcherBelow` the strip becomes a single switcher button whose menu lists every item. `className` styles the root; the
 * root sizes itself (`density`): the 56 px workspace header minus its 1 px divider, or the full 36 px
 * Secondary tab rail, which draws its own divider. It needs no host sizing inside
 * `WorkspaceHeader.identityContent`.
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
    switcherBelow: switcherBelowProp,
    density = 'header',
    labels: labelOverrides,
    className,
    ...props
  },
  forwardedRef,
) {
  const labels = resolveLabels(labelOverrides);
  const rail = density === 'rail';
  const switcherBelow =
    switcherBelowProp ?? (rail ? ITEM_TABS_RAIL_SWITCHER_BELOW : ITEM_TABS_SWITCHER_BELOW);
  const metrics = itemTabMetrics(density);
  // The rail draws its own bottom divider (on the inactive tabs and the strip), so it is the full
  // `--spacing-tab-rail`; the header root leaves the 1px divider its host row draws.
  const rootHeight = rail ? 'h-tab-rail' : 'h-[calc(3.5rem-1px)]';
  const tabHeight = rail ? 'h-full' : 'h-control-height-default';
  const stripClassName = 'bg-tab-strip border-b border-border-subtle';
  const { width, element: root, setElement } = useElementWidth();
  const labelSignature = items.map((item) => `${item.id}\u0000${item.label}`).join('\u0001');
  const { widths: labelWidths, setLayer: setMeasureLayer } = useLabelWidths(labelSignature);
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
  const naturalWidths = items.map((item) =>
    itemTabNaturalWidth(item.label, tabChrome(item, density), labelWidths[item.id], metrics),
  );
  const naturalById = new Map(items.map((item, index) => [item.id, naturalWidths[index]!]));
  const { visible, widths, overflowing } = fitItemTabs(
    items,
    width ?? naturalWidths.reduce((sum, natural) => sum + natural, 0),
    activeId,
    naturalWidths,
    metrics,
  );
  const tabStopId =
    focused && visible.some((item) => item.id === focused)
      ? focused
      : visible.some((item) => item.id === activeId)
        ? activeId
        : visible[0]?.id;

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement) || target.getAttribute('role') !== 'tab') {
      return;
    }

    if (event.key === 'Delete') {
      event.preventDefault();
      const id = target.dataset.itemId;
      const closable = items.find((item) => item.id === id)?.closable !== false;
      if (id && closable) {
        onClose(id);
      }

      return;
    }

    const tabs = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]')];
    const next = resolveRovingIndex(event.key, tabs.indexOf(target), tabs.length);
    if (next === null) {
      return;
    }

    event.preventDefault();
    const nextTab = tabs[next];
    nextTab?.focus();
    const id = nextTab?.dataset.itemId;
    if (id && activation === 'automatic') {
      onActivate(id);
    }
  };

  const menu: OpenedMenuProps = {
    items,
    heading: labels.openedHeading,
    activeId,
    labels,
    hintId,
    onActivate,
    onClose: onCloseFromMenu,
  };
  // The overflow menu holds only what the strip could not show; the switcher (no strip) holds all.
  const hidden = items.filter((item) => !visible.includes(item));

  if (switcher) {
    const current = items.find((item) => item.id === activeId);

    return (
      <div
        {...props}
        ref={setRef}
        className={cn(
          'relative flex w-full min-w-0 items-center',
          rootHeight,
          rail && cn(stripClassName, 'px-1'),
          className,
        )}
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
      className={cn(
        'relative flex w-full min-w-0',
        rail ? 'items-stretch' : 'items-end',
        rootHeight,
        className,
      )}
    >
      {/* Measures every label in the tab font, so a tab is exactly as wide as its own text. Clipped
          to nothing: it never takes space or widens a scroll container. */}
      <div
        aria-hidden="true"
        className="pointer-events-none invisible absolute inset-0 overflow-hidden"
      >
        <div
          ref={setMeasureLayer}
          className={cn(
            'flex w-max whitespace-pre',
            rail ? typographyVariantClasses['body-md'] : 'text-label-sm',
          )}
        >
          {items.map((item) => (
            <span key={item.id} {...measureAttribute(item.id)}>
              {item.label}
            </span>
          ))}
        </div>
      </div>
      <TooltipProvider delayDuration={400}>
        <div
          role="tablist"
          aria-label={labels.tablist}
          aria-orientation="horizontal"
          className={cn('flex min-w-0 items-stretch', !rail && 'gap-0.5', tabHeight)}
          onKeyDown={onKeyDown}
        >
          {visible.map((item, index) => (
            <Tab
              key={item.id}
              density={density}
              item={item}
              active={item.id === activeId}
              tabbable={item.id === tabStopId}
              width={widths[index]!}
              naturalWidth={naturalById.get(item.id)!}
              scope={scope}
              labels={labels}
              onActivate={onActivate}
              onClose={onClose}
              onHover={setHovered}
              onFocusChange={setFocused}
            />
          ))}
        </div>
        <div
          className={cn(
            'pointer-events-none absolute bottom-0 left-0 flex',
            !rail && 'gap-0.5',
            tabHeight,
          )}
        >
          {visible.map((item, index) => (
            <CloseSlot
              key={item.id}
              density={density}
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
      {rail || overflowing ? (
        // Rail: the strip continues past the last tab (its fill and bottom divider) and carries the
        // menu. Header: just the menu trigger after the tabs.
        <div
          className={cn(
            'flex items-center',
            rail
              ? cn('min-w-0 flex-1 justify-end pr-1', stripClassName)
              : cn('shrink-0 pl-1', tabHeight),
          )}
        >
          {overflowing ? (
            <Menu>
              <MenuTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-control-height-compact cursor-pointer items-center gap-0.5 rounded-control px-1.5 text-label-sm text-content-muted hover:bg-surface-hover hover:text-content-primary focus-visible:outline-2 focus-visible:outline-focus-ring"
                >
                  <Icon name="chevron-down" size="sm" />
                  {/* The visible count is a shorthand of the name, which assistive technology reads
                    in full; an `aria-label` would leave the visible "3" outside the name
                    (WCAG 2.5.3, axe label-content-name-mismatch). */}
                  <span aria-hidden="true">{hidden.length}</span>
                  <span className="sr-only">{labels.moreMenu(hidden.length)}</span>
                </button>
              </MenuTrigger>
              <MenuContent
                align="end"
                className="w-80"
                aria-describedby={hintId}
                onCloseAutoFocus={onCloseAutoFocus}
              >
                <OpenedMenuBody {...menu} items={hidden} heading={labels.moreHeading} />
              </MenuContent>
            </Menu>
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

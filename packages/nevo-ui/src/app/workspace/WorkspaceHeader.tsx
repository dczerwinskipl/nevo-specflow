import {
  Fragment,
  isValidElement,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';

import { Button } from '../../components/actions/Button';
import { IconButton } from '../../components/actions/IconButton';
import { Icon, type IconGlyph } from '../../components/foundations/Icon';
import { Typography } from '../../components/foundations/Typography';
import {
  Menu,
  MenuContent,
  MenuGroup,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  MenuTrigger,
  OverflowMenu,
} from '../../components/overlays/Menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '../../components/overlays/Tooltip';
import { cn } from '../../lib';
import { WORKSPACE_HEADER_NARROW_MAX_WIDTH } from './workspaceSizing';

export type WorkspaceHeaderActionTone = 'neutral' | 'danger';

/** How a header action asks to be shown outside the overflow menu. */
export type WorkspaceHeaderActionDirect =
  /** Direct on wide headers only (default for the `primary` action). */
  | 'wide'
  /** Direct on wide and narrow headers (wins the single narrow slot). */
  | 'always'
  /** Always in the overflow menu (default for every non-primary action). */
  | 'never';

/** Section of the complete `...` menu: `display` (options and toggles) above `actions`. */
export type WorkspaceHeaderActionGroup = 'display' | 'actions';

/** What the `...` menu lists: only the overflow (default), or every action of the header. */
export type WorkspaceHeaderMenu = 'default' | 'complete';

interface WorkspaceHeaderActionBase {
  id: string;
  label: string;
  primary?: boolean;
  disabled?: boolean;
  /**
   * The action is running (for example Save while it commits): it is unavailable but keeps focus
   * (`aria-disabled`, presses ignored), so a keyboard user is not dropped to the page. A menu lists
   * it as disabled.
   */
  busy?: boolean;
  tone?: WorkspaceHeaderActionTone;
  /** Defaults: `primary` is direct on wide and narrow headers, every other action is `'never'`. */
  direct?: WorkspaceHeaderActionDirect;
  /** `menu="complete"` only (ignored by the default menu): the section. Defaults to `'actions'`; `'display'` is listed first. */
  group?: WorkspaceHeaderActionGroup;
  /**
   * Menu toggle state (both menu modes): the row becomes a `menuitemcheckbox` with a check in the
   * trailing slot; the leading icon keeps naming the action. Also drives direct icon `aria-pressed`,
   * so the two representations cannot disagree. Wins over an icon action's `pressed`.
   */
  checked?: boolean;
  /**
   * Keyboard shortcut hint in the menu's trailing slot (both menu modes), for example `Ctrl+S`.
   * On a toggle it precedes the check.
   */
  shortcut?: string;
  /**
   * Menu actions only. When set, closing the menu does not return focus to its trigger: this runs
   * instead, once the menu has closed and no longer traps focus. Use it when the action moves focus
   * itself (for example to an inline input it mounts).
   */
  onMenuClosed?: () => void;
  onPress: () => void;
}

/** Text button when direct (a primary with an `icon` collapses to icon-only on narrow headers). */
export interface WorkspaceHeaderButtonAction extends WorkspaceHeaderActionBase {
  icon?: IconGlyph;
  presentation?: 'button';
}

/** `IconButton` + `Tooltip(label)` when direct; `icon` is required. `label` is the accessible name. */
interface WorkspaceHeaderIconActionBase extends WorkspaceHeaderActionBase {
  icon: IconGlyph;
  presentation: 'icon';
}

/**
 * Icon toggle: `pressed` renders `aria-pressed` and a subtle pressed state. The icon names the
 * action, not the state. The filled `primary` look has no pressed state, so a primary cannot be a toggle.
 */
export type WorkspaceHeaderIconAction = WorkspaceHeaderIconActionBase &
  ({ primary?: false; pressed?: boolean } | { primary: true; pressed?: never });

export type WorkspaceHeaderAction = WorkspaceHeaderButtonAction | WorkspaceHeaderIconAction;

/** `compact` is the stacked floating row: every action lives in the overflow menu. */
export type WorkspaceHeaderDensity = 'wide' | 'narrow' | 'compact';

/** Maximum number of direct actions per density. */
export const WORKSPACE_HEADER_DIRECT_BUDGET = { wide: 2, narrow: 1, compact: 0 } as const;

export interface WorkspaceHeaderProps {
  actions?: readonly WorkspaceHeaderAction[];
  as?: 'h1' | 'h2' | 'h3' | 'h4' | 'span';
  className?: string;
  icon?: IconGlyph;
  labels?: Partial<WorkspaceHeaderLabels>;
  /** `'complete'` lists every action in the `...` menu, promoted ones included. Default: overflow only. */
  menu?: WorkspaceHeaderMenu;
  status?: ReactNode;
  subtitle?: ReactNode;
  title: ReactNode;
  /** Structured location content, outside heading semantics. Actions remain discoverable. */
  identityContent?: ReactNode;
  /** Primary defaults to h1; contextual Secondary headers use h2. */
  headingLevel?: 1 | 2;
}

export interface WorkspaceHeaderLabels {
  moreActions: string;
  menuScope?: string;
  /** Section label of the `display` group in the complete menu. Default `Display`. */
  menuDisplay?: string;
  /** Section label of the `actions` group in the complete menu. Default `Actions`. */
  menuActions?: string;
}

const defaultWorkspaceHeaderLabels: WorkspaceHeaderLabels = {
  moreActions: 'More actions',
};

export interface ResolvedWorkspaceHeaderActions {
  /** Actions shown outside the menu, in display order (the filled `primary` last). */
  direct: readonly WorkspaceHeaderAction[];
  /** The first direct `primary` action, kept for callers that only know the single-primary model. */
  directPrimary?: WorkspaceHeaderAction;
  /** Everything else in input order. */
  overflow: readonly WorkspaceHeaderAction[];
}

function directRank(action: WorkspaceHeaderAction, density: 'wide' | 'narrow'): number | null {
  if (action.tone === 'danger' || action.direct === 'never') {
    return null;
  }

  if (action.direct === 'always') {
    return 0;
  }

  if (action.primary) {
    return 1;
  }

  return density === 'wide' && action.direct === 'wide' ? 2 : null;
}

/**
 * Splits header actions into direct actions and overflow. Wide headers show at most two direct
 * actions, narrow ones one; a danger action is never direct. When more actions qualify than the budget
 * allows, `direct: 'always'` wins, then the `primary` action, then `direct: 'wide'` in input order.
 * Direct actions render in input order with the filled `primary` last; the overflow keeps input order.
 * A boolean second argument is the legacy form: `true` = `'compact'`, `false` = `'wide'`.
 */
export function resolveWorkspaceHeaderActions(
  actions: readonly WorkspaceHeaderAction[] = [],
  density: WorkspaceHeaderDensity | boolean = 'wide',
): ResolvedWorkspaceHeaderActions {
  const resolvedDensity: WorkspaceHeaderDensity =
    density === true ? 'compact' : density === false ? 'wide' : density;
  if (resolvedDensity === 'compact') {
    return { direct: [], overflow: actions };
  }

  const chosen = new Set(
    actions
      .map((action, index) => ({ index, rank: directRank(action, resolvedDensity) }))
      .filter((entry): entry is { index: number; rank: number } => entry.rank !== null)
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .slice(0, WORKSPACE_HEADER_DIRECT_BUDGET[resolvedDensity])
      .map((entry) => entry.index),
  );
  const picked = actions.filter((_, index) => chosen.has(index));
  const direct = [
    ...picked.filter((action) => !action.primary),
    ...picked.filter((action) => action.primary),
  ];

  return {
    direct,
    directPrimary: direct.find((action) => action.primary),
    overflow: actions.filter((_, index) => !chosen.has(index)),
  };
}

/** Shared toggle state of an icon button and its menu row: explicit `checked`, then `pressed`. */
function menuCheckedState(
  action: WorkspaceHeaderActionBase & { presentation?: 'button' | 'icon'; pressed?: boolean },
): boolean | undefined {
  return action.checked ?? (action.presentation === 'icon' ? action.pressed : undefined);
}

export interface WorkspaceHeaderMenuGroup {
  group: WorkspaceHeaderActionGroup;
  actions: readonly WorkspaceHeaderAction[];
}

/** Complete-menu sections in display order; an empty section is omitted (no orphan separator). */
export function groupWorkspaceHeaderMenuActions(
  actions: readonly WorkspaceHeaderAction[],
): readonly WorkspaceHeaderMenuGroup[] {
  return [
    { group: 'display' as const, actions: actions.filter((action) => action.group === 'display') },
    { group: 'actions' as const, actions: actions.filter((action) => action.group !== 'display') },
  ].filter((entry) => entry.actions.length > 0);
}

function completeMenuGroupLabels(
  labels: WorkspaceHeaderLabels,
): Record<WorkspaceHeaderActionGroup, string> {
  return { display: labels.menuDisplay ?? 'Display', actions: labels.menuActions ?? 'Actions' };
}

function WorkspaceMenuEntry({
  action,
  onSelect,
}: {
  action: WorkspaceHeaderAction;
  onSelect: () => void;
}) {
  const checked = menuCheckedState(action);
  const toggle = checked !== undefined;
  const mark = toggle ? (
    checked ? (
      <Icon className="text-content-primary" name="check" size="sm" />
    ) : (
      <span aria-hidden="true" className="inline-block size-icon-sm" />
    )
  ) : null;

  return (
    <MenuItem
      disabled={action.disabled === true || action.busy === true}
      leadingIcon={action.icon}
      onSelect={onSelect}
      tone={action.tone ?? 'neutral'}
      {...(toggle ? { role: 'menuitemcheckbox', 'aria-checked': checked } : {})}
      shortcut={
        action.shortcut && mark ? (
          <span className="inline-flex items-center gap-2">
            {action.shortcut}
            {mark}
          </span>
        ) : (
          (mark ?? action.shortcut)
        )
      }
    >
      {action.label}
    </MenuItem>
  );
}

function WorkspaceActionMenu({
  actions,
  className,
  groupLabels,
  label,
  navigationAction,
  scope,
}: {
  actions: readonly WorkspaceHeaderAction[];
  className?: string;
  /** Set for the complete menu: renders `display` and `actions` sections with these labels. */
  groupLabels?: Record<WorkspaceHeaderActionGroup, string>;
  label: string;
  navigationAction?: WorkspaceHeaderAction;
  scope?: string;
}) {
  const closedHandler = useRef<(() => void) | undefined>(undefined);
  const groupLabelId = useId();
  if (actions.length === 0 && !navigationAction) {
    return null;
  }

  const select = (action: WorkspaceHeaderAction) => () => {
    closedHandler.current = action.onMenuClosed;
    action.onPress();
  };

  const onCloseAutoFocus = (event: Event) => {
    const handler = closedHandler.current;
    closedHandler.current = undefined;
    if (!handler) {
      return;
    }

    event.preventDefault();
    handler();
  };

  const groups = groupLabels ? groupWorkspaceHeaderMenuActions(actions) : null;
  const items = (
    <>
      {groups && groupLabels
        ? groups.map((entry, index) => (
            <Fragment key={entry.group}>
              {index > 0 ? <MenuSeparator /> : null}
              <MenuGroup aria-labelledby={`${groupLabelId}-${entry.group}`}>
                <MenuLabel id={`${groupLabelId}-${entry.group}`}>
                  {groupLabels[entry.group]}
                </MenuLabel>
                {entry.actions.map((action) => (
                  <WorkspaceMenuEntry action={action} key={action.id} onSelect={select(action)} />
                ))}
              </MenuGroup>
            </Fragment>
          ))
        : actions.map((action) => (
            <WorkspaceMenuEntry action={action} key={action.id} onSelect={select(action)} />
          ))}
      {navigationAction ? (
        <>
          {actions.length > 0 ? <MenuSeparator /> : null}
          <MenuItem leadingIcon={navigationAction.icon} onSelect={select(navigationAction)}>
            {navigationAction.label}
          </MenuItem>
        </>
      ) : null}
    </>
  );

  if (scope) {
    return (
      <OverflowMenu
        className={className}
        label={scope}
        onCloseAutoFocus={onCloseAutoFocus}
        size="sm"
        triggerLabel={label}
      >
        {items}
      </OverflowMenu>
    );
  }

  return (
    <Menu>
      <MenuTrigger asChild>
        <IconButton
          aria-label={label}
          className={className}
          icon="ellipsis"
          size="sm"
          variant="ghost"
        />
      </MenuTrigger>
      <MenuContent
        align="end"
        sideOffset={4}
        aria-label={label}
        className={
          groupLabels
            ? 'w-60 max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto'
            : 'w-auto'
        }
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {items}
      </MenuContent>
    </Menu>
  );
}

function DirectIconAction({
  action,
}: {
  action: WorkspaceHeaderIconActionBase & { pressed?: boolean };
}) {
  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <IconButton
            aria-label={action.label}
            aria-pressed={action.primary ? undefined : menuCheckedState(action)}
            className={
              action.primary
                ? undefined
                : 'aria-pressed:bg-surface-selected aria-pressed:text-content-primary'
            }
            disabled={action.disabled}
            aria-disabled={action.busy ? true : undefined}
            icon={action.icon}
            onClick={action.busy ? undefined : action.onPress}
            size="sm"
            variant={action.primary ? 'primary' : 'ghost'}
          />
        </TooltipTrigger>
        <TooltipContent>{action.label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function DirectPrimaryAction({
  action,
  narrow,
}: {
  action: WorkspaceHeaderAction;
  narrow: boolean;
}) {
  if (action.presentation === 'icon') {
    return <DirectIconAction action={action} />;
  }

  if (!action.icon) {
    return (
      <Button
        disabled={action.disabled}
        aria-disabled={action.busy ? true : undefined}
        onClick={action.busy ? undefined : action.onPress}
        size="sm"
      >
        {action.label}
      </Button>
    );
  }

  // Narrow headers collapse a direct action that has an icon to an icon-only IconButton (same
  // 32px primary look, with a tooltip) instead of a text Button.
  if (narrow) {
    return <DirectIconAction action={{ ...action, icon: action.icon, presentation: 'icon' }} />;
  }

  return (
    <Button
      aria-label={action.label}
      disabled={action.disabled}
      aria-disabled={action.busy ? true : undefined}
      leadingIcon={action.icon}
      onClick={action.busy ? undefined : action.onPress}
      size="sm"
    >
      {action.label}
    </Button>
  );
}

export interface WorkspaceHeaderIdentityProps extends Pick<
  WorkspaceHeaderProps,
  'as' | 'icon' | 'status' | 'subtitle' | 'title' | 'headingLevel'
> {}

/** Product-owned heading content; the workspace owns its surrounding action chrome. */
export function WorkspaceHeaderIdentity({
  as,
  icon,
  status,
  subtitle,
  title,
  headingLevel = 1,
}: WorkspaceHeaderIdentityProps) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      {icon ? <Icon className="shrink-0 text-action-primary" name={icon} size="md" /> : null}
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-2">
          <Typography
            as={as ?? (headingLevel === 2 ? 'h2' : 'h1')}
            className="min-w-0 truncate outline-none"
            data-workspace-header-title="true"
            tabIndex={-1}
            variant="title-sm"
          >
            {title}
          </Typography>
          {status ? <div className="shrink-0">{status}</div> : null}
        </div>
        {subtitle ? (
          <Typography as="div" className="truncate text-content-muted" variant="body-sm">
            {subtitle}
          </Typography>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Narrow is the MEASURED width of the header frame (not a CSS-only query): which actions are direct
 * decides which are in the menu, and menus portal outside any container query.
 *
 * The `ResizeObserver` callback is coalesced through `requestAnimationFrame` (same pattern as
 * `ScrollArea`'s `scheduleUpdate`): a continuous drag-resize fires one notification per pixel, and
 * without coalescing each one commits its own synchronous state update, so a burst of them can
 * commit faster than the browser can paint between them — visibly lagging behind the real width
 * until the backlog drains. Collapsing a burst to at most one `measure()` per frame, always reading
 * the latest layout at flush time, bounds that lag to a single frame regardless of notification rate.
 */
function useNarrowHeader() {
  const ref = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const update = () =>
      setNarrow(element.getBoundingClientRect().width < WORKSPACE_HEADER_NARROW_MAX_WIDTH);
    update();

    let frame: number | null = null;
    const observer = new ResizeObserver(() => {
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }

      frame = requestAnimationFrame(() => {
        frame = null;
        update();
      });
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
      if (frame !== null) {
        cancelAnimationFrame(frame);
      }
    };
  }, []);

  return { ref, narrow };
}

/** One owner of action placement for desktop headers, including custom Secondary content. */
export function WorkspaceHeaderFrame({
  content,
  actions = [],
  labels: labelsProp,
  menu = 'default',
  className,
}: {
  content: ReactNode;
  actions?: readonly WorkspaceHeaderAction[];
  labels?: Partial<WorkspaceHeaderLabels>;
  menu?: WorkspaceHeaderMenu;
  className?: string;
}) {
  const { ref, narrow } = useNarrowHeader();
  const resolved = resolveWorkspaceHeaderActions(actions, narrow ? 'narrow' : 'wide');
  const labels = { ...defaultWorkspaceHeaderLabels, ...labelsProp };

  return (
    <div
      className={cn('flex w-full min-w-0 items-center justify-between gap-3', className)}
      data-workspace-header="true"
      data-workspace-header-density={narrow ? 'narrow' : 'wide'}
      ref={ref}
    >
      <div className="min-w-0 flex-1">{content}</div>
      {resolved.direct.length > 0 || resolved.overflow.length > 0 ? (
        <div className="flex shrink-0 items-center gap-1.5">
          {resolved.direct.map((action) => (
            <DirectPrimaryAction action={action} key={action.id} narrow={narrow} />
          ))}
          <WorkspaceActionMenu
            actions={menu === 'complete' ? actions : resolved.overflow}
            groupLabels={menu === 'complete' ? completeMenuGroupLabels(labels) : undefined}
            label={labels.moreActions}
            scope={labels.menuScope}
          />
        </div>
      ) : null}
    </div>
  );
}

export function WorkspaceHeader({
  actions = [],
  as,
  className,
  icon,
  labels,
  menu,
  status,
  subtitle,
  title,
  headingLevel = 1,
  identityContent,
}: WorkspaceHeaderProps) {
  return (
    <WorkspaceHeaderFrame
      actions={actions}
      className={className}
      labels={labels}
      menu={menu}
      content={
        identityContent ?? (
          <WorkspaceHeaderIdentity
            as={as}
            headingLevel={headingLevel}
            icon={icon}
            status={status}
            subtitle={subtitle}
            title={title}
          />
        )
      }
    />
  );
}

export function isWorkspaceHeaderElement(
  node: ReactNode,
): node is ReactElement<WorkspaceHeaderProps, typeof WorkspaceHeader> {
  return isValidElement(node) && node.type === WorkspaceHeader;
}

interface WorkspaceHeaderActionProps {
  actions?: readonly WorkspaceHeaderAction[];
  labels?: Partial<WorkspaceHeaderLabels>;
  menu?: WorkspaceHeaderMenu;
}

/**
 * Either header shape a surface's `header: ReactNode` may be: the default `WorkspaceHeader`, or
 * `WorkspaceHeaderFrame` directly (what `HeaderOutlet` renders for a screen definition's own
 * `header` component). Both carry the same `actions`/`labels`/`menu`, so every content-blind
 * extraction below (`getWorkspaceHeaderActions` and friends, already relied on by
 * `CompactWorkspaceActions` and by `AppWorkspace`'s Secondary root-tab strip) must recognize both,
 * not just the default one.
 */
function isWorkspaceHeaderActionElement(
  node: ReactNode,
): node is ReactElement<WorkspaceHeaderActionProps> {
  return (
    isValidElement(node) && (node.type === WorkspaceHeader || node.type === WorkspaceHeaderFrame)
  );
}

export function getWorkspaceHeaderActions(node: ReactNode): readonly WorkspaceHeaderAction[] {
  return isWorkspaceHeaderActionElement(node) ? (node.props.actions ?? []) : [];
}

export function getWorkspaceHeaderMenu(node: ReactNode): WorkspaceHeaderMenu {
  return (isWorkspaceHeaderActionElement(node) ? node.props.menu : undefined) ?? 'default';
}

export function getWorkspaceHeaderLabels(node: ReactNode): WorkspaceHeaderLabels {
  return {
    ...defaultWorkspaceHeaderLabels,
    ...(isWorkspaceHeaderActionElement(node) ? node.props.labels : undefined),
  };
}

export function CompactWorkspaceActions({
  className,
  header,
  actions,
  labels: actionLabels,
  menu,
  navigationAction,
}: {
  className?: string;
  header?: ReactNode;
  actions?: readonly WorkspaceHeaderAction[];
  labels?: Partial<WorkspaceHeaderLabels>;
  /** Defaults to the `menu` of `header`. */
  menu?: WorkspaceHeaderMenu;
  navigationAction?: WorkspaceHeaderAction;
}) {
  const labels = actionLabels
    ? { ...defaultWorkspaceHeaderLabels, ...actionLabels }
    : getWorkspaceHeaderLabels(header);

  return (
    <WorkspaceActionMenu
      actions={
        resolveWorkspaceHeaderActions(actions ?? getWorkspaceHeaderActions(header), true).overflow
      }
      className={className}
      groupLabels={
        (menu ?? getWorkspaceHeaderMenu(header)) === 'complete'
          ? completeMenuGroupLabels(labels)
          : undefined
      }
      label={labels.moreActions}
      navigationAction={navigationAction}
      scope={labels.menuScope}
    />
  );
}

import {
  isValidElement,
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
  MenuItem,
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

interface WorkspaceHeaderActionBase {
  id: string;
  label: string;
  primary?: boolean;
  disabled?: boolean;
  tone?: WorkspaceHeaderActionTone;
  /** Defaults: `primary` is direct on wide and narrow headers, every other action is `'never'`. */
  direct?: WorkspaceHeaderActionDirect;
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
export interface WorkspaceHeaderIconAction extends WorkspaceHeaderActionBase {
  icon: IconGlyph;
  presentation: 'icon';
}

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
  if (action.tone === 'danger' || action.direct === 'never') return null;
  if (action.direct === 'always') return 0;
  if (action.primary) return 1;
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
  if (resolvedDensity === 'compact') return { direct: [], overflow: actions };

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

function WorkspaceActionMenu({
  actions,
  className,
  label,
  navigationAction,
  scope,
}: {
  actions: readonly WorkspaceHeaderAction[];
  className?: string;
  label: string;
  navigationAction?: WorkspaceHeaderAction;
  scope?: string;
}) {
  const closedHandler = useRef<(() => void) | undefined>(undefined);
  if (actions.length === 0 && !navigationAction) return null;

  const select = (action: WorkspaceHeaderAction) => () => {
    closedHandler.current = action.onMenuClosed;
    action.onPress();
  };
  const onCloseAutoFocus = (event: Event) => {
    const handler = closedHandler.current;
    closedHandler.current = undefined;
    if (!handler) return;
    event.preventDefault();
    handler();
  };

  const items = (
    <>
      {actions.map((action) => (
        <MenuItem
          disabled={action.disabled}
          key={action.id}
          leadingIcon={action.icon}
          onSelect={select(action)}
          tone={action.tone ?? 'neutral'}
        >
          {action.label}
        </MenuItem>
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
        className="w-auto"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        {items}
      </MenuContent>
    </Menu>
  );
}

function DirectIconAction({ action }: { action: WorkspaceHeaderIconAction }) {
  return (
    <TooltipProvider delayDuration={400}>
      <Tooltip>
        <TooltipTrigger asChild>
          <IconButton
            aria-label={action.label}
            disabled={action.disabled}
            icon={action.icon}
            onClick={action.onPress}
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
  if (action.presentation === 'icon') return <DirectIconAction action={action} />;
  if (!action.icon) {
    return (
      <Button disabled={action.disabled} onClick={action.onPress} size="sm">
        {action.label}
      </Button>
    );
  }

  // Narrow headers collapse a direct action that has an icon to an icon-only IconButton (same
  // 32px primary look, with a tooltip) instead of a text Button.
  if (narrow)
    return <DirectIconAction action={{ ...action, icon: action.icon, presentation: 'icon' }} />;

  return (
    <Button
      aria-label={action.label}
      disabled={action.disabled}
      leadingIcon={action.icon}
      onClick={action.onPress}
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
 */
function useNarrowHeader() {
  const ref = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const update = () =>
      setNarrow(element.getBoundingClientRect().width < WORKSPACE_HEADER_NARROW_MAX_WIDTH);
    update();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return { ref, narrow };
}

/** One owner of action placement for desktop headers, including custom Secondary content. */
export function WorkspaceHeaderFrame({
  content,
  actions = [],
  labels: labelsProp,
  className,
}: {
  content: ReactNode;
  actions?: readonly WorkspaceHeaderAction[];
  labels?: Partial<WorkspaceHeaderLabels>;
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
            actions={resolved.overflow}
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

export function getWorkspaceHeaderActions(node: ReactNode): readonly WorkspaceHeaderAction[] {
  return isWorkspaceHeaderElement(node) ? (node.props.actions ?? []) : [];
}

export function getWorkspaceHeaderLabels(node: ReactNode): WorkspaceHeaderLabels {
  return {
    ...defaultWorkspaceHeaderLabels,
    ...(isWorkspaceHeaderElement(node) ? node.props.labels : undefined),
  };
}

export function CompactWorkspaceActions({
  className,
  header,
  actions,
  labels: actionLabels,
  navigationAction,
}: {
  className?: string;
  header?: ReactNode;
  actions?: readonly WorkspaceHeaderAction[];
  labels?: Partial<WorkspaceHeaderLabels>;
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
      label={labels.moreActions}
      navigationAction={navigationAction}
      scope={labels.menuScope}
    />
  );
}

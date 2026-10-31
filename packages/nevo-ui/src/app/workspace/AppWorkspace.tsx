import {
  Children,
  createContext,
  Fragment,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type AnimationEvent,
  type ReactElement,
  type ReactNode,
  type Ref,
} from 'react';

import { IconButton } from '../../components/actions/IconButton';
import { ScrollArea } from '../../components/layout/ScrollArea';
import { DrawerTrigger } from '../../components/overlays/Drawer';
import {
  ItemTabs,
  getItemTabId,
  getItemTabPanelId,
  type ItemTab,
} from '../../components/navigation/ItemTabs';
import { workspaceSurfaceClassName } from '../../design-system/brandEnvironment';
import { cn } from '../../lib';
import { useAppWorkspace } from '../shell/AppShell';
import { AppContentScrollProvider } from './AppContent';
import { useOptionalWorkspace } from './WorkspaceContext';
import type { SecondaryTabsState, WorkspaceTransition } from './WorkspaceContext';
import {
  capPrimaryWidth,
  resolveDynamicSplitRatioBounds,
  resolveDynamicWorkspaceSplit,
  resolveSlotMaxWidth,
  resolveWorkspaceFit,
  resolveWorkspaceSplit,
  supportsRuntimeWorkspaceSplit,
  WORKSPACE_DYNAMIC_PRIMARY_MIN_WIDTH,
  WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH,
  type AppWorkspaceFit,
  type AppWorkspaceSplitMode,
  type DynamicSplitRatioBounds,
} from './workspaceSizing';
import { WorkspaceSplitter } from './WorkspaceSplitter';
import type { AppWorkspaceSurface } from './workspaceSurface';
import {
  useMobileWorkspaceTransition,
  workspaceSurfaceRuntimeAttributes,
  type MobileWorkspaceSurfaceRuntime,
} from './useMobileWorkspaceTransition';
import {
  CompactWorkspaceActions,
  WorkspaceHeader,
  getWorkspaceHeaderActions,
  getWorkspaceHeaderLabels,
  getWorkspaceHeaderMenu,
  type WorkspaceHeaderAction,
  type WorkspaceHeaderActionDirect,
  type WorkspaceHeaderActionGroup,
  type WorkspaceHeaderMenu,
  type WorkspaceHeaderActionTone,
  type WorkspaceHeaderDensity,
  type WorkspaceHeaderProps,
} from './WorkspaceHeader';

/**
 * Identifies the Secondary root-tab strip's own `ItemTabs` instance (`getItemTabId`/
 * `getItemTabPanelId` namespace). `AppWorkspace` renders at most one Secondary region, so a fixed
 * scope is sufficient; it never collides with a product's own `ItemTabs` usage elsewhere.
 */
const SECONDARY_TABS_SCOPE = 'workspace-secondary-tabs';

/**
 * Composes the Secondary root-tab strip (contract workspace-dynamic-split.md §4.1, reusing
 * item-tabs.md's Content tabs host pattern verbatim) into an already-resolved surface's header,
 * replacing only its identity content. The header's own actions/menu/labels are preserved exactly
 * by reading them back off the original header — the same content-blind extraction `WorkspaceHeader`
 * already exposes for `CompactWorkspaceActions` — so nothing about what a tab's content means is
 * ever inspected here.
 */
function withSecondaryTabStrip(
  surface: AppWorkspaceSurface,
  tabs: SecondaryTabsState,
  activateTab: (id: string) => Promise<boolean>,
  closeTab: (id: string) => Promise<boolean>,
): AppWorkspaceSurface {
  const items: readonly ItemTab[] = tabs.tabs.map((tab) => ({
    id: tab.id,
    label: tab.title,
    closable: tab.closable,
  }));

  return {
    ...surface,
    header: (
      <WorkspaceHeader
        title=""
        actions={getWorkspaceHeaderActions(surface.header)}
        labels={getWorkspaceHeaderLabels(surface.header)}
        menu={getWorkspaceHeaderMenu(surface.header)}
        identityContent={
          <ItemTabs
            activeId={tabs.activeTabId}
            items={items}
            onActivate={(id) => void activateTab(id)}
            onClose={(id) => void closeTab(id)}
            scope={SECONDARY_TABS_SCOPE}
          />
        }
      />
    ),
  };
}

export { WorkspaceHeaderIdentity } from './WorkspaceHeader';

/**
 * The DOM element currently owning Primary's page-level scroll under `scroll="workspace"`'s
 * stacked (mobile) rendering — the `ScrollArea` viewport `MobileRuntimeSurfaceRegion` already
 * owns for the collapsing-header/floating-navigation pattern. `null` whenever there is no such
 * ambient scroll owner: a split/desktop layout (where `RuntimeSurfaceRegion`'s plain-div branch
 * renders no scroll affordance of its own — a consumer owns scrolling itself there, exactly as it
 * always has) or `scroll="content"` (the consumer owns scrolling on every layout). A consumer
 * that needs imperative access to the ambient scroll element (auto-scroll-to-bottom, near-top
 * infinite-load, away-from-bottom detection) for Primary content reads this via
 * `useWorkspacePrimaryScroll()` instead of trying to own a scroll ref of its own on mobile.
 */
const WorkspacePrimaryScrollContext = createContext<HTMLElement | null>(null);

/**
 * Primary's current ambient page scroll element (see `WorkspacePrimaryScrollContext`), or `null`
 * when Primary has no workspace-owned scroll viewport — a split/desktop layout, or a workspace
 * rendered with `scroll="content"`. Updates whenever the layout switches between stacked and
 * split (the element unmounts/remounts with `MobileRuntimeSurfaceRegion` itself).
 */
export function useWorkspacePrimaryScroll(): HTMLElement | null {
  return useContext(WorkspacePrimaryScrollContext);
}

export interface AppWorkspaceLabels {
  backToPrimary: string;
  closeSecondary: string;
  openNavigation: string;
  /** `WorkspaceSplitter`'s accessible name (workspace-dynamic-split.md §7). */
  resizeSecondary: string;
}

export interface AppWorkspaceRegionProps {
  header?: ReactNode;
  children: ReactNode;
}

export interface AppWorkspaceSecondaryRegionProps extends AppWorkspaceRegionProps {
  /**
   * Controls whether the declarative/default Secondary is visible on split-capable layouts.
   * Defaults to true. The default Secondary never auto-stacks on narrow layouts.
   */
  open?: boolean;
  /**
   * When provided, the split Secondary gets a Close action that requests open=false.
   * Consumers can restore the default Secondary later by rendering it with open=true.
   */
  onOpenChange?: (open: boolean) => void;
}

interface CommonAppWorkspaceProps {
  /** Keep headers fixed and let bounded content (editors/composers) own scrolling, including mobile. */
  scroll?: 'workspace' | 'content';
  /**
   * How the workspace is sized in split-capable (Wide/Compact) layouts. Stacked layouts always
   * fill the available width.
   * - `content` (default): fit intrinsic content when a Secondary is shown; Primary-only fills.
   * - `available`: always fill the measured available workspace (editors, creation flows).
   * - `bounded`: always fit intrinsic content, with or without a Secondary, so a Primary-only page
   *   whose readable unit has a fixed optimal width (a bounded `AppContent`) is centred with the
   *   navigation instead of stretching.
   */
  fit?: AppWorkspaceFit;
  split?: AppWorkspaceSplitMode;
  /**
   * Opt-in maximum width of the Primary region, in px. It applies whenever a Secondary is shown
   * beside it in a split layout, for every `split` value: Primary is its share of the split but never
   * wider than this, and Secondary takes the rest of the width. It does not apply to a stacked
   * layout or to a Primary without Secondary, and it has no practical effect with `fit="content"`
   * (the workspace then sizes by its content). Use it with `fit="available"` so a list beside a
   * document stops growing on very wide screens. Default: none, Primary is exactly its share.
   */
  primaryMaxPx?: number;
  /**
   * Only meaningful with `split="dynamic"` (workspace-dynamic-split.md §4.2): Secondary's current
   * share of the split, 0-1. Controlled, same convention as `AppWorkspace.Secondary`'s
   * `open`/`onOpenChange`: omit both this and `onSecondaryRatioChange` to let `AppWorkspace` own
   * the auto/manual ratio internally (the common case); pass both to let the product
   * persist/restore it across e.g. a reload. `AppWorkspace` remains the only place that decides
   * the width in px — a controlling product must treat the value as opaque state to store and
   * return, never recompute it.
   */
  secondaryRatio?: number;
  /** Only meaningful with `split="dynamic"`; see `secondaryRatio`. Reports `resolveDynamicWorkspaceSplit`'s own computed value, independent of whether `secondaryRatio` is controlled. */
  onSecondaryRatioChange?: (ratio: number, mode: 'auto' | 'manual') => void;
  /**
   * Which side of Primary Secondary renders on (workspace-dynamic-split.md §4.2 last bullet, §6
   * non-goal 3): a pure layout swap of flex order and which edge owns the divider border. Applies
   * identically for every `split` value (fixed presets and `dynamic` alike) — it is not gated to
   * the dynamic engine — and has no visible effect while `state.mode === 'stacked'` (there is only
   * one visible surface at a time). It never remounts Primary, any tab, or any tab's content, and
   * never changes `secondaryRatio`, `mode`, `tabs`, `activeTabId`, or any tab's local
   * stack/scroll/focus. Controlled, same convention as `secondaryRatio`/`onSecondaryRatioChange`:
   * omit both to use the default (`'end'`, today's only behavior); pass both to let the product
   * own/persist the value. `AppWorkspace` never initiates a side change itself (no built-in "swap"
   * control) — only a controlling product decides when to flip it.
   */
  secondarySide?: 'start' | 'end';
  /** Echoes the effective `secondarySide` whenever it changes; see `secondarySide`. */
  onSecondarySideChange?: (side: 'start' | 'end') => void;
  labels?: Partial<AppWorkspaceLabels>;
  /** Close the active page (returning to its parent) or the entire contextual flow. */
  secondaryCloseBehavior?: 'page' | 'flow';
  /**
   * What the Secondary shows as its own close action when the layout is stacked. In a stack the
   * Back action already leaves the Secondary, so `hide` removes the duplicate (the compact row loses
   * its close item too). Split layouts always keep the close action. Default `show`.
   */
  stackedSecondaryClose?: 'show' | 'hide';
}

export type AppWorkspaceProps = CommonAppWorkspaceProps & {
  children: ReactNode;
};

const defaultAppWorkspaceLabels: AppWorkspaceLabels = {
  backToPrimary: 'Back',
  closeSecondary: 'Close secondary content',
  openNavigation: 'Open navigation',
  resizeSecondary: 'Resize secondary panel',
};

interface WorkspaceSecondaryPresentation {
  surface: AppWorkspaceSurface;
  key: string;
  canStack: boolean;
  transition?: WorkspaceTransition;
  onClose?: () => void | Promise<unknown>;
  onBack?: () => void | Promise<unknown>;
}

function SurfaceBoundary({
  surface,
  children,
}: {
  surface: AppWorkspaceSurface;
  children: ReactNode;
}) {
  return surface.wrap ? surface.wrap(children) : children;
}

/** `WorkspaceSplitter` wiring for the current render, present only under `split="dynamic"` in `'split'` layout (contract §4.3). */
interface WorkspaceSplitterState {
  secondaryRatio: number;
  minSecondaryRatio: number;
  maxSecondaryRatio: number;
  availableWidth: number;
  onSecondaryRatioChange: (ratio: number) => void;
}

interface WorkspaceLayoutState {
  mode: 'split' | 'stacked';
  showSecondary: boolean;
  primaryMaxWidth?: number;
  secondaryMaxWidth?: number;
  splitter?: WorkspaceSplitterState;
}

function AppWorkspacePrimary(_props: AppWorkspaceRegionProps) {
  return null;
}

function AppWorkspaceSecondary(_props: AppWorkspaceSecondaryRegionProps) {
  return null;
}

function flattenWorkspaceChildren(children: ReactNode): ReactElement[] {
  const result: ReactElement[] = [];

  Children.forEach(children, (child) => {
    if (!isValidElement(child)) {
      return;
    }

    if (child.type === Fragment) {
      flattenWorkspaceChildren((child.props as { children?: ReactNode }).children).forEach(
        (nested) => result.push(nested),
      );

      return;
    }

    result.push(child);
  });

  return result;
}

interface ComposedDefaultSecondary {
  surface: AppWorkspaceSurface;
  open: boolean;
  onOpenChange?: (open: boolean) => void;
}

function resolveComposedWorkspace(children: ReactNode): {
  primary: AppWorkspaceSurface;
  defaultSecondary?: ComposedDefaultSecondary;
} {
  let primary: AppWorkspaceSurface | undefined;
  let defaultSecondary: ComposedDefaultSecondary | undefined;

  for (const child of flattenWorkspaceChildren(children)) {
    if (child.type === AppWorkspacePrimary) {
      if (primary) {
        throw new Error('AppWorkspace accepts only one AppWorkspace.Primary.');
      }

      const props = child.props as AppWorkspaceRegionProps;
      primary = { header: props.header, content: props.children };
    } else if (child.type === AppWorkspaceSecondary) {
      if (defaultSecondary) {
        throw new Error('AppWorkspace accepts only one AppWorkspace.Secondary.');
      }

      const props = child.props as AppWorkspaceSecondaryRegionProps;
      defaultSecondary = {
        surface: { header: props.header, content: props.children },
        open: props.open ?? true,
        onOpenChange: props.onOpenChange,
      };
    } else {
      throw new Error(
        'AppWorkspace children must be AppWorkspace.Primary or AppWorkspace.Secondary.',
      );
    }
  }

  if (!primary) {
    throw new Error('AppWorkspace requires AppWorkspace.Primary.');
  }

  return { primary, defaultSecondary };
}

/**
 * `split="dynamic"`'s sizing branch (workspace-dynamic-split.md §4.2), consuming
 * `resolveDynamicWorkspaceSplit`. `mode`/`manualRatio` are the resolver's own owned state
 * (contract §3 items 4-5), held here as real React state: `AppWorkspace` starts in `'auto'` mode
 * and enters `'manual'` the first time `setManualRatio` is called — by `WorkspaceSplitter`'s
 * pointer/touch drag or keyboard adjustment (§4.3/§7, wired by `useWorkspaceLayoutState` below).
 * This is deliberately **not** a second stacked rendering path: it only decides
 * `layout`/`secondaryRatio`; the existing `supportsRuntimeWorkspaceSplit`/`state.mode === 'stacked'`
 * path still renders the result.
 *
 * Live/product-event non-resize is structural here, not merely tested: the only values this
 * function reads are `availableWidth` (from the existing `ResizeObserver`-driven measurement) and
 * `openTabCount` (a plain count, never an active tab's identity or its local-stack depth) — there
 * is no Session/product subscription anywhere in this file.
 */
function useDynamicWorkspaceSplit(
  availableWidth: number | undefined,
  openTabCount: number,
  secondaryRatioProp: number | undefined,
  onSecondaryRatioChange: ((ratio: number, mode: 'auto' | 'manual') => void) | undefined,
  enabled: boolean,
): {
  layout: 'split' | 'stacked';
  secondaryRatio: number;
  bounds?: DynamicSplitRatioBounds;
  setManualRatio: (ratio: number) => void;
} {
  const [mode, setMode] = useState<'auto' | 'manual'>('auto');
  const [manualRatio, setManualRatioState] = useState<number | null>(null);

  const previousOpenTabCountRef = useRef(openTabCount);
  const result = resolveDynamicWorkspaceSplit({
    availableWidth,
    openTabCount,
    mode,
    manualRatio,
    previousOpenTabCount: previousOpenTabCountRef.current,
  });
  const bounds =
    availableWidth !== undefined &&
    availableWidth >= WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH + WORKSPACE_DYNAMIC_PRIMARY_MIN_WIDTH
      ? resolveDynamicSplitRatioBounds(availableWidth)
      : undefined;

  useEffect(() => {
    previousOpenTabCountRef.current = openTabCount;
  }, [openTabCount]);

  useEffect(() => {
    if (enabled) {
      onSecondaryRatioChange?.(result.secondaryRatio, result.mode);
    }
  }, [enabled, onSecondaryRatioChange, result.secondaryRatio, result.mode]);

  // A drag/keyboard adjustment always enters 'manual' (contract §5/§7), regardless of whether the
  // rendered ratio is uncontrolled (this state wins) or controlled (the product's own
  // `secondaryRatioProp` wins instead — it must echo this value back via `onSecondaryRatioChange`
  // above, the same controlled-prop convention as every other `AppWorkspace` value prop).
  const setManualRatio = useCallback((ratio: number) => {
    setMode('manual');
    setManualRatioState(ratio);
  }, []);

  return {
    layout: result.layout,
    secondaryRatio: secondaryRatioProp ?? result.secondaryRatio,
    bounds,
    setManualRatio,
  };
}

function useWorkspaceLayoutState(
  split: AppWorkspaceSplitMode,
  hasSecondary: boolean,
  secondaryCanStack: boolean,
  primaryMaxPx: number | undefined,
  dynamicOpenTabCount: number,
  dynamicSecondaryRatio: number | undefined,
  onDynamicSecondaryRatioChange: ((ratio: number, mode: 'auto' | 'manual') => void) | undefined,
): WorkspaceLayoutState {
  const { availableWidth, contentWidth = availableWidth } = useAppWorkspace();
  const isSplitView = supportsRuntimeWorkspaceSplit(availableWidth);
  const showSecondary = hasSecondary && (isSplitView || secondaryCanStack);
  // Always called (rules of hooks): a no-op (`enabled: false`) outside `split="dynamic"`.
  const dynamicSplit = useDynamicWorkspaceSplit(
    availableWidth,
    dynamicOpenTabCount,
    dynamicSecondaryRatio,
    onDynamicSecondaryRatioChange,
    split === 'dynamic',
  );

  if (split === 'dynamic') {
    // With no secondary to size against at all, there is nothing for the resolver to decide:
    // Primary gets the full content width, and `mode` falls back to the existing generic
    // split-capable check (same as a Primary-only non-dynamic workspace).
    if (!showSecondary) {
      return {
        mode: isSplitView ? 'split' : 'stacked',
        showSecondary,
        primaryMaxWidth: resolveSlotMaxWidth(contentWidth, 100),
        secondaryMaxWidth: undefined,
      };
    }

    const secondaryShare = dynamicSplit.secondaryRatio * 100;
    const widths = capPrimaryWidth(
      contentWidth,
      {
        primary: resolveSlotMaxWidth(contentWidth, 100 - secondaryShare),
        secondary: resolveSlotMaxWidth(contentWidth, secondaryShare),
      },
      primaryMaxPx,
    );

    const splitter: WorkspaceSplitterState | undefined =
      dynamicSplit.layout === 'split' && dynamicSplit.bounds && contentWidth !== undefined
        ? {
            secondaryRatio: dynamicSplit.secondaryRatio,
            minSecondaryRatio: dynamicSplit.bounds.min,
            maxSecondaryRatio: dynamicSplit.bounds.max,
            availableWidth: contentWidth,
            onSecondaryRatioChange: dynamicSplit.setManualRatio,
          }
        : undefined;

    return {
      // The resolver owns this decision entirely for `dynamic` (contract §4.2's own two
      // minimum-width constants, independent of the generic `WORKSPACE_SPLIT_MIN_WIDTH` the
      // fixed presets use below): `dynamic` may split at a narrower width than the fixed presets
      // do, and may also fall back to stacked at a wide width once a manual ratio (§5) makes the
      // current ratio's panes infeasible even after clamping — neither is the generic check.
      mode: dynamicSplit.layout === 'split' ? 'split' : 'stacked',
      showSecondary,
      primaryMaxWidth: widths.primary,
      secondaryMaxWidth: widths.secondary,
      splitter,
    };
  }

  const resolvedSplit = resolveWorkspaceSplit(split, isSplitView && showSecondary, availableWidth);

  const widths = capPrimaryWidth(
    contentWidth,
    {
      primary: resolveSlotMaxWidth(contentWidth, resolvedSplit.primary),
      secondary:
        resolvedSplit.secondary === 0
          ? undefined
          : resolveSlotMaxWidth(contentWidth, resolvedSplit.secondary),
    },
    primaryMaxPx,
  );

  return {
    mode: isSplitView ? 'split' : 'stacked',
    showSecondary,
    primaryMaxWidth: widths.primary,
    secondaryMaxWidth: widths.secondary,
  };
}

function NavigationAction({ label }: { label: string }) {
  return (
    <DrawerTrigger asChild>
      <IconButton aria-label={label} icon="menu" variant="ghost" />
    </DrawerTrigger>
  );
}

function BackAction({ label, onBack }: { label: string; onBack: () => void | Promise<unknown> }) {
  return (
    <IconButton
      aria-label={label}
      className="[&_svg]:rotate-180"
      icon="arrow-right"
      onClick={() => void onBack()}
      variant="ghost"
    />
  );
}

function CloseAction({
  label,
  onClose,
}: {
  label: string;
  onClose: () => void | Promise<unknown>;
}) {
  return (
    <IconButton
      aria-label={label}
      icon="close"
      onClick={() => void onClose()}
      size="sm"
      variant="ghost"
    />
  );
}

function RuntimeSurfaceRegion({
  contentOwnsScroll = false,
  fitAvailable = false,
  compactNavigationAction,
  divider = false,
  dividerSide = 'start',
  instanceKey,
  leadingAction,
  maxWidth,
  mobileRuntime,
  onMobileMotionComplete,
  onScrollElementChange,
  stackedVisual,
  surface,
  surfaceName,
  tabPanelId,
  tabPanelLabelledBy,
  trailingAction,
  surfaceRef,
  tabIndex,
}: {
  contentOwnsScroll?: boolean;
  compactNavigationAction?: WorkspaceHeaderAction;
  divider?: boolean;
  /**
   * Which edge of this region carries the divider border when `divider` is set (W06,
   * workspace-dynamic-split.md §4.2 last bullet): `'start'` (default, today's only behavior) is
   * this region's leading edge (`border-l`); `'end'` is its trailing edge (`border-r`) — used when
   * `secondarySide` places this region before its sibling instead of after it.
   */
  dividerSide?: 'start' | 'end';
  instanceKey: string;
  leadingAction?: ReactNode;
  maxWidth?: number;
  fitAvailable?: boolean;
  mobileRuntime?: MobileWorkspaceSurfaceRuntime;
  onMobileMotionComplete?: (event: AnimationEvent<HTMLElement>) => void;
  /** See `WorkspacePrimaryScrollContext`. Only meaningful while `stackedVisual` is true; ignored
   * by the split/desktop branch below, which never owns a scroll element of its own. */
  onScrollElementChange?: (element: HTMLElement | null) => void;
  stackedVisual: boolean;
  surface: AppWorkspaceSurface;
  surfaceName: 'primary' | 'secondary';
  /**
   * Set only while the Secondary root-tab strip (2+ tabs) is shown: ties the active tab's
   * `aria-controls` (set by `ItemTabs` itself) to this content region, matching item-tabs.md's
   * a11y contract without mounting more than the one active tab's content this architecture ever
   * mounts (see `AppWorkspace.stories.tsx`'s tab-strip stories).
   */
  tabPanelId?: string;
  tabPanelLabelledBy?: string;
  trailingAction?: ReactNode;
  surfaceRef?: Ref<HTMLDivElement>;
  tabIndex?: number;
}) {
  const showHeader =
    surface.header !== undefined || leadingAction !== undefined || trailingAction !== undefined;

  if (stackedVisual) {
    if (!mobileRuntime?.mounted) {
      return null;
    }

    return (
      <MobileRuntimeSurfaceRegion
        contentOwnsScroll={contentOwnsScroll}
        compactNavigationAction={compactNavigationAction}
        instanceKey={instanceKey}
        key={mobileRuntime.instanceKey}
        leadingAction={leadingAction}
        maxWidth={maxWidth}
        onMotionComplete={onMobileMotionComplete}
        onScrollElementChange={onScrollElementChange}
        runtime={mobileRuntime}
        surface={surface}
        surfaceRef={surfaceRef}
        tabIndex={tabIndex}
        trailingAction={trailingAction}
      />
    );
  }

  return (
    <div
      className={cn(
        'min-w-0 flex-none overflow-clip outline-none',
        'w-max max-w-full group-data-[workspace-fit=available]/workspace:w-full',
        divider && (dividerSide === 'end' ? 'border-r' : 'border-l'),
        divider && 'border-border-subtle',
      )}
      data-workspace-active="true"
      data-workspace-instance={instanceKey}
      data-workspace-surface={surfaceName}
      ref={surfaceRef}
      tabIndex={tabIndex}
      style={{
        maxWidth: maxWidth === undefined ? '100%' : `${maxWidth}px`,
        width: fitAvailable ? (maxWidth === undefined ? '100%' : `${maxWidth}px`) : undefined,
      }}
    >
      <div className="workspace-stack relative h-full min-h-0 min-w-0 overflow-clip">
        <div className="flex h-full min-h-0 flex-col" data-workspace-layer={instanceKey}>
          <SurfaceBoundary surface={surface}>
            {showHeader ? (
              <div
                className={cn(
                  '@container flex h-14 shrink-0 items-center gap-2',
                  'border-b border-border-subtle px-4',
                )}
              >
                {leadingAction}
                <div className="min-w-0 flex-1">{surface.header}</div>
                {trailingAction}
              </div>
            ) : null}
            <div
              aria-labelledby={tabPanelId ? tabPanelLabelledBy : undefined}
              className="min-h-0 flex-1 overflow-clip"
              id={tabPanelId}
              role={tabPanelId ? 'tabpanel' : undefined}
            >
              {surface.content}
            </div>
          </SurfaceBoundary>
        </div>
      </div>
    </div>
  );
}

function MobileRuntimeSurfaceRegion({
  contentOwnsScroll = false,
  compactNavigationAction,
  instanceKey,
  leadingAction,
  maxWidth,
  onMotionComplete,
  onScrollElementChange,
  runtime,
  surface,
  surfaceRef,
  tabIndex,
  trailingAction,
}: {
  contentOwnsScroll?: boolean;
  compactNavigationAction?: WorkspaceHeaderAction;
  instanceKey: string;
  leadingAction?: ReactNode;
  maxWidth?: number;
  onMotionComplete?: (event: AnimationEvent<HTMLElement>) => void;
  onScrollElementChange?: (element: HTMLElement | null) => void;
  runtime: MobileWorkspaceSurfaceRuntime;
  surface: AppWorkspaceSurface;
  surfaceRef?: Ref<HTMLDivElement>;
  tabIndex?: number;
  trailingAction?: ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  // Reports the actual scroll-owning element to `WorkspacePrimaryScrollContext` (only ever wired
  // for Primary, see `AppWorkspaceRoot` below) exactly when this content-not-owning-its-own-scroll
  // branch mounts/unmounts the real `ScrollArea` viewport — never for `contentOwnsScroll`, which
  // has no such element at all. React invokes a callback ref with `null` on unmount, so switching
  // back to split/desktop (unmounting this component) already clears it without extra cleanup.
  const setScrollElement = useCallback(
    (node: HTMLDivElement | null) => {
      viewportRef.current = node;
      onScrollElementChange?.(node);
    },
    [onScrollElementChange],
  );
  const headerRef = useRef<HTMLDivElement>(null);
  const [headerCovered, setHeaderCovered] = useState(false);
  const headerCoveredRef = useRef(false);
  const showHeader =
    surface.header !== undefined || leadingAction !== undefined || trailingAction !== undefined;

  const updateHeaderCovered = useCallback(
    (scrollTop: number) => {
      const headerHeight = headerRef.current?.offsetHeight ?? 0;
      const covered = !showHeader || (headerHeight > 0 && scrollTop >= headerHeight - 0.5);

      if (rootRef.current) {
        rootRef.current.dataset.headerCovered = String(covered);
      }

      if (headerCoveredRef.current === covered) {
        return;
      }

      headerCoveredRef.current = covered;
      setHeaderCovered(covered);
    },
    [showHeader],
  );

  useLayoutEffect(() => {
    const root = rootRef.current;
    const viewport = viewportRef.current;
    if (!root || !viewport) {
      return;
    }

    const updateMetrics = () => {
      root.style.setProperty('--mobile-workspace-viewport-height', `${viewport.clientHeight}px`);
      root.style.setProperty(
        '--mobile-workspace-header-height',
        `${headerRef.current?.offsetHeight ?? 0}px`,
      );
      updateHeaderCovered(viewport.scrollTop);
    };

    const resizeObserver = new ResizeObserver(updateMetrics);
    resizeObserver.observe(viewport);
    if (headerRef.current) {
      resizeObserver.observe(headerRef.current);
    }

    updateMetrics();

    return () => resizeObserver.disconnect();
  }, [updateHeaderCovered]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) {
      return;
    }

    viewport.scrollTop = 0;
    updateHeaderCovered(0);
  }, [instanceKey, updateHeaderCovered]);

  const setSurfaceRef = useCallback(
    (node: HTMLDivElement | null) => {
      rootRef.current = node;
      if (typeof surfaceRef === 'function') {
        surfaceRef(node);
      } else if (surfaceRef) {
        surfaceRef.current = node;
      }
    },
    [surfaceRef],
  );

  return (
    <div
      className={cn(
        '@container absolute inset-0 min-w-0 overflow-clip outline-none',
        'h-full w-full',
        runtime.surface === 'secondary' && 'bg-canvas bg-app-base',
        !runtime.visible && 'hidden',
      )}
      {...workspaceSurfaceRuntimeAttributes(runtime)}
      aria-hidden={!runtime.visible || !runtime.interactive || undefined}
      data-header-covered={headerCovered}
      inert={!runtime.interactive ? true : undefined}
      onAnimationEnd={onMotionComplete}
      ref={setSurfaceRef}
      tabIndex={tabIndex}
      style={{
        maxWidth: maxWidth === undefined ? '100%' : `${maxWidth}px`,
        zIndex: runtime.surface === 'secondary' ? (runtime.motion.phase === 'idle' ? 10 : 20) : 0,
      }}
    >
      <SurfaceBoundary surface={surface}>
        {contentOwnsScroll ? (
          <div
            className="workspace-stack relative flex h-full min-h-0 min-w-0 flex-col overflow-clip"
            data-workspace-scroll-owner="content"
          >
            <div className="flex h-full min-h-0 flex-col" data-workspace-layer={instanceKey}>
              {showHeader ? (
                <div
                  className="@container flex h-14 shrink-0 items-center gap-2 px-3"
                  ref={headerRef}
                >
                  {leadingAction}
                  <div className="min-w-0 flex-1">{surface.header}</div>
                  {trailingAction}
                </div>
              ) : null}
              <div
                className={cn(
                  workspaceSurfaceClassName,
                  'min-h-0 flex-1 overflow-clip rounded-t-surface border border-b-0 border-workspace-edge',
                )}
              >
                {surface.content}
              </div>
            </div>
          </div>
        ) : (
          <ScrollArea
            className="mobile-workspace-scroll-area h-full"
            contentClassName="min-h-full"
            direction="vertical"
            onScroll={(event) => updateHeaderCovered(event.currentTarget.scrollTop)}
            startEdge={headerCovered ? 'auto' : 'hidden'}
            viewportClassName="mobile-workspace-scroll"
            viewportRef={setScrollElement}
          >
            <div className="workspace-stack relative min-h-full min-w-0 overflow-hidden">
              <div
                className="workspace-stack__layer workspace-stack__layer--current flex min-h-full flex-col"
                data-workspace-layer={instanceKey}
              >
                <>
                  {showHeader ? (
                    <div
                      aria-hidden={headerCovered || undefined}
                      className="@container flex h-14 shrink-0 items-center gap-2 px-3"
                      inert={headerCovered ? true : undefined}
                      ref={headerRef}
                    >
                      {leadingAction}
                      <div className="min-w-0 flex-1">{surface.header}</div>
                      {trailingAction}
                    </div>
                  ) : null}

                  <div className="mobile-workspace-sheet flex-1">
                    <div
                      className={cn(
                        workspaceSurfaceClassName,
                        'mobile-workspace-surface min-h-full overflow-hidden rounded-t-surface border border-b-0 border-workspace-edge',
                      )}
                    >
                      <AppContentScrollProvider>
                        <div className="min-h-full">{surface.content}</div>
                      </AppContentScrollProvider>
                    </div>
                  </div>
                </>
              </div>
            </div>
          </ScrollArea>
        )}

        {!contentOwnsScroll && (
          <div
            aria-hidden={!headerCovered || undefined}
            className="mobile-floating-navigation"
            inert={!headerCovered ? true : undefined}
          >
            {leadingAction}
            {surface.renderCompactActions ? (
              surface.renderCompactActions({
                className: 'mobile-floating-navigation__control',
                navigationAction: compactNavigationAction,
              })
            ) : (
              <CompactWorkspaceActions
                className="mobile-floating-navigation__control"
                header={surface.header}
                navigationAction={compactNavigationAction}
              />
            )}
          </div>
        )}
      </SurfaceBoundary>
    </div>
  );
}

function AppWorkspaceRoot({
  children,
  labels: labelsProp,
  split = 'balanced',
  primaryMaxPx,
  secondaryRatio,
  onSecondaryRatioChange,
  secondarySide: secondarySideProp,
  onSecondarySideChange,
  fit = 'content',
  secondaryCloseBehavior = 'flow',
  stackedSecondaryClose = 'show',
  scroll = 'workspace',
}: AppWorkspaceProps) {
  const staticSurfaces = resolveComposedWorkspace(children);
  // Pure layout order (workspace-dynamic-split.md §4.2 last bullet, §6 non-goal 3): no internal
  // state and no internal trigger — `AppWorkspace` renders whichever side the (controlled or
  // default) value names and never flips it itself. The effect below only echoes the effective
  // value back, the same "report the current value regardless of who owns it" convention
  // `onSecondaryRatioChange` already follows, so a controlling product can observe/persist it.
  const secondarySide = secondarySideProp ?? 'end';

  const workspace = useOptionalWorkspace();
  const { navigationMode } = useAppWorkspace();
  const runtimeSecondary = workspace?.secondary ?? null;
  const defaultSecondary = staticSurfaces.defaultSecondary;
  const defaultSecondaryOpen = defaultSecondary?.open ?? false;
  const secondaryTabsState = workspace?.tabs;
  const showSecondaryTabStrip = Boolean(secondaryTabsState && secondaryTabsState.tabs.length >= 2);
  const secondaryPresentationBase: WorkspaceSecondaryPresentation | undefined = runtimeSecondary
    ? {
        surface: runtimeSecondary.surface,
        key: `runtime-${runtimeSecondary.instanceKey}`,
        canStack: true,
        transition: workspace?.transition,
        onClose: secondaryCloseBehavior === 'page' ? workspace?.back : workspace?.close,
        onBack: workspace?.back,
      }
    : defaultSecondaryOpen && defaultSecondary
      ? {
          surface: defaultSecondary.surface,
          key: 'default-secondary',
          canStack: false,
          transition: workspace?.transition,
          onClose: defaultSecondary.onOpenChange
            ? () => defaultSecondary.onOpenChange?.(false)
            : undefined,
        }
      : undefined;
  // The strip is the Secondary header's content whenever 2+ tabs are open (workspace-dynamic-split
  // §4.1); with 0 or 1, `surface` passes through completely unchanged, so that baseline stays
  // pixel/DOM-identical to today.
  const secondaryPresentation: WorkspaceSecondaryPresentation | undefined =
    secondaryPresentationBase && showSecondaryTabStrip && workspace && secondaryTabsState
      ? {
          ...secondaryPresentationBase,
          surface: withSecondaryTabStrip(
            secondaryPresentationBase.surface,
            secondaryTabsState,
            workspace.activateTab,
            workspace.closeTab,
          ),
        }
      : secondaryPresentationBase;
  const secondaryTabPanelId =
    showSecondaryTabStrip && secondaryTabsState?.activeTabId
      ? getItemTabPanelId(SECONDARY_TABS_SCOPE, secondaryTabsState.activeTabId)
      : undefined;
  const secondaryTabPanelLabelledBy =
    showSecondaryTabStrip && secondaryTabsState?.activeTabId
      ? getItemTabId(SECONDARY_TABS_SCOPE, secondaryTabsState.activeTabId)
      : undefined;
  const outgoingSecondary = workspace?.transition.outgoing;
  const outgoingSecondaryPresentation = outgoingSecondary
    ? {
        surface: outgoingSecondary.surface,
        key: `runtime-${outgoingSecondary.instanceKey}`,
      }
    : undefined;
  // `resolveDynamicWorkspaceSplit`'s only tab-shaped input (contract §4.2): `tabs.tabs.length`
  // when a `WorkspaceContext` is present (pinned + legacy-slot + `openTab()` entries, §4.1),
  // else 1 while any declarative/runtime Secondary is shown without one, else 0.
  const dynamicOpenTabCount = secondaryTabsState
    ? secondaryTabsState.tabs.length
    : secondaryPresentationBase
      ? 1
      : 0;
  const state = useWorkspaceLayoutState(
    split,
    secondaryPresentation !== undefined,
    secondaryPresentation?.canStack ?? false,
    primaryMaxPx,
    dynamicOpenTabCount,
    secondaryRatio,
    onSecondaryRatioChange,
  );
  const resolvedFit = resolveWorkspaceFit(fit, state.mode, state.showSecondary, navigationMode);
  const mobileRuntime = useMobileWorkspaceTransition({
    secondaryInstanceKey:
      state.mode === 'stacked' && state.showSecondary ? secondaryPresentation?.key : undefined,
    // Closing the last Secondary leaves no incoming surface, but its outgoing one must still exit.
    transition: state.mode === 'stacked' ? workspace?.transition : undefined,
  });
  const secondaryRegionRef = useRef<HTMLDivElement>(null);
  // Primary's own ambient scroll element (see `WorkspacePrimaryScrollContext`): owned here, not by
  // `RuntimeSurfaceRegion`/`MobileRuntimeSurfaceRegion` themselves, so it survives Primary's own
  // mode transitions (stacked <-> split) as ordinary React state rather than a ref no one outside
  // this component could read.
  const [primaryScrollElement, setPrimaryScrollElement] = useState<HTMLElement | null>(null);
  const labels = { ...defaultAppWorkspaceLabels, ...labelsProp };
  const primaryNavigationAction =
    navigationMode === 'drawer' ? <NavigationAction label={labels.openNavigation} /> : undefined;
  const secondaryBackAction =
    secondaryPresentation?.onBack &&
    (state.mode === 'stacked' ||
      workspace?.canGoBack ||
      (state.mode === 'split' && secondaryPresentation.canStack)) ? (
      <BackAction label={labels.backToPrimary} onBack={secondaryPresentation.onBack} />
    ) : undefined;
  const hideClose = state.mode === 'stacked' && stackedSecondaryClose === 'hide';
  const secondaryCloseAction =
    secondaryPresentation?.onClose && !hideClose ? (
      <CloseAction label={labels.closeSecondary} onClose={secondaryPresentation.onClose} />
    ) : undefined;
  const compactSecondaryCloseAction: WorkspaceHeaderAction | undefined =
    secondaryPresentation?.onClose && !hideClose
      ? {
          id: 'close-secondary-navigation',
          label: labels.closeSecondary,
          icon: 'close',
          onPress: () => void secondaryPresentation.onClose?.(),
        }
      : undefined;
  const outgoingBackAction = outgoingSecondaryPresentation ? (
    <BackAction label={labels.backToPrimary} onBack={() => undefined} />
  ) : undefined;
  const outgoingCloseAction =
    outgoingSecondaryPresentation && !hideClose ? (
      <CloseAction label={labels.closeSecondary} onClose={() => undefined} />
    ) : undefined;

  useLayoutEffect(() => {
    if (!secondaryPresentation?.canStack) {
      return;
    }

    if (
      secondaryPresentation.transition?.action !== 'push' &&
      secondaryPresentation.transition?.action !== 'replace'
    ) {
      return;
    }

    const frame = requestAnimationFrame(() => {
      const target = secondaryRegionRef.current?.querySelector<HTMLElement>(
        '[data-workspace-header-title="true"]',
      );
      // The incoming surface is still translated off-screen here; letting focus scroll would shift
      // the overflow-hidden workspace container against the running transform.
      (target ?? secondaryRegionRef.current)?.focus({ preventScroll: true });
    });

    return () => cancelAnimationFrame(frame);
  }, [
    secondaryPresentation?.canStack,
    secondaryPresentation?.key,
    secondaryPresentation?.transition?.action,
    secondaryPresentation?.transition?.revision,
  ]);

  useEffect(() => {
    onSecondarySideChange?.(secondarySide);
  }, [onSecondarySideChange, secondarySide]);

  // `key`s on `primaryElement`/`splitterElement` (Secondary's own `RuntimeSurfaceRegion` already
  // keys by `secondaryPresentation.key`) let the side swap below reorder these three siblings in
  // the flex row by position without React treating the move as an unmount/remount of either
  // region's content, instance, or local state (workspace-dynamic-split.md §4.2 last bullet: "MUST
  // NOT remount Primary, any tab, or any tab's content").
  const primaryElement = (
    <RuntimeSurfaceRegion
      contentOwnsScroll={scroll === 'content'}
      instanceKey="primary"
      key="primary"
      leadingAction={primaryNavigationAction}
      fitAvailable={fit === 'available'}
      maxWidth={state.primaryMaxWidth}
      mobileRuntime={state.mode === 'stacked' ? mobileRuntime.primary : undefined}
      onMobileMotionComplete={mobileRuntime.completeMotion}
      onScrollElementChange={setPrimaryScrollElement}
      stackedVisual={state.mode === 'stacked'}
      surface={staticSurfaces.primary}
      surfaceName="primary"
    />
  );

  const splitterElement =
    state.mode === 'split' && state.splitter ? (
      <WorkspaceSplitter
        key="splitter"
        availableWidth={state.splitter.availableWidth}
        label={labels.resizeSecondary}
        maxSecondaryRatio={state.splitter.maxSecondaryRatio}
        minSecondaryRatio={state.splitter.minSecondaryRatio}
        onSecondaryRatioChange={state.splitter.onSecondaryRatioChange}
        secondaryRatio={state.splitter.secondaryRatio}
        secondarySide={secondarySide}
      />
    ) : null;

  const secondaryElement =
    state.showSecondary && secondaryPresentation ? (
      <RuntimeSurfaceRegion
        contentOwnsScroll={scroll === 'content'}
        compactNavigationAction={compactSecondaryCloseAction}
        // `WorkspaceSplitter` is itself the visual division between Primary and Secondary for a
        // dynamic split (contract §4.3): the generic border divider would otherwise double it.
        divider={state.mode === 'split' && !state.splitter}
        // Secondary's divider always faces Primary: at the default side ('end', Secondary after
        // Primary) that is Secondary's leading edge (`border-l`); swapped ('start', Secondary
        // before Primary) it is Secondary's trailing edge (`border-r`) instead.
        dividerSide={secondarySide === 'start' ? 'end' : 'start'}
        instanceKey={secondaryPresentation.key}
        key={secondaryPresentation.key}
        leadingAction={secondaryBackAction}
        fitAvailable={fit === 'available'}
        maxWidth={state.mode === 'split' ? state.secondaryMaxWidth : undefined}
        mobileRuntime={state.mode === 'stacked' ? mobileRuntime.secondary : undefined}
        onMobileMotionComplete={mobileRuntime.completeMotion}
        stackedVisual={state.mode === 'stacked'}
        surface={secondaryPresentation.surface}
        surfaceName="secondary"
        surfaceRef={secondaryRegionRef}
        tabIndex={state.mode === 'stacked' ? -1 : undefined}
        tabPanelId={secondaryTabPanelId}
        tabPanelLabelledBy={secondaryTabPanelLabelledBy}
        trailingAction={secondaryCloseAction}
      />
    ) : null;

  // `secondarySide` only ever reorders these three split-layout siblings (workspace-dynamic-split
  // .md §4.2 last bullet: "only changes layout order"); it is applied for every `split` value, not
  // only `dynamic` (§6 non-goal framing — side swap is pure layout). Stacked layouts render exactly
  // today's order regardless of `secondarySide` (contract §4.2/acceptance: "no visible effect when
  // `state.mode === 'stacked'`" — each surface is absolutely positioned on top of the other there,
  // so DOM order carries no visual meaning anyway).
  const splitSecondaryStart = state.mode === 'split' && secondarySide === 'start';

  return (
    <WorkspacePrimaryScrollContext.Provider value={primaryScrollElement}>
      <div
        className={cn(
          'group/workspace relative flex h-full max-w-full items-stretch overflow-hidden',
          state.mode === 'split' && navigationMode === 'drawer' && workspaceSurfaceClassName,
        )}
        data-layout={state.mode}
        data-workspace-fit={resolvedFit}
        style={{ width: resolvedFit === 'content' ? 'max-content' : '100%' }}
      >
        {splitSecondaryStart ? (
          <>
            {secondaryElement}
            {splitterElement}
            {primaryElement}
          </>
        ) : (
          <>
            {primaryElement}
            {splitterElement}
            {secondaryElement}
          </>
        )}

        {state.mode === 'stacked' &&
        mobileRuntime.outgoingSecondary.mounted &&
        outgoingSecondaryPresentation ? (
          <RuntimeSurfaceRegion
            contentOwnsScroll={scroll === 'content'}
            instanceKey={outgoingSecondaryPresentation.key}
            key={`outgoing-${outgoingSecondaryPresentation.key}`}
            leadingAction={outgoingBackAction}
            maxWidth={undefined}
            mobileRuntime={mobileRuntime.outgoingSecondary}
            onMobileMotionComplete={mobileRuntime.completeMotion}
            stackedVisual
            surface={outgoingSecondaryPresentation.surface}
            surfaceName="secondary"
            trailingAction={outgoingCloseAction}
          />
        ) : null}
      </div>
    </WorkspacePrimaryScrollContext.Provider>
  );
}

export const AppWorkspace = Object.assign(AppWorkspaceRoot, {
  Primary: AppWorkspacePrimary,
  Secondary: AppWorkspaceSecondary,
});

export {
  WorkspaceHeader,
  type WorkspaceHeaderAction,
  type WorkspaceHeaderActionDirect,
  type WorkspaceHeaderActionGroup,
  type WorkspaceHeaderMenu,
  type WorkspaceHeaderActionTone,
  type WorkspaceHeaderDensity,
  type WorkspaceHeaderProps,
};

export {
  AppContent,
  AppContentContainer,
  AppWorkspaceBody,
  AppWorkspaceHeader,
  type AppContentContainerProps,
  type AppContentContainerSize,
} from './AppContent';
export {
  AppWorkspaceSlots,
  type AppWorkspaceSlot,
  type AppWorkspaceSlotsProps,
} from './AppWorkspaceSlots';

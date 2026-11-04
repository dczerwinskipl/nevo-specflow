import {
  Children,
  createContext,
  Fragment,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
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
  type ItemTabsProps,
} from '../../components/navigation/ItemTabs';
import {
  ITEM_TAB_COMPRESSED_WIDTH,
  ITEM_TABS_OVERFLOW_WIDTH,
} from '../../components/navigation/ItemTabs/itemTabsLayout';
import { workspaceSurfaceClassName } from '../../design-system/brandEnvironment';
import { cn } from '../../lib';
import { useAppWorkspace } from '../shell/AppShell';
import { AppContentScrollProvider } from './AppContent';
import { useOptionalWorkspace } from './WorkspaceContext';
import type { SecondaryTabsState, WorkspaceTransition } from './WorkspaceContext';
import {
  capPrimaryWidth,
  resolveSlotMaxWidth,
  resolveWorkspaceFit,
  resolveWorkspaceSplit,
  supportsRuntimeWorkspaceSplit,
  type AppWorkspaceFit,
  type AppWorkspaceSplitMode,
} from './workspaceSizing';
import { WorkspaceSplitter } from './WorkspaceSplitter';
import { useDynamicWorkspaceSplit } from './useDynamicWorkspaceSplit';
import { WorkspaceLayoutContext, type WorkspaceLayout } from './useWorkspaceLayout';
import { SecondaryDetailHeaderRow } from './SecondaryDetailHeaderRow';
import { SecondaryDetailHeaderHostContext } from './secondaryDetailHeaderHost';
import { WorkspaceHeaderIdentityOverrideProvider } from './workspaceHeaderIdentityOverride';
import { SecondaryBreadcrumbRow } from './SecondaryBreadcrumbRow';
import { secondaryScrollKey, useSecondaryScrollMemory } from './secondaryScrollMemory';
import type { AppWorkspaceSurface } from './workspaceSurface';
import {
  useMobileWorkspaceTransition,
  workspaceSurfaceRuntimeAttributes,
  type MobileWorkspaceSurfaceRuntime,
} from './useMobileWorkspaceTransition';
import {
  CompactWorkspaceActions,
  WorkspaceHeader,
  type WorkspaceHeaderAction,
  type WorkspaceHeaderActionDirect,
  type WorkspaceHeaderActionGroup,
  type WorkspaceHeaderMenu,
  type WorkspaceHeaderActionTone,
  type WorkspaceHeaderDensity,
  type WorkspaceHeaderProps,
} from './WorkspaceHeader';

/**
 * Prefix of the Secondary root-tab strip's own `ItemTabs` scope (`getItemTabId`/
 * `getItemTabPanelId` namespace). Each `AppWorkspace` instance appends its `useId`, so two
 * workspaces in one document (and a product's own `ItemTabs`) never share element ids.
 */
const SECONDARY_TABS_SCOPE_PREFIX = 'workspace-secondary-tabs';

/**
 * Width (px) under which the Secondary root-tab strip collapses to `ItemTabs`' switcher button —
 * scoped to this header only (`ItemTabs`' own `switcherBelow` prop), never a change to its general
 * 480px default that other hosts (Documents' `DocumentTabStrip`, …) keep. At an ordinary 50/50 split
 * the strip's own width sits just under 480 (measured 470px at 1440), and the owner decision is to
 * keep the strip visible longer: it stays usable while two tabs still fit at their compressed width
 * next to its overflow menu (the rest go to that menu, `fitItemTabs`; content-width tabs usually
 * need less); below that it falls back to the switcher. Local depth never shares this row (it is
 * the back/breadcrumb row under it), so the presentation does not flip between a tab's root and
 * its details.
 */
const SECONDARY_TABS_SWITCHER_BELOW = 2 * ITEM_TAB_COMPRESSED_WIDTH + ITEM_TABS_OVERFLOW_WIDTH;

/**
 * Composes the Secondary root-tab strip (contract workspace-dynamic-split.md §4.1, reusing
 * item-tabs.md's Content tabs host pattern verbatim) into an already-resolved surface's header,
 * replacing only its identity content. The surface's own header is kept as is and rendered under
 * `WorkspaceHeaderIdentityOverrideProvider`: its `WorkspaceHeaderFrame` swaps its identity for the
 * strip and keeps its own actions/menu/labels, so nothing about what a tab's content means (nor
 * what kind of element its header is) is inspected here.
 */
function withSecondaryTabStrip(
  surface: AppWorkspaceSurface,
  tabs: SecondaryTabsState,
  shownTabId: string | null,
  activateTab: (id: string) => Promise<boolean>,
  closeTab: (id: string) => Promise<boolean>,
  tabsScope: string,
  density: 'header' | 'rail',
  tabLabels?: AppWorkspaceLabels['secondaryTabs'],
): AppWorkspaceSurface {
  const items: readonly ItemTab[] = tabs.tabs.map((tab) => ({
    id: tab.id,
    label: tab.title,
    closable: tab.closable,
  }));
  const shownTitle = tabs.tabs.find((tab) => tab.id === shownTabId)?.title;

  return {
    ...surface,
    header: (
      <WorkspaceHeaderIdentityOverrideProvider
        value={
          <>
            {/* The region's heading, as `DocumentTabStrip` (the established strip host) renders
                it: the override replaces the header's own visible title, so without this the
                region had no heading and no `data-workspace-header-title` focus target for the
                push/replace focus move below. The strip itself is not a heading. */}
            <h2 tabIndex={-1} data-workspace-header-title="true" className="sr-only outline-none">
              {shownTitle}
            </h2>
            <ItemTabs
              activeId={shownTabId}
              items={items}
              onActivate={(id) => void activateTab(id)}
              onClose={(id) => void closeTab(id)}
              scope={tabsScope}
              switcherBelow={SECONDARY_TABS_SWITCHER_BELOW}
              density={density}
              labels={tabLabels}
            />
          </>
        }
      >
        {surface.header}
      </WorkspaceHeaderIdentityOverrideProvider>
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

/**
 * Primary's current ambient "sheet" — the bordered, rounded-top material box
 * (`.mobile-workspace-surface` below) that `scroll="workspace"` wraps stacked/mobile Primary
 * content in — or `null` under the same conditions as `useWorkspacePrimaryScroll()`. A distinct
 * element from that hook's own: the scroll hook reports the `ScrollArea` *viewport* (what
 * scrolls), this one reports the inner *material box* (what's scrolled, and the only element whose
 * own CSS box — including padding — actually paints this surface's border/background/rounding). A
 * consumer that needs to reserve bottom space for a floating overlay (e.g. a `position: fixed`
 * Composer) so that reservation reads as part of the one real surface rather than a gap outside
 * it, should apply that reservation here, as real padding on this element, not on the scroll
 * viewport `useWorkspacePrimaryScroll()` returns — padding on the viewport only extends how far its
 * content can scroll; it is not part of this sheet's own box and will not inherit its material.
 * Scoped to Primary only, mirroring `WorkspacePrimaryScrollContext` — Secondary has no equivalent
 * need today.
 */
const WorkspacePrimarySheetContext = createContext<HTMLElement | null>(null);

export function useWorkspacePrimarySheet(): HTMLElement | null {
  return useContext(WorkspacePrimarySheetContext);
}

export interface AppWorkspaceLabels {
  backToPrimary: string;
  /**
   * Accessible name of the split Secondary breadcrumb row's leading one-level Back, given the title
   * of the level it returns to. Optional: defaults to `"<backToPrimary>: <title>"`.
   */
  backToParent?: (parentTitle: string) => string;
  /**
   * The split Secondary breadcrumb row's `nav` name and its collapsed `…` menu trigger. Optional:
   * English defaults.
   */
  secondaryBreadcrumbs?: { navigation?: string; collapsed?: string };
  closeSecondary: string;
  openNavigation: string;
  /** `WorkspaceSplitter`'s accessible name (workspace-dynamic-split.md §7). */
  resizeSecondary: string;
  /**
   * Copy for the Secondary root-tab strip's `ItemTabs` (switcher, close, opened menu). Optional:
   * without it the strip keeps `ItemTabs`' own English defaults, so existing consumers are unchanged.
   */
  secondaryTabs?: ItemTabsProps['labels'];
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
  /**
   * Split layout only: `tab-rail` hosts the header as the 36px editor-tab rail
   * (`--spacing-tab-rail`) like the Secondary root-tab strip: no padding or border of its own, no
   * panel-level Close (each tab closes itself). The `header` is then an `ItemTabs`
   * `density="rail"` strip, usually inside `WorkspaceHeader tabRail` so its actions continue the
   * strip. Stacked layouts keep the 56px `header`. Default `header`.
   */
  headerVariant?: 'header' | 'tab-rail';
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
  /**
   * Only meaningful with `split="dynamic"`; see `secondaryRatio`. Uncontrolled: reports every change
   * of the resolver's `(ratio, mode)` once the width is measured. Controlled: a controlled
   * `secondaryRatio` is a manual preference rendered clamped to the valid range, never overwritten by
   * auto values; this reports only a user adjustment (`'manual'`) or a later controlled value the
   * current width cannot honour (once, clamped). See `useDynamicWorkspaceSplit`.
   */
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
  /** The declarative Secondary's own request for the editor-tab rail header (split only). */
  headerVariant?: 'header' | 'tab-rail';
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
  headerVariant?: 'header' | 'tab-rail';
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
        headerVariant: props.headerVariant,
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

function useWorkspaceLayoutState(
  split: AppWorkspaceSplitMode,
  hasSecondary: boolean,
  secondaryCanStack: boolean,
  primaryMaxPx: number | undefined,
  dynamicOpenTabCount: number,
  dynamicSecondaryRatio: number | undefined,
  onDynamicSecondaryRatioChange: ((ratio: number, mode: 'auto' | 'manual') => void) | undefined,
  scopeGeneration: number,
): WorkspaceLayoutState {
  const { availableWidth, contentWidth = availableWidth } = useAppWorkspace();
  const isSplitView = supportsRuntimeWorkspaceSplit(availableWidth);
  const showSecondary = hasSecondary && (isSplitView || secondaryCanStack);
  // Always called (rules of hooks): a no-op (`enabled: false`) outside `split="dynamic"`.
  // Sized against the width actually rendered (`contentWidth`, inside the surface borders), so the
  // fit check and the ratio bounds agree with the slot widths below: Primary never ends up a
  // sub-pixel under its minimum. The split-capable threshold above stays on `availableWidth`.
  const dynamicSplit = useDynamicWorkspaceSplit(
    contentWidth,
    dynamicOpenTabCount,
    dynamicSecondaryRatio,
    onDynamicSecondaryRatioChange,
    split === 'dynamic',
    scopeGeneration,
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

    // Stacked: Secondary slides OVER Primary instead of sitting beside it, so Primary keeps the
    // full content width. Sizing it by the split ratio here squeezed the still-visible chat to
    // the ratio's leftover (~45px at 375px) for the whole slide-in/out (owner audit, live on a
    // phone: "panel główny się kurczy podczas gdy jest zasłaniany").
    //
    // The resolver owns the split/stacked decision entirely for `dynamic` (contract §4.2's own
    // two minimum-width constants, independent of the generic `WORKSPACE_SPLIT_MIN_WIDTH` the
    // fixed presets use below): `dynamic` may split at a narrower width than the fixed presets
    // do (400 + 330 = 730px). A ratio — controlled or manual — is always clamped into the valid
    // range first, so the layout falls back to stacked only when the width cannot hold both
    // minimum pane widths at all.
    if (dynamicSplit.layout !== 'split') {
      return {
        mode: 'stacked',
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
      dynamicSplit.bounds && contentWidth !== undefined
        ? {
            secondaryRatio: dynamicSplit.secondaryRatio,
            minSecondaryRatio: dynamicSplit.bounds.min,
            maxSecondaryRatio: dynamicSplit.bounds.max,
            availableWidth: contentWidth,
            onSecondaryRatioChange: dynamicSplit.setManualRatio,
          }
        : undefined;

    return {
      mode: 'split',
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
  onSheetElementChange,
  stackedVisual,
  surface,
  surfaceName,
  contentNavigation,
  headerVariant = 'header',
  detailHeaderHosted = false,
  tabPanelId,
  tabPanelLabelledBy,
  scrollMemoryKey,
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
  /**
   * Split layout only (ignored by the stacked branch, which keeps its header Back): the local
   * navigation row (detail header row or breadcrumbs), rendered as the first child of the content region (the tab panel), directly under the
   * header and above the content.
   */
  contentNavigation?: ReactNode;
  /**
   * Split layout only: `tab-rail` sizes the header row as the editor-tab rail
   * (`--spacing-tab-rail`, 36px, no padding or border of its own: the tabs draw the strip and its
   * divider) instead of the 56px workspace header.
   */
  headerVariant?: 'header' | 'tab-rail';
  /** The `contentNavigation` row is the detail header row, which hosts the screen's `detailHeader`. */
  detailHeaderHosted?: boolean;
  maxWidth?: number;
  fitAvailable?: boolean;
  mobileRuntime?: MobileWorkspaceSurfaceRuntime;
  onMobileMotionComplete?: (event: AnimationEvent<HTMLElement>) => void;
  /** See `WorkspacePrimaryScrollContext`. Only meaningful while `stackedVisual` is true; ignored
   * by the split/desktop branch below, which never owns a scroll element of its own. */
  onScrollElementChange?: (element: HTMLElement | null) => void;
  /** See `WorkspacePrimarySheetContext`. Only meaningful while `stackedVisual` is true, same as
   * `onScrollElementChange` above — the split/desktop branch below has no equivalent "sheet" box
   * of its own to report (its content is a normal flow child of its own local scroll container
   * already, never a separate ambient material box). */
  onSheetElementChange?: (element: HTMLElement | null) => void;
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
  /**
   * Split layout, Secondary only: `(tab id, stack entry)` identity under which the workspace
   * remembers the scroll offsets inside this tab panel and restores them when the entry is shown
   * again (see `secondaryScrollMemory.ts`). Stacked layouts keep their own scroll reset.
   */
  scrollMemoryKey?: string;
  trailingAction?: ReactNode;
  surfaceRef?: Ref<HTMLDivElement>;
  tabIndex?: number;
}) {
  const showHeader =
    surface.header !== undefined || leadingAction !== undefined || trailingAction !== undefined;
  const panelRef = useRef<HTMLDivElement>(null);
  useSecondaryScrollMemory(panelRef, stackedVisual ? undefined : scrollMemoryKey);

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
        onSheetElementChange={onSheetElementChange}
        runtime={mobileRuntime}
        surface={surface}
        surfaceRef={surfaceRef}
        tabIndex={tabIndex}
        tabPanelId={tabPanelId}
        tabPanelLabelledBy={tabPanelLabelledBy}
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
            <SecondaryDetailHeaderHostContext.Provider value={detailHeaderHosted}>
              {showHeader ? (
                <div
                  className={cn(
                    '@container flex shrink-0 items-center gap-2',
                    headerVariant === 'tab-rail'
                      ? 'h-tab-rail'
                      : 'h-14 border-b border-border-subtle px-4',
                  )}
                  data-workspace-tab-rail={headerVariant === 'tab-rail' ? 'true' : undefined}
                >
                  {leadingAction}
                  <div className="min-w-0 flex-1">{surface.header}</div>
                  {trailingAction}
                </div>
              ) : null}
              <div
                aria-labelledby={tabPanelId ? tabPanelLabelledBy : undefined}
                className={cn('min-h-0 flex-1 overflow-clip', contentNavigation && 'flex flex-col')}
                id={tabPanelId}
                ref={panelRef}
                role={tabPanelId ? 'tabpanel' : undefined}
              >
                {contentNavigation}
                {contentNavigation ? (
                  <div className="min-h-0 flex-1 overflow-clip">{surface.content}</div>
                ) : (
                  surface.content
                )}
              </div>
            </SecondaryDetailHeaderHostContext.Provider>
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
  onSheetElementChange,
  runtime,
  surface,
  surfaceRef,
  tabIndex,
  tabPanelId,
  tabPanelLabelledBy,
  trailingAction,
}: {
  contentOwnsScroll?: boolean;
  compactNavigationAction?: WorkspaceHeaderAction;
  instanceKey: string;
  leadingAction?: ReactNode;
  maxWidth?: number;
  onMotionComplete?: (event: AnimationEvent<HTMLElement>) => void;
  onScrollElementChange?: (element: HTMLElement | null) => void;
  onSheetElementChange?: (element: HTMLElement | null) => void;
  runtime: MobileWorkspaceSurfaceRuntime;
  surface: AppWorkspaceSurface;
  surfaceRef?: Ref<HTMLDivElement>;
  tabIndex?: number;
  /** Set while the root-tab strip is shown: the content wrapper is the active tab's `tabpanel`. */
  tabPanelId?: string;
  tabPanelLabelledBy?: string;
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
  // Reports the real material box — `.mobile-workspace-surface` below — to
  // `WorkspacePrimarySheetContext`. Deliberately a *different* element from `setScrollElement`
  // above: that one is the outer `ScrollArea` viewport (what scrolls), this one is the inner
  // content box (what's scrolled, and the only one whose own CSS box — padding included — paints
  // this surface's border/background/rounding). A consumer reserving bottom space for a floating
  // overlay (e.g. a `position: fixed` Composer) needs *this* ref, not the scroll viewport's, for
  // that reservation to read as part of the surface rather than a gap outside it.
  const setSheetElement = useCallback(
    (node: HTMLDivElement | null) => {
      onSheetElementChange?.(node);
    },
    [onSheetElementChange],
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

    // Real mobile Chrome/Safari toolbar collapse (triggered by scrolling) resizes the VISUAL
    // viewport live, but that change does not reliably propagate into a genuine CSS layout
    // reflow of `viewport`'s own box on every engine: `viewport` is sized via `h-full`
    // percentage cascaded from the app shell's own `h-dvh` root, which the UA recomputes
    // immediately at the CSS level, but `ResizeObserver` only fires if/when that recomputation
    // actually changes `viewport`'s rendered box — a multi-ancestor percentage chain some real
    // devices do not reflow promptly on a toolbar-only change (owner audit, real Android phone:
    // "Composer - tło nie dosięga" persisted after `635648d9` pinned the overlay to a literal
    // `bottom: 0`, which only ever reads *this* variable for its own max-height, not its
    // position — the live-ness of the variable itself was the remaining gap).
    // `window.visualViewport` is the API purpose-built to report the current, authoritative
    // visible height directly, independent of any element's own layout box; its own `resize`
    // event fires reliably on both toolbar collapse/expand and on-screen-keyboard changes. Read
    // it first when available, and listen to it as a second, more direct trigger alongside the
    // `ResizeObserver` below (kept as the fallback path for environments without it).
    const visualViewport = typeof window === 'undefined' ? undefined : window.visualViewport;
    const updateMetrics = () => {
      const height = visualViewport?.height ?? viewport.clientHeight;
      root.style.setProperty('--mobile-workspace-viewport-height', `${height}px`);
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

    visualViewport?.addEventListener('resize', updateMetrics);
    updateMetrics();

    return () => {
      resizeObserver.disconnect();
      visualViewport?.removeEventListener('resize', updateMetrics);
    };
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
        // No `@container` here (root-caused live on a real phone, owner audit: "nie jest po osi
        // Z tylko pod osią Y" — the mobile Composer read as embedded in normal document flow
        // instead of floating above everything). `container-type` (what the Tailwind `@container`
        // utility sets) carries layout containment, which per the CSS Containment spec makes the
        // element a new containing block for its `position: fixed` descendants too, not only
        // `absolute` ones — so any `fixed` element nested inside this one (the Composer overlay,
        // several layers down through `ScrollArea`/`AppContentScrollProvider`) resolves `fixed`
        // against THIS box instead of the viewport, silently downgrading its "float above
        // everything" behavior to something that tracks this box's own layout instead. Confirmed
        // by grepping every `@container`/`@[...]`/`@sm:`-style container-query consumer in this
        // package: none targets this specific container (the header row a few lines down has its
        // own, separate `@container`, scoped to just that row) — this one had no query depending
        // on it, so removing it is not a behavior change for anything that reads a container query
        // here, only for the `fixed` containing-block side effect it was silently causing.
        'absolute inset-0 min-w-0 overflow-clip outline-none',
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
                aria-labelledby={tabPanelId ? tabPanelLabelledBy : undefined}
                className={cn(
                  workspaceSurfaceClassName,
                  'min-h-0 flex-1 overflow-clip rounded-t-surface border border-b-0 border-workspace-edge',
                )}
                id={tabPanelId}
                role={tabPanelId ? 'tabpanel' : undefined}
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
                      ref={setSheetElement}
                    >
                      <AppContentScrollProvider>
                        <div
                          aria-labelledby={tabPanelId ? tabPanelLabelledBy : undefined}
                          className="min-h-full"
                          id={tabPanelId}
                          role={tabPanelId ? 'tabpanel' : undefined}
                        >
                          {surface.content}
                        </div>
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
  const secondaryTabsScope = `${SECONDARY_TABS_SCOPE_PREFIX}-${useId()}`;
  const { navigationMode } = useAppWorkspace();
  const runtimeSecondary = workspace?.secondary ?? null;
  const defaultSecondary = staticSurfaces.defaultSecondary;
  const defaultSecondaryOpen = defaultSecondary?.open ?? false;
  const secondaryTabsState = workspace?.tabs;
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
          headerVariant: defaultSecondary.headerVariant,
          transition: workspace?.transition,
          onClose: defaultSecondary.onOpenChange
            ? () => defaultSecondary.onOpenChange?.(false)
            : undefined,
        }
      : undefined;
  // The tab whose content is actually rendered, which the strip must mark as selected. Normally
  // `activeTabId`. But when no runtime tab is shown while a runtime id is still active — the
  // runtime region was hidden (`close`, or `back` at a tab root: `isOpen: false`, contract §9.3,
  // which deliberately retains `activeTabId`) — `AppWorkspace` falls back to rendering the
  // declarative pinned Secondary, so the strip used to keep marking the hidden runtime tab as
  // selected above the pinned tab's content (reproduced live: "Historia pracy" selected over
  // Context). The pinned entry is the one `closable: false` tab (contract §3).
  const shownSecondaryTabId =
    secondaryTabsState && !runtimeSecondary && secondaryPresentationBase
      ? (secondaryTabsState.tabs.find((tab) => !tab.closable)?.id ?? secondaryTabsState.activeTabId)
      : (secondaryTabsState?.activeTabId ?? null);
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
    secondaryPresentationBase !== undefined,
    secondaryPresentationBase?.canStack ?? false,
    primaryMaxPx,
    dynamicOpenTabCount,
    secondaryRatio,
    onSecondaryRatioChange,
    workspace?.scopeGeneration ?? 0,
  );
  // The strip is the Secondary header's content whenever 2+ tabs are open (workspace-dynamic-split
  // §4.1), and on a split layout already while the pinned tab is the only one: the pinned tab
  // (Context) is a tab from the start, so opening or closing another tab never swaps a 56px header
  // for the 36px rail under the content (owner: the screen "jumped" when Work opened). Stacked
  // layouts and a lone runtime tab without a pinned one keep `surface` unchanged — their header
  // carries the screen's own Back/Close and identity, which a one-tab rail would drop.
  const hasPinnedSecondaryTab = Boolean(secondaryTabsState?.tabs.some((tab) => !tab.closable));
  const showSecondaryTabStrip = Boolean(
    secondaryTabsState &&
    (secondaryTabsState.tabs.length >= 2 || (state.mode === 'split' && hasPinnedSecondaryTab)),
  );
  const secondaryTabPanelId =
    showSecondaryTabStrip && shownSecondaryTabId
      ? getItemTabPanelId(secondaryTabsScope, shownSecondaryTabId)
      : undefined;
  const secondaryTabPanelLabelledBy =
    showSecondaryTabStrip && shownSecondaryTabId
      ? getItemTabId(secondaryTabsScope, shownSecondaryTabId)
      : undefined;
  // The shown Secondary's scroll identity: the shown tab and the stack entry on top of it (the
  // declarative pinned surface has no stack, so its one entry is `root`).
  const secondaryScrollMemoryKey = shownSecondaryTabId
    ? secondaryScrollKey(shownSecondaryTabId, runtimeSecondary?.instanceKey ?? 'root')
    : undefined;
  const secondaryPresentation: WorkspaceSecondaryPresentation | undefined =
    secondaryPresentationBase && showSecondaryTabStrip && workspace && secondaryTabsState
      ? {
          ...secondaryPresentationBase,
          surface: withSecondaryTabStrip(
            secondaryPresentationBase.surface,
            secondaryTabsState,
            shownSecondaryTabId,
            workspace.activateTab,
            workspace.closeTab,
            secondaryTabsScope,
            // Split: the compact root-tab rail. Stacked keeps its 56px header (mobile unchanged).
            state.mode === 'split' ? 'rail' : 'header',
            labelsProp?.secondaryTabs,
          ),
        }
      : secondaryPresentationBase;
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
  // Primary's own ambient sheet element (see `WorkspacePrimarySheetContext`) — same ownership
  // reasoning as `primaryScrollElement` above, and deliberately a separate piece of state from it
  // (a different DOM node, see that context's own doc comment).
  const [primarySheetElement, setPrimarySheetElement] = useState<HTMLElement | null>(null);
  // The layout this render resolved, published for Primary content (`useWorkspaceLayout`). Ambient
  // scroll exists exactly when the stacked layout wraps Primary in the workspace `ScrollArea`.
  const workspaceLayoutMode = state.mode;
  const primaryScrollOwner: WorkspaceLayout['primaryScrollOwner'] =
    workspaceLayoutMode === 'stacked' && scroll === 'workspace' ? 'ambient' : 'local';
  const workspaceLayout = useMemo<WorkspaceLayout>(
    () => ({ mode: workspaceLayoutMode, primaryScrollOwner }),
    [workspaceLayoutMode, primaryScrollOwner],
  );
  const labels = { ...defaultAppWorkspaceLabels, ...labelsProp };
  const primaryNavigationAction =
    navigationMode === 'drawer' ? <NavigationAction label={labels.openNavigation} /> : undefined;
  // Split layout: Back pops the active tab's own local stack (`canGoBack`) — full-session-screen-
  // structure.md §10.1 "Back pops inside the active tab before returning to its root". At a tab
  // root with the root-tab strip shown there is nothing local to pop: the strip owns switching
  // between roots and Close owns closing, so a root-level Back only duplicated those (it hid the
  // runtime region, revealing the pinned tab) — the redundant desktop "←" the owner flagged. It
  // also cost the header ~44px, flipping the strip to its switcher on one tab but not another.
  // A single runtime flow without a strip keeps its existing root-level Back unchanged; local depth
  // with the strip shown is the breadcrumb row below.
  const splitWithStrip = state.mode === 'split' && showSecondaryTabStrip;
  // The rail header: the root-tab strip, or a declarative Secondary whose own header is a rail strip
  // (Documents). Only the root-tab strip owns the Back/local-navigation behaviour above.
  const splitRailHeader =
    splitWithStrip ||
    (state.mode === 'split' && secondaryPresentation?.headerVariant === 'tab-rail');
  const secondaryBackAction =
    secondaryPresentation?.onBack &&
    !splitWithStrip &&
    (state.mode === 'stacked' ||
      workspace?.canGoBack ||
      (state.mode === 'split' && secondaryPresentation.canStack)) ? (
      <BackAction label={labels.backToPrimary} onBack={secondaryPresentation.onBack} />
    ) : undefined;
  // Split + tab strip: local depth is one row at the top of the tab panel, never a header Back —
  // the tab keeps its root's name in the rail, whose height never changes with depth. By default
  // it is the detail header row (`SecondaryDetailHeaderRow`: `←` Back to the parent, then the
  // screen's declared header); a stack whose levels are each worth jumping to opts into the full trail (`localNavigation: 'breadcrumbs'`, `SecondaryBreadcrumbRow`). Never on a
  // stacked layout, which keeps its header Back (mobile has its own navigation).
  const secondaryTrail = workspace?.trail ?? [];
  const secondaryParentTitle = secondaryTrail.at(-2)?.title;
  const backToParentLabel = (parentTitle: string) =>
    labels.backToParent?.(parentTitle) ?? `${labels.backToPrimary}: ${parentTitle}`;
  const secondaryOnBack = secondaryPresentation?.onBack;
  let secondaryLocalNavigationRow: ReactNode;
  let detailHeaderHosted = false;
  if (
    splitWithStrip &&
    runtimeSecondary &&
    workspace &&
    secondaryParentTitle !== undefined &&
    secondaryOnBack
  ) {
    if (workspace.localNavigation === 'breadcrumbs') {
      secondaryLocalNavigationRow = (
        <SecondaryBreadcrumbRow
          labels={{
            navigation: labels.secondaryBreadcrumbs?.navigation ?? 'Panel location',
            collapsed: labels.secondaryBreadcrumbs?.collapsed ?? 'Show hidden levels',
            back: backToParentLabel,
          }}
          onBack={secondaryOnBack}
          onBackTo={workspace.backTo}
          trail={secondaryTrail}
        />
      );
    } else {
      detailHeaderHosted = true;
      secondaryLocalNavigationRow = (
        <SecondaryDetailHeaderRow
          backLabel={backToParentLabel(secondaryParentTitle)}
          onBack={secondaryOnBack}
        >
          {secondaryPresentation.surface.detailHeader}
        </SecondaryDetailHeaderRow>
      );
    }
  }

  const hideClose = state.mode === 'stacked' && stackedSecondaryClose === 'hide';
  // With the tab strip shown each closable tab owns its own close; a second panel-level `x` beside
  // them was ambiguous (which one closes what), so it is not rendered. A lone surface keeps it.
  const secondaryCloseAction =
    secondaryPresentation?.onClose && !hideClose && !splitRailHeader ? (
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
      onSheetElementChange={setPrimarySheetElement}
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
        contentNavigation={secondaryLocalNavigationRow}
        headerVariant={splitRailHeader ? 'tab-rail' : 'header'}
        detailHeaderHosted={detailHeaderHosted}
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
        scrollMemoryKey={secondaryScrollMemoryKey}
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
    <WorkspaceLayoutContext.Provider value={workspaceLayout}>
      <WorkspacePrimaryScrollContext.Provider value={primaryScrollElement}>
        <WorkspacePrimarySheetContext.Provider value={primarySheetElement}>
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
        </WorkspacePrimarySheetContext.Provider>
      </WorkspacePrimaryScrollContext.Provider>
    </WorkspaceLayoutContext.Provider>
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

export const APP_NAVIGATION_WIDTH = 260;
export const APP_SHELL_GAP = 8;
/** One edge border of the shell-owned workspace surface (`border-l`, plus `border-r` when inset). */
export const APP_WORKSPACE_EDGE_BORDER = 1;
export const APP_NAVIGATION_INLINE_PADDING = 16;
/** Header frames narrower than this (measured, px) show one direct action instead of two (= Tailwind @sm). */
export const WORKSPACE_HEADER_NARROW_MAX_WIDTH = 384;
export const WORKSPACE_SPLIT_MIN_WIDTH = 840;
export const WORKSPACE_WIDE_DOMINANCE_MIN_WIDTH = 1080;
export const WIDE_SHELL_MIN_WIDTH =
  WORKSPACE_SPLIT_MIN_WIDTH + APP_NAVIGATION_WIDTH + APP_SHELL_GAP;

/**
 * Width the workspace content may fill: the surface's border-box width minus its edge borders.
 * `availableWidth` (border-box) keeps deciding mode and thresholds; slot sizes must come from this
 * content width, otherwise primary + secondary exceed the surface's content box by the border width
 * and the clipped group cuts off the last pixel of the right-most region.
 */
export function resolveWorkspaceContentWidth(
  availableWidth: number | undefined,
  { bordered, inset }: { bordered: boolean; inset: boolean },
): number | undefined {
  if (availableWidth === undefined || !bordered) {
    return availableWidth;
  }

  return Math.max(0, availableWidth - APP_WORKSPACE_EDGE_BORDER * (inset ? 2 : 1));
}

export function supportsWorkspaceSplit(availableWidth: number | undefined) {
  return availableWidth !== undefined && availableWidth >= WORKSPACE_SPLIT_MIN_WIDTH;
}

export function supportsRuntimeWorkspaceSplit(availableWidth: number | undefined) {
  return supportsWorkspaceSplit(availableWidth);
}

export type AppWorkspaceSplitMode = 'primary' | 'balanced' | 'secondary' | 'dynamic';

/**
 * The subset of `AppWorkspaceSplitMode` with a fixed Primary/Secondary percentage split.
 * `'dynamic'` is resolved by `resolveDynamicWorkspaceSplit` instead — it has no fixed percentage,
 * so it is deliberately excluded from `resolveWorkspaceSplit`'s own input type rather than given a
 * placeholder entry in `WIDE_WORKSPACE_SPLITS`/`MEDIUM_WORKSPACE_SPLITS`.
 */
export type FixedAppWorkspaceSplitMode = Exclude<AppWorkspaceSplitMode, 'dynamic'>;

export type AppWorkspaceShare = number;

/** Public `AppWorkspace` sizing policy; see `AppWorkspaceProps['fit']`. */
export type AppWorkspaceFit = 'content' | 'available' | 'bounded';

/**
 * Resolves the rendered workspace fit. `content` makes the workspace `max-content` wide so the
 * shell centres navigation and workspace together; `available` fills the measured width.
 * Stacked layouts always fill, and so does a `bounded` workspace while the navigation is a drawer:
 * there is nothing to centre it with, and a content-wide surface would leave a bare strip beside
 * it (the bounded content centres itself inside instead).
 */
export function resolveWorkspaceFit(
  fit: AppWorkspaceFit,
  mode: 'split' | 'stacked',
  showSecondary: boolean,
  navigationMode: 'persistent' | 'drawer' = 'persistent',
): 'content' | 'available' {
  if (mode === 'stacked' || fit === 'available') {
    return 'available';
  }

  if (fit === 'bounded') {
    return navigationMode === 'drawer' ? 'available' : 'content';
  }

  return showSecondary ? 'content' : 'available';
}

export interface AppWorkspaceSplit {
  primary: AppWorkspaceShare;
  secondary: AppWorkspaceShare;
}

export interface AppWorkspacePixelSplit {
  primary: number;
  secondary?: number;
}

const WIDE_WORKSPACE_SPLITS: Record<FixedAppWorkspaceSplitMode, AppWorkspaceSplit> = {
  primary: { primary: 75, secondary: 25 },
  balanced: { primary: 50, secondary: 50 },
  secondary: { primary: 25, secondary: 75 },
};

const MEDIUM_WORKSPACE_SPLITS: Record<FixedAppWorkspaceSplitMode, AppWorkspaceSplit> = {
  primary: { primary: (2 / 3) * 100, secondary: (1 / 3) * 100 },
  balanced: { primary: 50, secondary: 50 },
  secondary: { primary: (1 / 3) * 100, secondary: (2 / 3) * 100 },
};

export function resolveWorkspaceSplit(
  split: FixedAppWorkspaceSplitMode,
  hasSecondary: boolean,
  availableWidth?: number,
): AppWorkspaceSplit {
  if (!hasSecondary) {
    return { primary: 100, secondary: 0 };
  }

  const splits =
    availableWidth !== undefined && availableWidth < WORKSPACE_WIDE_DOMINANCE_MIN_WIDTH
      ? MEDIUM_WORKSPACE_SPLITS
      : WIDE_WORKSPACE_SPLITS;

  return splits[split];
}

export function resolveSlotMaxWidth(
  availableWidth: number | undefined,
  share: AppWorkspaceShare,
): number | undefined {
  return availableWidth === undefined ? undefined : availableWidth * (share / 100);
}

/**
 * Opt-in pixel cap of Primary (`AppWorkspace primaryMaxPx`): Primary is its share of the split but
 * never wider than the cap, and Secondary takes the rest of the content width. Below the cap, without
 * a cap or without Secondary (stacked, Primary only) the widths are returned unchanged.
 */
export function capPrimaryWidth(
  contentWidth: number | undefined,
  widths: { primary?: number; secondary?: number },
  cap: number | undefined,
): { primary?: number; secondary?: number } {
  if (
    cap === undefined ||
    contentWidth === undefined ||
    widths.primary === undefined ||
    widths.secondary === undefined ||
    widths.primary <= cap
  ) {
    return widths;
  }

  return { primary: cap, secondary: Math.max(0, contentWidth - cap) };
}

export function resolveWorkspacePixelSplit(
  availableWidth: number,
  split: FixedAppWorkspaceSplitMode,
  hasSecondary: boolean,
): AppWorkspacePixelSplit {
  const resolvedSplit = resolveWorkspaceSplit(split, hasSecondary, availableWidth);

  return {
    primary: resolveSlotMaxWidth(availableWidth, resolvedSplit.primary)!,
    ...(resolvedSplit.secondary === 0
      ? {}
      : { secondary: resolveSlotMaxWidth(availableWidth, resolvedSplit.secondary)! }),
  };
}

/**
 * Minimum viable Primary/Secondary pane widths for `split="dynamic"` (contract
 * workspace-dynamic-split.md §4.2). Tunable defaults, not frozen contracts: "Minimum widths must
 * allow real Conversation and Composer usage, not be picked just to reproduce the screenshot"
 * (session-chat-v10-design.md §7.2). `WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH` doubles as the narrow
 * auto-mode default (≈330px, same source) — with only one tab open the auto ratio is already as
 * small as the layout allows, so "narrow default" and "Secondary's minimum" are the same value.
 * Both stay comfortably below the existing `WORKSPACE_SPLIT_MIN_WIDTH` (840px) on purpose, with
 * enough margin for the 50/50 auto ratio itself to fit unclamped at that width too: a
 * `split="dynamic"` workspace must still be able to split, at a sensible ratio, at every width the
 * fixed `primary`/`balanced`/`secondary` presets already do (the same representative widths
 * `AppWorkspaceFit.contract.stories.tsx` and `AppWorkspaceDynamicSplit.contract.stories.tsx` use).
 */
export const WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH = 330;
/** See `WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH`: same tunable-default status. */
export const WORKSPACE_DYNAMIC_PRIMARY_MIN_WIDTH = 400;

/**
 * `WorkspaceSplitter`'s keyboard step (contract §7: "Left/Right arrow adjust the ratio by a fixed
 * step (for example 24px-equivalent)"). A tunable default, same status as the two constants above.
 */
export const WORKSPACE_SPLITTER_KEYBOARD_STEP_PX = 24;

/** The valid `secondaryRatio` range for `availableWidth` (contract §4.2), shared by the resolver below and by `AppWorkspace`'s `WorkspaceSplitter` wiring (Home/End, §7). */
export interface DynamicSplitRatioBounds {
  min: number;
  max: number;
}

/**
 * Pure bounds computation, factored out of `resolveDynamicWorkspaceSplit` so `WorkspaceSplitter`'s
 * keyboard Home/End (contract §7) and the resolver's own clamping read the exact same range instead
 * of two independent reimplementations. Only meaningful when `availableWidth` can fit both dynamic
 * minimums at all (the caller already knows this from `resolveDynamicWorkspaceSplit`'s own `fits`
 * check, or the equivalent `availableWidth >= WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH +
 * WORKSPACE_DYNAMIC_PRIMARY_MIN_WIDTH` test).
 */
export function resolveDynamicSplitRatioBounds(availableWidth: number): DynamicSplitRatioBounds {
  return {
    min: WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH / availableWidth,
    max: 1 - WORKSPACE_DYNAMIC_PRIMARY_MIN_WIDTH / availableWidth,
  };
}

/**
 * Pure input to `resolveDynamicWorkspaceSplit` (contract §4.2). Exactly these five fields —
 * deliberately no active-tab id, no local-stack/page identity or depth, and no Session/product
 * event field. This is the structural enforcement of contract §6's non-goals: there is no field
 * through which active tab content, dependent-detail depth, or a live product event could reach
 * this function. `openTabCount` is the only tab-shaped input, never an identity.
 */
export interface DynamicSplitInput {
  availableWidth: number | undefined;
  /**
   * `tabs.tabs.length` (contract §4.1): pinned tab (if present) + legacy `open()` slot (if
   * present) + `openTab()` entries. A workspace with no pinned tab and nothing opened has
   * `openTabCount` 0, in which case the result is moot — `AppWorkspace` does not render Secondary
   * at all (§4.1, §9 item 2).
   */
  openTabCount: number;
  mode: 'auto' | 'manual';
  /** Secondary's share, 0-1, when `mode` is `'manual'`. */
  manualRatio: number | null;
  /**
   * The previous render's `openTabCount`, to tell "a tab was just opened" apart from
   * "switched/closed" (contract §5).
   */
  previousOpenTabCount: number;
}

export interface DynamicWorkspaceSplitResult {
  layout: 'split' | 'stacked';
  secondaryRatio: number;
  mode: 'auto' | 'manual';
}

function clampRatio(value: number, min: number, max: number): number {
  // An invalid range (min > max) means the width cannot fit both minimums at all; the caller has
  // already turned that into `layout: 'stacked'` and only keeps this value as opaque state, so
  // clamping it would discard information needed to restore it later (contract §5).
  return min > max ? value : Math.min(Math.max(value, min), max);
}

/**
 * Auto mode's ratio (contract §5): the narrow default while at most one tab is open, 50/50 once a
 * second tab exists. `previousOpenTabCount` only distinguishes *why* the 2+-tab branch is being
 * evaluated (a brand-new tab's one-time switch vs. a steady-state re-resolve for replace-in-place,
 * `activateTab`, or closing down to 2+ tabs) — both must report the same 50/50, which is what makes
 * the steady-state case a genuine "no resize".
 */
function resolveAutoSecondaryRatio(
  openTabCount: number,
  previousOpenTabCount: number,
  availableWidth: number | undefined,
): number {
  if (openTabCount <= 1) {
    return availableWidth === undefined || availableWidth <= 0
      ? 0.5
      : WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH / availableWidth;
  }

  if (openTabCount > previousOpenTabCount) {
    // A brand-new tab just appeared (`openTab()`'s new-instance case, or `open()` creating its
    // slot for the first time): one-time switch to 50/50.
    return 0.5;
  }

  // Steady-state re-resolve for an unchanged, or still-2+, tab count (replace-in-place via
  // `open()`, `activateTab`, or closing down to 2+ tabs): no resize — already 50/50.
  return 0.5;
}

/**
 * Pure auto/manual sizing resolver for `split="dynamic"` (contract §4.2), parallel to
 * `resolveWorkspaceSplit`/`resolveWorkspaceFit`/`capPrimaryWidth`. Fully specified by the
 * transition table in contract §5 — see `workspaceSizing.test.ts` for one test per row.
 */
export function resolveDynamicWorkspaceSplit(
  input: DynamicSplitInput,
): DynamicWorkspaceSplitResult {
  const { availableWidth, openTabCount, mode, manualRatio, previousOpenTabCount } = input;

  const rawRatio =
    mode === 'manual' && manualRatio !== null
      ? manualRatio
      : resolveAutoSecondaryRatio(openTabCount, previousOpenTabCount, availableWidth);

  const fits =
    availableWidth !== undefined &&
    availableWidth >= WORKSPACE_DYNAMIC_SECONDARY_MIN_WIDTH + WORKSPACE_DYNAMIC_PRIMARY_MIN_WIDTH;

  if (!fits) {
    // Preserved unrendered, not discarded ("width drops below the fit threshold", contract §5):
    // the caller falls back to the existing stacked/narrow path via the existing
    // `supportsRuntimeWorkspaceSplit`/`state.mode === 'stacked'` path and keeps `mode`/this value
    // as opaque "last known" state so a later width increase can restore it.
    return { layout: 'stacked', secondaryRatio: rawRatio, mode };
  }

  const bounds = resolveDynamicSplitRatioBounds(availableWidth);

  return {
    layout: 'split',
    secondaryRatio: clampRatio(rawRatio, bounds.min, bounds.max),
    mode,
  };
}

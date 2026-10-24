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
  if (availableWidth === undefined || !bordered) return availableWidth;
  return Math.max(0, availableWidth - APP_WORKSPACE_EDGE_BORDER * (inset ? 2 : 1));
}

export function supportsWorkspaceSplit(availableWidth: number | undefined) {
  return availableWidth !== undefined && availableWidth >= WORKSPACE_SPLIT_MIN_WIDTH;
}

export function supportsRuntimeWorkspaceSplit(availableWidth: number | undefined) {
  return supportsWorkspaceSplit(availableWidth);
}

export type AppWorkspaceSplitMode = 'primary' | 'balanced' | 'secondary';

export type AppWorkspaceShare = number;

/** Public `AppWorkspace` sizing policy; see `AppWorkspaceProps['fit']`. */
export type AppWorkspaceFit = 'content' | 'available' | 'bounded';

/**
 * Resolves the rendered workspace fit. `content` makes the workspace `max-content` wide so the
 * shell centres navigation and workspace together; `available` fills the measured width.
 * Stacked layouts always fill.
 */
export function resolveWorkspaceFit(
  fit: AppWorkspaceFit,
  mode: 'split' | 'stacked',
  showSecondary: boolean,
): 'content' | 'available' {
  if (mode === 'stacked' || fit === 'available') return 'available';
  if (fit === 'bounded') return 'content';
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

const WIDE_WORKSPACE_SPLITS: Record<AppWorkspaceSplitMode, AppWorkspaceSplit> = {
  primary: { primary: 75, secondary: 25 },
  balanced: { primary: 50, secondary: 50 },
  secondary: { primary: 25, secondary: 75 },
};

const MEDIUM_WORKSPACE_SPLITS: Record<AppWorkspaceSplitMode, AppWorkspaceSplit> = {
  primary: { primary: (2 / 3) * 100, secondary: (1 / 3) * 100 },
  balanced: { primary: 50, secondary: 50 },
  secondary: { primary: (1 / 3) * 100, secondary: (2 / 3) * 100 },
};

export function resolveWorkspaceSplit(
  split: AppWorkspaceSplitMode,
  hasSecondary: boolean,
  availableWidth?: number,
): AppWorkspaceSplit {
  if (!hasSecondary) return { primary: 100, secondary: 0 };
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
  )
    return widths;
  return { primary: cap, secondary: Math.max(0, contentWidth - cap) };
}

export function resolveWorkspacePixelSplit(
  availableWidth: number,
  split: AppWorkspaceSplitMode,
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

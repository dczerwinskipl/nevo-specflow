export const APP_NAVIGATION_WIDTH = 260;
export const APP_SHELL_GAP = 16;
export const WORKSPACE_SPLIT_MIN_WIDTH = 840;
export const WORKSPACE_WIDE_DOMINANCE_MIN_WIDTH = 1080;
export const WIDE_SHELL_MIN_WIDTH = WORKSPACE_SPLIT_MIN_WIDTH + APP_NAVIGATION_WIDTH + APP_SHELL_GAP;
export function supportsWorkspaceSplit(availableWidth) {
    return availableWidth !== undefined && availableWidth >= WORKSPACE_SPLIT_MIN_WIDTH;
}
export function supportsRuntimeWorkspaceSplit(availableWidth, navigationMode) {
    return navigationMode === 'persistent' && supportsWorkspaceSplit(availableWidth);
}
const WIDE_WORKSPACE_SPLITS = {
    primary: { primary: 75, secondary: 25 },
    balanced: { primary: 50, secondary: 50 },
    secondary: { primary: 25, secondary: 75 },
};
const MEDIUM_WORKSPACE_SPLITS = {
    primary: { primary: (2 / 3) * 100, secondary: (1 / 3) * 100 },
    balanced: { primary: 50, secondary: 50 },
    secondary: { primary: (1 / 3) * 100, secondary: (2 / 3) * 100 },
};
export function resolveWorkspaceSplit(split, hasSecondary, availableWidth) {
    if (!hasSecondary)
        return { primary: 100, secondary: 0 };
    const splits = availableWidth !== undefined && availableWidth < WORKSPACE_WIDE_DOMINANCE_MIN_WIDTH
        ? MEDIUM_WORKSPACE_SPLITS
        : WIDE_WORKSPACE_SPLITS;
    return splits[split];
}
export function resolveSlotMaxWidth(availableWidth, share) {
    return availableWidth === undefined ? undefined : availableWidth * (share / 100);
}
export function resolveWorkspacePixelSplit(availableWidth, split, hasSecondary) {
    const resolvedSplit = resolveWorkspaceSplit(split, hasSecondary, availableWidth);
    return {
        primary: resolveSlotMaxWidth(availableWidth, resolvedSplit.primary),
        ...(resolvedSplit.secondary === 0
            ? {}
            : { secondary: resolveSlotMaxWidth(availableWidth, resolvedSplit.secondary) }),
    };
}
//# sourceMappingURL=workspaceSizing.js.map
export declare const APP_NAVIGATION_WIDTH = 260;
export declare const APP_SHELL_GAP = 16;
export declare const WORKSPACE_SPLIT_MIN_WIDTH = 840;
export declare const WORKSPACE_WIDE_DOMINANCE_MIN_WIDTH = 1080;
export declare const WIDE_SHELL_MIN_WIDTH: number;
export declare function supportsWorkspaceSplit(availableWidth: number | undefined): boolean;
export declare function supportsRuntimeWorkspaceSplit(availableWidth: number | undefined, navigationMode: 'persistent' | 'drawer'): boolean;
export type AppWorkspaceSplitMode = 'primary' | 'balanced' | 'secondary';
export type AppWorkspaceShare = number;
export type AppWorkspaceSplit = {
    primary: AppWorkspaceShare;
    secondary: AppWorkspaceShare | 0;
};
export type AppWorkspacePixelSplit = {
    primary: number;
    secondary?: number;
};
export declare function resolveWorkspaceSplit(split: AppWorkspaceSplitMode, hasSecondary: boolean, availableWidth?: number): AppWorkspaceSplit;
export declare function resolveSlotMaxWidth(availableWidth: number | undefined, share: AppWorkspaceShare): number | undefined;
export declare function resolveWorkspacePixelSplit(availableWidth: number, split: AppWorkspaceSplitMode, hasSecondary: boolean): AppWorkspacePixelSplit;
//# sourceMappingURL=workspaceSizing.d.ts.map
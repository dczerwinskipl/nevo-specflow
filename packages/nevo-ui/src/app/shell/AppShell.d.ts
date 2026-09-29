import { type HTMLAttributes, type ReactNode } from 'react';
export type AppNavigationMode = 'persistent' | 'drawer';
type AppWorkspaceContextValue = {
    availableWidth?: number;
    navigationMode: AppNavigationMode;
};
export declare function useAppWorkspace(): AppWorkspaceContextValue;
type AppNavigationContextValue = {
    closeNavigation: () => void;
};
export declare function useAppNavigation(): AppNavigationContextValue;
export interface AppShellProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
    brandPrimary?: string;
    navigation: ReactNode;
    children: ReactNode;
    labels?: Partial<AppShellLabels>;
}
export interface AppShellLabels {
    closeNavigation: string;
    navigationTitle: string;
}
export declare function resolveAppShellLayout(width: number | undefined): {
    availableWidth: number | undefined;
    navigationMode: "persistent" | "drawer";
    workspaceMaterialOwner: "shell" | "panel";
    wide: boolean;
};
export declare function AppShell({ brandPrimary, navigation, children, className, labels: labelsProp, style, ...props }: AppShellProps): import("react/jsx-runtime").JSX.Element;
export {};
//# sourceMappingURL=AppShell.d.ts.map
import { type PropsWithChildren } from 'react';
import type { AppWorkspaceSurface } from './workspaceSurface';
export type WorkspaceSecondaryOptions = {
    beforeClose?: () => boolean | Promise<boolean>;
    onClose?: () => void;
};
export type WorkspaceSecondaryState = {
    surface: AppWorkspaceSurface;
    instanceKey: number;
};
export type WorkspaceTransition = {
    action: 'push' | 'pop' | 'replace' | 'close';
    revision: number;
};
export type WorkspaceContextValue = {
    secondary: WorkspaceSecondaryState | null;
    secondaryStack: readonly WorkspaceSecondaryState[];
    secondaryDepth: number;
    canGoBack: boolean;
    transition: WorkspaceTransition;
    setSecondary: (surface: AppWorkspaceSurface, options?: WorkspaceSecondaryOptions) => Promise<boolean>;
    pushSecondary: (surface: AppWorkspaceSurface, options?: WorkspaceSecondaryOptions) => Promise<boolean>;
    popSecondary: () => Promise<boolean>;
    closeSecondary: () => Promise<boolean>;
};
export declare function AppWorkspaceProvider({ children }: PropsWithChildren): import("react/jsx-runtime").JSX.Element;
export declare function useWorkspace(): WorkspaceContextValue;
export declare function useOptionalWorkspace(): WorkspaceContextValue | null;
//# sourceMappingURL=WorkspaceContext.d.ts.map
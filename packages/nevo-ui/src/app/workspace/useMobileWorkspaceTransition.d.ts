import { type AnimationEvent } from 'react';
import type { WorkspaceTransition } from './WorkspaceContext';
import { type WorkspacePresentationTransition, type WorkspacePresentationTarget } from './workspaceTransition';
export type MobileWorkspaceSurfaceRuntime = {
    surface: WorkspacePresentationTarget;
    instanceKey: string;
    mounted: boolean;
    visible: boolean;
    active: boolean;
    interactive: boolean;
    motion: WorkspacePresentationTransition;
};
export type MobileWorkspaceRuntime = {
    primary: MobileWorkspaceSurfaceRuntime;
    secondary: MobileWorkspaceSurfaceRuntime;
};
type ResolveMobileWorkspaceRuntimeOptions = {
    secondaryInstanceKey?: string;
    transition?: WorkspaceTransition;
    completedTransitionRevision?: number;
};
export declare function resolveMobileWorkspaceRuntime({ secondaryInstanceKey, transition, completedTransitionRevision, }: ResolveMobileWorkspaceRuntimeOptions): MobileWorkspaceRuntime;
export declare function workspaceSurfaceRuntimeAttributes(runtime: MobileWorkspaceSurfaceRuntime): {
    readonly 'data-workspace-surface': WorkspacePresentationTarget;
    readonly 'data-workspace-instance': string;
    readonly 'data-workspace-active': string;
    readonly 'data-workspace-motion': "idle" | "entering" | "exiting";
    readonly 'data-workspace-direction': import("./workspaceTransition").WorkspacePresentationDirection | undefined;
};
export declare function useMobileWorkspaceTransition({ secondaryInstanceKey, transition, }: Omit<ResolveMobileWorkspaceRuntimeOptions, 'completedTransitionRevision'>): {
    completeMotion: (event: AnimationEvent<HTMLElement>) => void;
    primary: MobileWorkspaceSurfaceRuntime;
    secondary: MobileWorkspaceSurfaceRuntime;
};
export {};
//# sourceMappingURL=useMobileWorkspaceTransition.d.ts.map
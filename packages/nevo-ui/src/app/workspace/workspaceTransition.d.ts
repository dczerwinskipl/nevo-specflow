import type { WorkspaceTransition } from './WorkspaceContext';
export type WorkspacePresentationPhase = 'idle' | 'entering' | 'exiting';
export type WorkspacePresentationDirection = 'forward' | 'backward';
export type WorkspacePresentationTarget = 'primary' | 'secondary';
export type WorkspacePresentationTransition = {
    phase: 'idle';
} | {
    phase: Exclude<WorkspacePresentationPhase, 'idle'>;
    direction: WorkspacePresentationDirection;
    target: WorkspacePresentationTarget;
};
export declare const idleWorkspacePresentationTransition: WorkspacePresentationTransition;
/**
 * WorkspaceContext navigation -> this semantic presentation intent -> runtime surface lifecycle
 * -> AppWorkspace.css physical motion.
 */
export declare function resolveWorkspacePresentationTransition(transition?: WorkspaceTransition): WorkspacePresentationTransition;
export declare function resolveWorkspaceSurfaceTransition(surface: WorkspacePresentationTarget, transition: WorkspacePresentationTransition): WorkspacePresentationTransition;
//# sourceMappingURL=workspaceTransition.d.ts.map
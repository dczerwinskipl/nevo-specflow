export const idleWorkspacePresentationTransition = {
    phase: 'idle',
};
/**
 * WorkspaceContext navigation -> this semantic presentation intent -> runtime surface lifecycle
 * -> AppWorkspace.css physical motion.
 */
export function resolveWorkspacePresentationTransition(transition) {
    if (transition?.action === 'push') {
        return {
            phase: 'entering',
            direction: 'forward',
            target: 'secondary',
        };
    }
    // The current product behavior reveals pop/replace/close immediately. Future exit behavior
    // belongs here; the runtime already exposes animation completion without duration timers.
    return idleWorkspacePresentationTransition;
}
export function resolveWorkspaceSurfaceTransition(surface, transition) {
    return transition.phase !== 'idle' && transition.target === surface
        ? transition
        : idleWorkspacePresentationTransition;
}
//# sourceMappingURL=workspaceTransition.js.map
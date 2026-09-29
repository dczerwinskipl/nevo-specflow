import { useCallback, useState } from 'react';
import { idleWorkspacePresentationTransition, resolveWorkspacePresentationTransition, resolveWorkspaceSurfaceTransition, } from './workspaceTransition';
export function resolveMobileWorkspaceRuntime({ secondaryInstanceKey, transition, completedTransitionRevision, }) {
    const hasSecondary = secondaryInstanceKey !== undefined;
    const presentationTransition = transition?.revision === completedTransitionRevision
        ? idleWorkspacePresentationTransition
        : resolveWorkspacePresentationTransition(transition);
    const secondaryMotion = resolveWorkspaceSurfaceTransition('secondary', presentationTransition);
    const keepPrimaryPainted = secondaryMotion.phase === 'entering';
    return {
        primary: {
            surface: 'primary',
            instanceKey: 'primary',
            mounted: true,
            visible: !hasSecondary || keepPrimaryPainted,
            active: !hasSecondary,
            interactive: !hasSecondary,
            motion: resolveWorkspaceSurfaceTransition('primary', presentationTransition),
        },
        secondary: {
            surface: 'secondary',
            instanceKey: secondaryInstanceKey ?? 'secondary-absent',
            mounted: hasSecondary,
            visible: hasSecondary,
            active: hasSecondary,
            interactive: hasSecondary,
            motion: secondaryMotion,
        },
    };
}
export function workspaceSurfaceRuntimeAttributes(runtime) {
    return {
        'data-workspace-surface': runtime.surface,
        'data-workspace-instance': runtime.instanceKey,
        'data-workspace-active': String(runtime.active),
        'data-workspace-motion': runtime.motion.phase,
        'data-workspace-direction': runtime.motion.phase === 'idle' ? undefined : runtime.motion.direction,
    };
}
export function useMobileWorkspaceTransition({ secondaryInstanceKey, transition, }) {
    const [completedTransitionRevision, setCompletedTransitionRevision] = useState();
    const runtime = resolveMobileWorkspaceRuntime({
        secondaryInstanceKey,
        transition,
        completedTransitionRevision,
    });
    const completeMotion = useCallback((event) => {
        if (event.currentTarget !== event.target || !transition)
            return;
        setCompletedTransitionRevision(transition.revision);
    }, [transition]);
    return { ...runtime, completeMotion };
}
//# sourceMappingURL=useMobileWorkspaceTransition.js.map
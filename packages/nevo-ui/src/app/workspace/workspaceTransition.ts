import type { WorkspaceTransition } from './WorkspaceContext';

export type WorkspacePresentationPhase = 'idle' | 'entering' | 'exiting';
export type WorkspacePresentationDirection = 'forward' | 'backward';
export type WorkspacePresentationTarget = 'primary' | 'secondary';

export type WorkspacePresentationTransition =
  | { phase: 'idle' }
  | {
      phase: Exclude<WorkspacePresentationPhase, 'idle'>;
      direction: WorkspacePresentationDirection;
      target: WorkspacePresentationTarget;
    };

export const idleWorkspacePresentationTransition: WorkspacePresentationTransition = {
  phase: 'idle',
};

/**
 * WorkspaceContext navigation -> this semantic presentation intent -> runtime surface lifecycle
 * -> AppWorkspace.css physical motion.
 */
export function resolveWorkspacePresentationTransition(
  transition?: WorkspaceTransition,
): WorkspacePresentationTransition {
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

export function resolveWorkspaceSurfaceTransition(
  surface: WorkspacePresentationTarget,
  transition: WorkspacePresentationTransition,
): WorkspacePresentationTransition {
  return transition.phase !== 'idle' && transition.target === surface
    ? transition
    : idleWorkspacePresentationTransition;
}


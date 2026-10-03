import type { WorkspaceTransition } from './WorkspaceContext';

export type WorkspacePresentationPhase = 'idle' | 'entering' | 'exiting';
export type WorkspacePresentationDirection = 'forward' | 'backward';
export type WorkspacePresentationTarget = 'incoming' | 'outgoing';

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
      target: 'incoming',
    };
  }

  if (
    transition?.outgoing &&
    (transition.action === 'pop' ||
      transition.action === 'replace' ||
      transition.action === 'close')
  ) {
    return {
      phase: 'exiting',
      direction: 'backward',
      target: 'outgoing',
    };
  }

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

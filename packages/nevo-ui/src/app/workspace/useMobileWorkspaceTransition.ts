import { useCallback, useState, type AnimationEvent } from 'react';

import type { WorkspaceTransition } from './WorkspaceContext';
import {
  idleWorkspacePresentationTransition,
  resolveWorkspacePresentationTransition,
  resolveWorkspaceSurfaceTransition,
  type WorkspacePresentationTransition,
  type WorkspacePresentationTarget,
} from './workspaceTransition';

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

export function resolveMobileWorkspaceRuntime({
  secondaryInstanceKey,
  transition,
  completedTransitionRevision,
}: ResolveMobileWorkspaceRuntimeOptions): MobileWorkspaceRuntime {
  const hasSecondary = secondaryInstanceKey !== undefined;
  const presentationTransition =
    transition?.revision === completedTransitionRevision
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

export function workspaceSurfaceRuntimeAttributes(runtime: MobileWorkspaceSurfaceRuntime) {
  return {
    'data-workspace-surface': runtime.surface,
    'data-workspace-instance': runtime.instanceKey,
    'data-workspace-active': String(runtime.active),
    'data-workspace-motion': runtime.motion.phase,
    'data-workspace-direction':
      runtime.motion.phase === 'idle' ? undefined : runtime.motion.direction,
  } as const;
}

export function useMobileWorkspaceTransition({
  secondaryInstanceKey,
  transition,
}: Omit<ResolveMobileWorkspaceRuntimeOptions, 'completedTransitionRevision'>) {
  const [completedTransitionRevision, setCompletedTransitionRevision] = useState<number>();
  const runtime = resolveMobileWorkspaceRuntime({
    secondaryInstanceKey,
    transition,
    completedTransitionRevision,
  });

  const completeMotion = useCallback(
    (event: AnimationEvent<HTMLElement>) => {
      if (event.currentTarget !== event.target || !transition) return;
      setCompletedTransitionRevision(transition.revision);
    },
    [transition],
  );

  return { ...runtime, completeMotion };
}


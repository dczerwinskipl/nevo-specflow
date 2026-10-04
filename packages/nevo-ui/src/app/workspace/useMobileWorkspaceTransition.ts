import { useCallback, useState, type AnimationEvent } from 'react';

import type { WorkspaceTransition } from './WorkspaceContext';
import {
  idleWorkspacePresentationTransition,
  resolveWorkspacePresentationTransition,
  resolveWorkspaceSurfaceTransition,
  type WorkspacePresentationTransition,
  type WorkspacePresentationTarget,
} from './workspaceTransition';

export interface MobileWorkspaceSurfaceRuntime {
  surface: 'primary' | 'secondary';
  role: WorkspacePresentationTarget;
  instanceKey: string;
  mounted: boolean;
  visible: boolean;
  active: boolean;
  interactive: boolean;
  motion: WorkspacePresentationTransition;
}

export interface MobileWorkspaceRuntime {
  primary: MobileWorkspaceSurfaceRuntime;
  secondary: MobileWorkspaceSurfaceRuntime;
  outgoingSecondary: MobileWorkspaceSurfaceRuntime;
}

interface ResolveMobileWorkspaceRuntimeOptions {
  secondaryInstanceKey?: string;
  transition?: WorkspaceTransition;
  completedTransitionRevision?: number;
}

export function resolveMobileWorkspaceRuntime({
  secondaryInstanceKey,
  transition,
  completedTransitionRevision,
}: ResolveMobileWorkspaceRuntimeOptions): MobileWorkspaceRuntime {
  const hasSecondary = secondaryInstanceKey !== undefined;
  const outgoingSecondaryInstanceKey = transition?.outgoing
    ? `runtime-${transition.outgoing.instanceKey}`
    : undefined;
  const transitionPending = transition?.revision !== completedTransitionRevision;
  const presentationTransition =
    transition?.revision === completedTransitionRevision
      ? idleWorkspacePresentationTransition
      : resolveWorkspacePresentationTransition(transition);
  const incomingMotion = resolveWorkspaceSurfaceTransition('incoming', presentationTransition);
  const outgoingMotion = resolveWorkspaceSurfaceTransition('outgoing', presentationTransition);
  const outgoingMounted = transitionPending && outgoingSecondaryInstanceKey !== undefined;
  const keepPrimaryPainted =
    !hasSecondary ||
    (incomingMotion.phase === 'entering' && outgoingSecondaryInstanceKey === undefined);

  return {
    primary: {
      surface: 'primary',
      role: 'incoming',
      instanceKey: 'primary',
      mounted: true,
      visible: !hasSecondary || keepPrimaryPainted,
      active: !hasSecondary,
      interactive: !hasSecondary,
      motion: idleWorkspacePresentationTransition,
    },
    secondary: {
      surface: 'secondary',
      role: 'incoming',
      instanceKey: secondaryInstanceKey ?? 'secondary-absent',
      mounted: hasSecondary,
      visible: hasSecondary,
      active: hasSecondary,
      interactive: hasSecondary,
      motion: incomingMotion,
    },
    outgoingSecondary: {
      surface: 'secondary',
      role: 'outgoing',
      instanceKey: outgoingSecondaryInstanceKey ?? 'secondary-outgoing-absent',
      mounted: outgoingMounted,
      visible: outgoingMounted,
      active: false,
      interactive: false,
      motion: outgoingMotion,
    },
  };
}

export function workspaceSurfaceRuntimeAttributes(runtime: MobileWorkspaceSurfaceRuntime) {
  return {
    'data-workspace-surface': runtime.surface,
    'data-workspace-role': runtime.role,
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

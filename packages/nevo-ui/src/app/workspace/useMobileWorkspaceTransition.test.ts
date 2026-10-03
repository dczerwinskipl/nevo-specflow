import { describe, expect, it } from 'vitest';
import {
  resolveMobileWorkspaceRuntime,
  workspaceSurfaceRuntimeAttributes,
} from './useMobileWorkspaceTransition';
import type { WorkspaceTransition } from './WorkspaceContext';

function transition(
  action: WorkspaceTransition['action'],
  revision: number,
  outgoing: number | null,
  incoming: number | null,
): WorkspaceTransition {
  return {
    action,
    revision,
    outgoing: outgoing === null ? null : { instanceKey: outgoing, surface: { content: null } },
    incoming: incoming === null ? null : { instanceKey: incoming, surface: { content: null } },
  };
}

describe('mobile workspace runtime orchestration', () => {
  it('keeps only Primary active when Secondary is absent', () => {
    const runtime = resolveMobileWorkspaceRuntime({});

    expect(runtime.primary).toMatchObject({
      instanceKey: 'primary',
      mounted: true,
      visible: true,
      active: true,
      interactive: true,
      motion: { phase: 'idle' },
    });
    expect(runtime.secondary).toMatchObject({
      mounted: false,
      visible: false,
      active: false,
      interactive: false,
    });
  });

  it('keeps Primary mounted but inactive while the current Secondary enters', () => {
    const runtime = resolveMobileWorkspaceRuntime({
      secondaryInstanceKey: 'runtime-2',
      transition: transition('push', 2, null, 2),
    });

    expect(runtime.primary).toMatchObject({
      mounted: true,
      visible: true,
      active: false,
      interactive: false,
      motion: { phase: 'idle' },
    });
    expect(runtime.secondary).toMatchObject({
      instanceKey: 'runtime-2',
      mounted: true,
      visible: true,
      active: true,
      interactive: true,
      motion: { phase: 'entering', direction: 'forward', target: 'incoming' },
    });
  });

  it('represents lifecycle completion independently from navigation state', () => {
    const runtime = resolveMobileWorkspaceRuntime({
      secondaryInstanceKey: 'runtime-2',
      transition: transition('push', 2, null, 2),
      completedTransitionRevision: 2,
    });

    expect(runtime.secondary.motion).toEqual({ phase: 'idle' });
    expect(runtime.secondary.active).toBe(true);
    expect(runtime.primary).toMatchObject({
      mounted: true,
      visible: false,
      active: false,
      interactive: false,
      motion: { phase: 'idle' },
    });
  });

  it.each(['pop', 'replace'] as const)(
    'keeps the outgoing Secondary mounted and inert during %s',
    (action) => {
      const runtime = resolveMobileWorkspaceRuntime({
        secondaryInstanceKey: 'runtime-1',
        transition: transition(action, 3, 2, 1),
      });

      expect(runtime.secondary.motion).toEqual({ phase: 'idle' });
      expect(runtime.secondary.instanceKey).toBe('runtime-1');
      expect(runtime.outgoingSecondary).toMatchObject({
        instanceKey: 'runtime-2',
        mounted: true,
        visible: true,
        active: false,
        interactive: false,
        motion: { phase: 'exiting', direction: 'backward', target: 'outgoing' },
      });
    },
  );

  it('returns lifecycle ownership to Primary after close removes Secondary', () => {
    const runtime = resolveMobileWorkspaceRuntime({
      transition: transition('close', 5, 3, null),
    });

    expect(runtime.primary).toMatchObject({ active: true, interactive: true, visible: true });
    expect(runtime.secondary).toMatchObject({ mounted: false, active: false, interactive: false });
    expect(runtime.outgoingSecondary).toMatchObject({
      mounted: true,
      active: false,
      interactive: false,
    });
  });

  it('unmounts the outgoing surface only after semantic motion completion', () => {
    const runtime = resolveMobileWorkspaceRuntime({
      secondaryInstanceKey: 'runtime-1',
      transition: transition('pop', 6, 2, 1),
      completedTransitionRevision: 6,
    });

    expect(runtime.outgoingSecondary.mounted).toBe(false);
    expect(runtime.outgoingSecondary.motion).toEqual({ phase: 'idle' });
    expect(runtime.secondary).toMatchObject({ active: true, interactive: true });
  });

  it('lets a newer rapid navigation revision supersede prior completion', () => {
    const runtime = resolveMobileWorkspaceRuntime({
      secondaryInstanceKey: 'runtime-3',
      transition: transition('replace', 7, 2, 3),
      completedTransitionRevision: 6,
    });

    expect(runtime.outgoingSecondary).toMatchObject({
      instanceKey: 'runtime-2',
      mounted: true,
      interactive: false,
    });
  });

  it('publishes concise semantic DOM state attributes', () => {
    const runtime = resolveMobileWorkspaceRuntime({
      secondaryInstanceKey: 'runtime-4',
      transition: transition('push', 4, null, 4),
    });

    expect(workspaceSurfaceRuntimeAttributes(runtime.secondary)).toEqual({
      'data-workspace-surface': 'secondary',
      'data-workspace-role': 'incoming',
      'data-workspace-instance': 'runtime-4',
      'data-workspace-active': 'true',
      'data-workspace-motion': 'entering',
      'data-workspace-direction': 'forward',
    });
  });
});

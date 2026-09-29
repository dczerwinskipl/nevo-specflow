import { describe, expect, it } from 'vitest';
import {
  resolveMobileWorkspaceRuntime,
  workspaceSurfaceRuntimeAttributes,
} from './useMobileWorkspaceTransition';

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
      transition: { action: 'push', revision: 2 },
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
      motion: { phase: 'entering', direction: 'forward', target: 'secondary' },
    });
  });

  it('represents lifecycle completion independently from navigation state', () => {
    const runtime = resolveMobileWorkspaceRuntime({
      secondaryInstanceKey: 'runtime-2',
      transition: { action: 'push', revision: 2 },
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
    'reveals the current Secondary without forward entry on %s',
    (action) => {
      const runtime = resolveMobileWorkspaceRuntime({
        secondaryInstanceKey: 'runtime-1',
        transition: { action, revision: 3 },
      });

      expect(runtime.secondary.motion).toEqual({ phase: 'idle' });
      expect(runtime.secondary.instanceKey).toBe('runtime-1');
    },
  );

  it('returns lifecycle ownership to Primary after close removes Secondary', () => {
    const runtime = resolveMobileWorkspaceRuntime({
      transition: { action: 'close', revision: 5 },
    });

    expect(runtime.primary).toMatchObject({ active: true, interactive: true, visible: true });
    expect(runtime.secondary).toMatchObject({ mounted: false, active: false, interactive: false });
  });

  it('publishes concise semantic DOM state attributes', () => {
    const runtime = resolveMobileWorkspaceRuntime({
      secondaryInstanceKey: 'runtime-4',
      transition: { action: 'push', revision: 4 },
    });

    expect(workspaceSurfaceRuntimeAttributes(runtime.secondary)).toEqual({
      'data-workspace-surface': 'secondary',
      'data-workspace-instance': 'runtime-4',
      'data-workspace-active': 'true',
      'data-workspace-motion': 'entering',
      'data-workspace-direction': 'forward',
    });
  });
});

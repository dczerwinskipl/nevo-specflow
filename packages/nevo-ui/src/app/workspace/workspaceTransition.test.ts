import { describe, expect, it } from 'vitest';
import {
  resolveWorkspacePresentationTransition,
  resolveWorkspaceSurfaceTransition,
} from './workspaceTransition';
import type { WorkspaceTransition } from './WorkspaceContext';

function transition(
  action: WorkspaceTransition['action'],
  outgoing: number | null,
  incoming: number | null,
): WorkspaceTransition {
  return {
    action,
    revision: 1,
    outgoing: outgoing === null ? null : { instanceKey: outgoing, surface: { content: null } },
    incoming: incoming === null ? null : { instanceKey: incoming, surface: { content: null } },
  };
}

describe('workspace presentation transition model', () => {
  it('maps push navigation to a forward Secondary entry', () => {
    expect(resolveWorkspacePresentationTransition(transition('push', null, 1))).toEqual({
      phase: 'entering',
      direction: 'forward',
      target: 'incoming',
    });
  });

  it.each(['pop', 'replace', 'close'] as const)('models outgoing lifecycle for %s', (action) => {
    expect(resolveWorkspacePresentationTransition(transition(action, 2, null))).toEqual({
      phase: 'exiting',
      direction: 'backward',
      target: 'outgoing',
    });
  });

  it('is idle without navigation intent', () => {
    expect(resolveWorkspacePresentationTransition()).toEqual({ phase: 'idle' });
  });

  it('assigns presentation intent only to its semantic target', () => {
    const resolved = resolveWorkspacePresentationTransition(transition('push', null, 1));

    expect(resolveWorkspaceSurfaceTransition('outgoing', resolved)).toEqual({ phase: 'idle' });
    expect(resolveWorkspaceSurfaceTransition('incoming', resolved)).toEqual(resolved);
  });
});

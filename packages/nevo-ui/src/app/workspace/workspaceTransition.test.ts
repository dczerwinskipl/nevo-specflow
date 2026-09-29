import { describe, expect, it } from 'vitest';
import {
  resolveWorkspacePresentationTransition,
  resolveWorkspaceSurfaceTransition,
} from './workspaceTransition';

describe('workspace presentation transition model', () => {
  it('maps push navigation to a forward Secondary entry', () => {
    expect(resolveWorkspacePresentationTransition({ action: 'push', revision: 1 })).toEqual({
      phase: 'entering',
      direction: 'forward',
      target: 'secondary',
    });
  });

  it.each(['pop', 'replace', 'close'] as const)(
    'keeps the current immediate presentation for %s navigation',
    (action) => {
      expect(resolveWorkspacePresentationTransition({ action, revision: 1 })).toEqual({
        phase: 'idle',
      });
    },
  );

  it('is idle without navigation intent', () => {
    expect(resolveWorkspacePresentationTransition()).toEqual({ phase: 'idle' });
  });

  it('assigns presentation intent only to its semantic target', () => {
    const transition = resolveWorkspacePresentationTransition({ action: 'push', revision: 1 });

    expect(resolveWorkspaceSurfaceTransition('primary', transition)).toEqual({ phase: 'idle' });
    expect(resolveWorkspaceSurfaceTransition('secondary', transition)).toEqual(transition);
  });
});

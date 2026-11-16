import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { ResolvedProjectHome } from '../../home/home';
import { validateWorkspaceRegistry } from './validation';

const projectId = randomUUID();
const homeRoot = resolve('/project');
const context = { project: { projectId, homeRoot } } as unknown as ResolvedProjectHome;
const primaryWorkspaceId = randomUUID();

function registryWith(linked: Record<string, unknown>): unknown {
  return {
    version: 1,
    projectId,
    revision: 1,
    primaryWorkspaceId,
    workspaces: [
      { kind: 'primary', workspaceId: primaryWorkspaceId, root: homeRoot, managed: false },
      {
        kind: 'linked',
        workspaceId: randomUUID(),
        root: resolve('/worktrees/spec'),
        managed: true,
        instanceId: randomUUID(),
        ...linked,
      },
    ],
    specBindings: [],
  };
}

describe('workspace registry started-from branch', () => {
  it('keeps the branch a linked workspace started from', () => {
    const registry = validateWorkspaceRegistry(
      registryWith({ startedFrom: 'release/2026.11' }),
      context,
    );
    expect(registry.workspaces[1]).toMatchObject({ startedFrom: 'release/2026.11' });
  });

  it('reads a workspace created before it was recorded without one', () => {
    const registry = validateWorkspaceRegistry(registryWith({}), context);
    expect(registry.workspaces[1]).not.toHaveProperty('startedFrom');
  });

  it('rejects a value that is not a short branch name', () => {
    for (const startedFrom of ['', 'a..b', 'with space', 3]) {
      expect(() => validateWorkspaceRegistry(registryWith({ startedFrom }), context)).toThrowError(
        expect.objectContaining({ code: 'REGISTRY_CORRUPT' }),
      );
    }
  });
});

import {
  inspectWorkspaces,
  type InspectedWorkspace,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';
import { describe, expect, it, vi } from 'vitest';

import { createEngineWorkspaceList } from './engine-source';

// Only the Engine's shared inspection read is replaced; the mapping is the unit under test.
vi.mock('@nevo/specflow-engine', () => ({ inspectWorkspaces: vi.fn() }));

const inspected = (
  workspaceId: string,
  kind: InspectedWorkspace['kind'],
  git?: InspectedWorkspace['git'],
): InspectedWorkspace => ({
  workspaceId,
  kind,
  name: workspaceId,
  root: `/work/${workspaceId}`,
  managed: kind === 'linked',
  isRuntimeWorkspace: kind === 'primary',
  available: true,
  specifications: [],
  specCount: 0,
  ...(git ? { git } : {}),
});

describe('the Engine workspace list mapping', () => {
  it('omits dirty for a detached checkout and one without Git facts: unknown is not clean', async () => {
    vi.mocked(inspectWorkspaces).mockResolvedValue([
      inspected('main', 'primary', { detached: false, branch: 'main', dirty: true }),
      inspected('clean', 'linked', { detached: false, branch: 'work', dirty: false }),
      inspected('detached', 'linked', { detached: true, dirty: false }),
      inspected('no-git', 'linked'),
    ]);

    const { workspaces } = await createEngineWorkspaceList({} as SpecFlowEngine)();

    expect(workspaces.map((w) => [w.workspaceId, w.dirty])).toEqual([
      ['main', true],
      ['clean', false],
      ['detached', undefined],
      ['no-git', undefined],
    ]);
    expect(workspaces[2]).not.toHaveProperty('dirty');
    expect(workspaces[3]).not.toHaveProperty('dirty');
  });
});

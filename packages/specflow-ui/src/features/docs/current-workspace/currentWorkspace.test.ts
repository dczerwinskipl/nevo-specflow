import type { WorkspaceList, WorkspaceListItem } from '@nevo/specflow-contracts/workspaces';
import { describe, expect, it } from 'vitest';
import { settleCurrentWorkspace } from './currentWorkspace';
import { createCurrentWorkspaceStore } from './currentWorkspaceStore';

const item = (workspaceId: string, extra: Partial<WorkspaceListItem> = {}): WorkspaceListItem => ({
  workspaceId,
  kind: workspaceId === 'main' ? 'primary' : 'linked',
  name: `${workspaceId}-folder`,
  path: `/repo/${workspaceId}`,
  available: true,
  isRuntimeWorkspace: workspaceId === 'main',
  specifications: [],
  ...extra,
});
const list: WorkspaceList = {
  projectFolderId: 'main',
  workspaces: [
    item('main'),
    item('sso'),
    item('broken', { available: false, unavailableReason: 'checkout-unavailable' }),
  ],
};

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));

  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe('current documentation workspace', () => {
  it('starts a new tab at the project folder', () => {
    const store = createCurrentWorkspaceStore(memoryStorage());
    expect(store.get()).toEqual({ source: 'project-folder' });
    expect(settleCurrentWorkspace(store.get(), list)).toEqual({
      workspaceId: 'main',
      source: 'project-folder',
    });
  });

  it('is set by a Specification, a pick, a route and a Session entry, and kept for the tab', () => {
    const storage = memoryStorage();
    const store = createCurrentWorkspaceStore(storage);
    store.enterSpecification('sso');
    expect(store.get()).toEqual({ workspaceId: 'sso', source: 'specification' });
    store.pick('main');
    expect(store.get()).toEqual({ workspaceId: 'main', source: 'pick' });
    store.openRoute('sso');
    expect(store.get()).toEqual({ workspaceId: 'sso', source: 'route' });

    // Leaving the Specification changes nothing; a reload of the tab restores it.
    expect(createCurrentWorkspaceStore(storage).get()).toEqual({
      workspaceId: 'sso',
      source: 'route',
    });

    store.enterSession();
    expect(settleCurrentWorkspace(store.get(), list)).toEqual({
      workspaceId: 'main',
      source: 'session',
    });
  });

  it('falls back to the project folder with the reason when the workspace is gone or unavailable', () => {
    expect(settleCurrentWorkspace({ workspaceId: 'closed', source: 'remembered' }, list)).toEqual({
      workspaceId: 'main',
      source: 'project-folder',
      notice: { reason: 'not-registered' },
    });
    expect(settleCurrentWorkspace({ workspaceId: 'broken', source: 'route' }, list)).toEqual({
      workspaceId: 'main',
      source: 'project-folder',
      notice: { reason: 'unavailable', workspaceName: 'broken-folder' },
    });
    // An explicit pick is answered by the reader's alert, not by a silent fallback.
    const picked = { workspaceId: 'broken', source: 'pick' } as const;
    expect(settleCurrentWorkspace(picked, list)).toBe(picked);
  });

  it('keeps the fallback notice while the route follows it, and clears it on the next choice', () => {
    const store = createCurrentWorkspaceStore(memoryStorage());
    store.openRoute('closed');
    store.replace(settleCurrentWorkspace(store.get(), list));
    store.openRoute('main');
    expect(store.get().notice).toEqual({ reason: 'not-registered' });
    store.pick('sso');
    expect(store.get()).toEqual({ workspaceId: 'sso', source: 'pick' });
  });

  it('restores a pick as a remembered value and ignores a damaged entry', () => {
    const storage = memoryStorage();
    createCurrentWorkspaceStore(storage).pick('broken');
    const restored = createCurrentWorkspaceStore(storage).get();
    expect(restored).toEqual({ workspaceId: 'broken', source: 'remembered' });
    expect(settleCurrentWorkspace(restored, list).workspaceId).toBe('main');

    storage.values.set([...storage.values.keys()][0]!, '{not json');
    expect(createCurrentWorkspaceStore(storage).get()).toEqual({ source: 'project-folder' });
  });
});

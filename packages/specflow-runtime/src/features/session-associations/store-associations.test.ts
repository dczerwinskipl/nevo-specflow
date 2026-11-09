import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openSessionStore, type SessionStore } from '../sessions/persistence/store';
import type { AssociationWrite } from '../sessions/persistence/protocol';
import type { SessionCoordinator } from '../sessions/lifecycle/coordinator';
import type { SessionsRuntime } from '../sessions';
import { createStoreSessionAssociations } from './store-associations';

let store: SessionStore | undefined,
  directory = '';
afterEach(async () => {
  await store?.close();
  store = undefined;
  if (directory) {
    await rm(directory, { recursive: true, force: true });
    directory = '';
  }
});

async function seeded() {
  directory = await mkdtemp(join(tmpdir(), 'nevo-store-associations-'));
  store = await openSessionStore({ directory, projectId: 'project' });
  const create = async (association?: AssociationWrite) =>
    (
      await store!.call<{ sessionId: string }>({
        op: 'create',
        actor: 'someone',
        input: { requestId: randomUUID(), providerId: 'mock', mode: 'read-only' },
        ...(association ? { association } : {}),
      })
    ).sessionId;
  const ofS = [
    await create({ specId: 'S', taskIds: ['TASK-01'], origin: 'user' }),
    await create({ specId: 'S', taskIds: [], origin: 'user' }),
  ];
  const ofT = await create({ specId: 'T', taskIds: [], origin: 'user' });
  const standalone = await create();
  const call = vi.spyOn(store, 'call');
  const workspaces = vi.fn((specIds: readonly string[]) =>
    Promise.resolve(new Map(specIds.map((specId) => [specId, 'workspace-of-' + specId]))),
  );
  const runtime: SessionsRuntime = {
    coordinator: { store } as unknown as SessionCoordinator,
    projectId: 'project',
  };

  return {
    ofS,
    ofT,
    standalone,
    call,
    workspaces,
    associations: createStoreSessionAssociations(runtime, { workspaces }),
  };
}

describe('store-backed Session associations', () => {
  it('resolves many references with one identities call and one binding read', async () => {
    const { ofS, ofT, standalone, call, workspaces, associations } = await seeded();
    const resolved = await associations.resolveMany([
      ...ofS,
      ofT,
      standalone,
      randomUUID(),
      ofS[0]!,
    ]);

    expect(call).toHaveBeenCalledTimes(1);
    expect(call.mock.calls[0]![0]).toMatchObject({ op: 'identities' });
    expect(workspaces).toHaveBeenCalledTimes(1);
    expect([...workspaces.mock.calls[0]![0]].sort()).toEqual(['S', 'T']);
    // Standalone and unknown Sessions are omitted; the workspace is resolved, never stored.
    expect(new Map(resolved)).toEqual(
      new Map([
        [
          ofS[0],
          { sessionId: ofS[0], specId: 'S', projectId: 'project', workspaceId: 'workspace-of-S' },
        ],
        [
          ofS[1],
          { sessionId: ofS[1], specId: 'S', projectId: 'project', workspaceId: 'workspace-of-S' },
        ],
        [ofT, { sessionId: ofT, specId: 'T', projectId: 'project', workspaceId: 'workspace-of-T' }],
      ]),
    );
    expect(await associations.resolve(standalone)).toBeNull();
  });

  it('reads the identity and the association of one Session', async () => {
    const { ofS, standalone, associations } = await seeded();
    expect(await associations.identity(ofS[0]!)).toEqual({
      projectId: 'project',
      sessionId: ofS[0],
      specId: 'S',
    });
    expect(await associations.association(ofS[0]!)).toEqual({ specId: 'S', taskIds: ['TASK-01'] });
    expect(await associations.association(standalone)).toBeNull();
    await expect(associations.identity(randomUUID())).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
    });
  });

  it('resolves nothing and refuses reads while managed Sessions are disabled', async () => {
    const workspaces = vi.fn();
    const associations = createStoreSessionAssociations(
      { coordinator: undefined, projectId: undefined },
      { workspaces },
    );
    expect((await associations.resolveMany([randomUUID()])).size).toBe(0);
    expect(workspaces).not.toHaveBeenCalled();
    await expect(associations.identity(randomUUID())).rejects.toMatchObject({
      code: 'SESSION_DISABLED',
    });
  });
});

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Value } from 'typebox/value';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionListPageSchema, type SessionListPage } from '@nevo/specflow-contracts/sessions';
import { createRuntimeApp } from '../../src/server/app';
import { openSessionStore } from '../../src/features/sessions/persistence/store';
import type { AssociationWrite } from '../../src/features/sessions/persistence/protocol';
import { passwordConfig } from '../auth/support/config';

type Role = 'viewer' | 'developer' | 'admin';
interface Seeded {
  /** Newest first: s2 (S, TASK-01), t1 (T), c (standalone), s1 (S, archived). */
  s1: string;
  c: string;
  t1: string;
  s2: string;
}

let app: FastifyInstance | undefined,
  directory = '';
afterEach(async () => {
  await app?.close();
  app = undefined;
  if (directory) {
    await rm(directory, { recursive: true, force: true });
    directory = '';
  }
});

/** Seeds the store directly, in creation order, optionally after `padding` older standalone ones. */
async function seed(padding = 0): Promise<Seeded & { padding: string[] }> {
  directory = await mkdtemp(join(tmpdir(), 'nevo-session-list-'));
  const store = await openSessionStore({ directory, projectId: 'project' });
  try {
    const create = async (association?: AssociationWrite) =>
      (
        await store.call<{ sessionId: string }>({
          op: 'create',
          actor: 'someone-else',
          input: { requestId: randomUUID(), providerId: 'mock', mode: 'read-only' },
          ...(association ? { association } : {}),
        })
      ).sessionId;
    const spec = (specId: string, taskIds: string[] = []): AssociationWrite => ({
      specId,
      taskIds,
      origin: 'user',
    });
    const padded: string[] = [];
    for (let index = 0; index < padding; index += 1) {
      padded.push(await create());
    }

    const s1 = await create(spec('S'));
    await store.call({
      op: 'archive',
      actor: 'someone-else',
      sessionId: s1,
      input: { requestId: randomUUID() },
    });

    return {
      padding: padded,
      s1,
      c: await create(),
      t1: await create(spec('T')),
      s2: await create(spec('S', ['TASK-01'])),
    };
  } finally {
    await store.close();
  }
}

async function open(role: Role | undefined, scope: Record<string, string> = {}, enabled = true) {
  const config = passwordConfig();
  app = await createRuntimeApp(
    {
      ...config,
      authentication: { ...config.authentication, mode: 'none', localUserId: 'demo-user' },
      authorization: { assignments: role ? [{ userId: 'demo-user', role, scope }] : [] },
      sessions: { enabled, providers: { mock: { enabled: true } } },
    },
    { sessions: { storage: { directory, projectId: 'project' } } },
  );

  return app;
}

async function list(server: FastifyInstance, query = '') {
  const response = await server.inject(`/api/sessions${query}`);
  if (response.statusCode === 200) {
    expect(Value.Check(SessionListPageSchema, response.json())).toBe(true);
  }

  return response;
}

const page = (response: { json<T>(): T }) => response.json<SessionListPage>();
const ids = (response: { json<T>(): T }) => page(response).items.map((item) => item.sessionId);

describe('GET /api/sessions', () => {
  it('lists the project Sessions newest first, archived excluded by default', async () => {
    const seeded = await seed();
    const server = await open('developer', { projectId: 'project' });
    const response = await list(server);
    expect(response.statusCode).toBe(200);
    expect(ids(response)).toEqual([seeded.s2, seeded.t1, seeded.c]);
    expect(page(response).nextCursor).toBeUndefined();
    expect(page(response).items.map((item) => item.association)).toEqual([
      { kind: 'specification', specId: 'S', taskIds: ['TASK-01'] },
      { kind: 'specification', specId: 'T', taskIds: [] },
      { kind: 'standalone' },
    ]);
    expect(page(response).items[0]).toMatchObject({
      providerId: 'mock',
      readiness: 'ready',
      createdAt: expect.any(String) as unknown,
      updatedAt: expect.any(String) as unknown,
    });
  });

  it('selects by Specification, Task, standalone and archive state', async () => {
    const seeded = await seed();
    const server = await open('viewer', { projectId: 'project' });
    expect(ids(await list(server, '?specId=S'))).toEqual([seeded.s2]);
    expect(ids(await list(server, '?specId=S&archived=include'))).toEqual([seeded.s2, seeded.s1]);
    expect(ids(await list(server, '?specId=S&archived=only'))).toEqual([seeded.s1]);
    expect(ids(await list(server, '?specId=S&taskId=TASK-01'))).toEqual([seeded.s2]);
    expect(ids(await list(server, '?specId=S&taskId=TASK-02'))).toEqual([]);
    expect(ids(await list(server, '?standalone=true'))).toEqual([seeded.c]);
    expect(ids(await list(server, '?archived=only'))).toEqual([seeded.s1]);
    expect(page(await list(server, '?archived=only')).items[0]!.archivedAt).toEqual(
      expect.any(String),
    );
  });

  it('rejects inconsistent filters and limits', async () => {
    await seed();
    const server = await open('viewer', { projectId: 'project' });
    for (const query of [
      '?taskId=TASK-01',
      '?specId=S&standalone=true',
      '?limit=0',
      '?limit=101',
      '?standalone=false',
      '?archived=all',
    ]) {
      const response = await list(server, query);
      expect(response.statusCode, query).toBe(400);
      expect(response.json<{ code: string }>().code, query).toBe('SESSION_INPUT_INVALID');
    }
  });

  it('requires a Specification filter from a Specification-scoped caller', async () => {
    const seeded = await seed();
    const server = await open('viewer', { specId: 'S' });
    const unfiltered = await list(server);
    expect(unfiltered.statusCode).toBe(400);
    expect(unfiltered.json<{ code: string }>().code).toBe('SESSION_LIST_SCOPE_REQUIRED');
    // The filter selects; it never grants.
    expect(ids(await list(server, '?specId=S&archived=include'))).toEqual([seeded.s2, seeded.s1]);
    expect(ids(await list(server, '?specId=T'))).toEqual([]);
    expect((await list(server, '?standalone=true')).statusCode).toBe(200);
    expect(ids(await list(server, '?standalone=true'))).toEqual([]);
  });

  it('authorizes every row and redacts the association without spec.view', async () => {
    const seeded = await seed();
    // A Session-scoped grant views that Session but never its Specification.
    const server = await open('viewer', { sessionId: seeded.s2 });
    const response = await list(server);
    expect(ids(response)).toEqual([seeded.s2]);
    expect(page(response).items[0]!.association).toEqual({ kind: 'restricted' });
    expect(JSON.stringify(page(response))).not.toContain('"S"');
  });

  it('refuses a caller without session.view and answers SESSION_DISABLED when disabled', async () => {
    await seed();
    expect((await list(await open(undefined))).statusCode).toBe(403);
    await app!.close();
    const disabled = await list(await open('viewer', { projectId: 'project' }, false));
    expect(disabled.statusCode).toBe(503);
    expect(disabled.json<{ code: string }>().code).toBe('SESSION_DISABLED');
  });

  it('pages with a cursor bound to the filter', async () => {
    const seeded = await seed();
    const server = await open('viewer', { projectId: 'project' });
    const first = await list(server, '?limit=2');
    expect(ids(first)).toEqual([seeded.s2, seeded.t1]);
    const cursor = page(first).nextCursor!;
    expect(cursor).toEqual(expect.any(String));
    const second = await list(server, `?limit=2&cursor=${encodeURIComponent(cursor)}`);
    expect(ids(second)).toEqual([seeded.c]);
    expect(page(second).nextCursor).toBeUndefined();

    const foreign = await list(server, `?limit=2&specId=S&cursor=${encodeURIComponent(cursor)}`);
    expect(foreign.statusCode).toBe(400);
    expect(foreign.json<{ code: string }>().code).toBe('SESSION_CURSOR_INVALID');
    const [data, signature] = cursor.split('.');
    const forged = Buffer.from(
      JSON.stringify({
        ...(JSON.parse(Buffer.from(data!, 'base64url').toString()) as object),
        after: 999,
      }),
    ).toString('base64url');
    const tampered = await list(server, `?cursor=${encodeURIComponent(forged + '.' + signature)}`);
    expect(tampered.statusCode).toBe(400);
    expect(tampered.json<{ code: string }>().code).toBe('SESSION_CURSOR_INVALID');
  });

  it('stops after 500 scanned rows with a short page and a cursor', async () => {
    const seeded = await seed(500);
    // Only the oldest Session is visible: the first scan spends its budget on refusals.
    const server = await open('viewer', { sessionId: seeded.padding[0]! });
    const first = await list(server, '?limit=10');
    expect(page(first).items).toEqual([]);
    const cursor = page(first).nextCursor;
    expect(cursor).toEqual(expect.any(String));
    const second = await list(server, `?limit=10&cursor=${encodeURIComponent(cursor!)}`);
    expect(ids(second)).toEqual([seeded.padding[0]]);
    expect(page(second).nextCursor).toBeUndefined();
  }, 120000);
});

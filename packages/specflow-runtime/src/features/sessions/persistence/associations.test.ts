import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { SessionListFilter } from '@nevo/specflow-contracts/sessions';
import { openSessionStore, type SessionStore } from './store';
import type {
  AssociationWrite,
  SessionIdentity,
  SessionListScan,
  StoredListSummary,
  StoredAssociation,
} from './protocol';

let store: SessionStore | undefined;
let directory = '';
afterEach(async () => {
  await store?.close();
  store = undefined;
  if (directory) {
    await rm(directory, { recursive: true, force: true });
  }
});

async function open() {
  directory = await mkdtemp(join(tmpdir(), 'nevo-session-associations-'));
  store = await openSessionStore({ directory, projectId: 'project' });

  return store;
}

const input = (requestId = randomUUID()) => ({
  requestId,
  providerId: 'mock',
  mode: 'read-only' as const,
});
const spec = (specId: string, taskIds: string[] = []): AssociationWrite => ({
  specId,
  taskIds,
  origin: 'user',
});

async function create(association?: AssociationWrite, requestId = randomUUID()) {
  return (
    await store!.call<{ sessionId: string }>({
      op: 'create',
      actor: 'user',
      input: input(requestId),
      ...(association ? { association } : {}),
    })
  ).sessionId;
}

function inspect<T>(read: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(join(directory, 'sessions.sqlite'));
  try {
    return read(db);
  } finally {
    db.close();
  }
}

const count = (db: DatabaseSync, table: string) =>
  Number((db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n);

const list = (filter: SessionListFilter, scanBudget = 500, after?: number) =>
  store!.call<SessionListScan>({
    op: 'list',
    filter,
    scanBudget,
    ...(after !== undefined ? { after } : {}),
  });

describe('Session association store', () => {
  it('writes the association with the Session and derives identity from it', async () => {
    await open();
    const associated = await create(spec('S1', ['T1', 'T2']));
    const standalone = await create();
    expect(await store!.call<SessionIdentity>({ op: 'identity', sessionId: associated })).toEqual({
      projectId: 'project',
      sessionId: associated,
      specId: 'S1',
    });
    expect(await store!.call<SessionIdentity>({ op: 'identity', sessionId: standalone })).toEqual({
      projectId: 'project',
      sessionId: standalone,
    });
    expect(
      await store!.call<StoredAssociation>({ op: 'association', sessionId: associated }),
    ).toMatchObject({ specId: 'S1', taskIds: ['T1', 'T2'], origin: 'user' });
    expect(await store!.call({ op: 'association', sessionId: standalone })).toBeNull();
    await expect(store!.call({ op: 'association', sessionId: randomUUID() })).rejects.toMatchObject(
      { code: 'SESSION_NOT_FOUND' },
    );
  });

  it('refuses an invalid association before writing anything', async () => {
    await open();
    for (const association of [
      spec('S1', ['T1', 'T1']),
      spec('../S1'),
      spec(
        'S1',
        Array.from({ length: 33 }, (_, n) => `T${n}`),
      ),
      { ...spec('S1'), origin: 'admin' } as unknown as AssociationWrite,
    ]) {
      await expect(create(association)).rejects.toMatchObject({ code: 'SESSION_INPUT_INVALID' });
    }

    expect(inspect((db) => count(db, 'sessions'))).toBe(0);
  });

  it('creates the Session and its association atomically', async () => {
    await open();
    const requestId = randomUUID();
    inspect((db) =>
      db.exec(
        "CREATE TRIGGER injected BEFORE INSERT ON session_association_tasks BEGIN SELECT RAISE(ABORT,'injected'); END",
      ),
    );
    await expect(create(spec('S1', ['T1']), requestId)).rejects.toMatchObject({
      code: 'SESSION_STORE_UNAVAILABLE',
    });
    expect(
      inspect((db) =>
        ['sessions', 'session_associations', 'session_association_tasks', 'requests'].map((table) =>
          count(db, table),
        ),
      ),
    ).toEqual([0, 0, 0, 0]);
    inspect((db) => db.exec('DROP TRIGGER injected'));
    const sessionId = await create(spec('S1', ['T1']), requestId);
    expect(inspect((db) => [count(db, 'sessions'), count(db, 'session_associations')])).toEqual([
      1, 1,
    ]);
    expect(await create(spec('S1', ['T1']), requestId)).toBe(sessionId);
  });

  it('keys both create routes by one request ID fingerprinted over input and association', async () => {
    await open();
    const standalone = randomUUID();
    const first = await create(undefined, standalone);
    expect(await create(undefined, standalone)).toBe(first);
    await expect(create(spec('S1'), standalone)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    const associated = randomUUID();
    const second = await create(spec('S1', ['T1']), associated);
    expect(await create(spec('S1', ['T1']), associated)).toBe(second);
    await expect(create(spec('S2', ['T1']), associated)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    await expect(create(spec('S1', ['T2']), associated)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
    await expect(create(undefined, associated)).rejects.toMatchObject({
      code: 'IDEMPOTENCY_CONFLICT',
    });
  });

  it('appends workflow Tasks only within the home Specification', async () => {
    await open();
    const associated = await create(spec('S1', ['T1']));
    const standalone = await create();
    const appended = await store!.call<StoredAssociation>({
      op: 'associate-tasks',
      sessionId: associated,
      specId: 'S1',
      taskIds: ['T1', 'T2'],
      origin: 'workflow',
    });
    expect(appended.taskIds).toEqual(['T1', 'T2']);
    await expect(
      store!.call({
        op: 'associate-tasks',
        sessionId: associated,
        specId: 'S2',
        taskIds: ['T3'],
        origin: 'workflow',
      }),
    ).rejects.toMatchObject({
      code: 'SESSION_INPUT_INVALID',
      details: { reason: 'foreign-specification' },
    });
    await expect(
      store!.call({
        op: 'associate-tasks',
        sessionId: standalone,
        specId: 'S1',
        taskIds: ['T3'],
        origin: 'workflow',
      }),
    ).rejects.toMatchObject({ code: 'SESSION_INPUT_INVALID', details: { reason: 'standalone' } });
    expect(
      (await store!.call<StoredAssociation>({ op: 'association', sessionId: associated })).specId,
    ).toBe('S1');
  });

  it('deletes the association and its Tasks with the Session', async () => {
    await open();
    const sessionId = await create(spec('S1', ['T1']));
    const kept = await create(spec('S1', ['T1']));
    await store!.call({ op: 'delete', sessionId });
    expect(
      inspect((db) => [count(db, 'session_associations'), count(db, 'session_association_tasks')]),
    ).toEqual([1, 1]);
    expect(
      (await list({ specId: 'S1', archived: 'include' })).rows.map((r) => r.sessionId),
    ).toEqual([kept]);
  });

  it('resolves identities in one batch and bounds the batch', async () => {
    await open();
    const a = await create(spec('S1'));
    const b = await create();
    const identities = await store!.call<SessionIdentity[]>({
      op: 'identities',
      sessionIds: [a, b, randomUUID()],
    });
    expect(identities.sort((x, y) => x.sessionId.localeCompare(y.sessionId))).toEqual(
      [
        { projectId: 'project', sessionId: a, specId: 'S1' },
        { projectId: 'project', sessionId: b },
      ].sort((x, y) => x.sessionId.localeCompare(y.sessionId)),
    );
    expect(await store!.call({ op: 'identities', sessionIds: [] })).toEqual([]);
    await expect(
      store!.call({
        op: 'identities',
        sessionIds: Array.from({ length: 501 }, () => randomUUID()),
      }),
    ).rejects.toMatchObject({ code: 'SESSION_INPUT_INVALID' });
    await expect(store!.call({ op: 'identities', sessionIds: [a, a] })).rejects.toMatchObject({
      code: 'SESSION_INPUT_INVALID',
    });
  });

  it('lists newest first by keyset with filters, a scan budget and a cursor', async () => {
    await open();
    const s1 = await create(spec('S1', ['T1']));
    const lone = await create();
    const s2 = await create(spec('S2'));
    const s1b = await create(spec('S1', ['T2']));
    const archived = await create(spec('S1'));
    await store!.call({
      op: 'archive',
      actor: 'user',
      sessionId: archived,
      input: { requestId: randomUUID() },
    });
    const ids = (scan: SessionListScan) => scan.rows.map((row) => row.sessionId);

    expect(ids(await list({ archived: 'exclude' }))).toEqual([s1b, s2, lone, s1]);
    expect(ids(await list({ archived: 'include' }))).toEqual([archived, s1b, s2, lone, s1]);
    expect(ids(await list({ archived: 'only' }))).toEqual([archived]);
    expect(ids(await list({ specId: 'S1', archived: 'exclude' }))).toEqual([s1b, s1]);
    expect(ids(await list({ specId: 'S1', taskId: 'T1', archived: 'include' }))).toEqual([s1]);
    expect(ids(await list({ standalone: true, archived: 'include' }))).toEqual([lone]);

    const first = await list({ archived: 'include' }, 2);
    expect(ids(first)).toEqual([archived, s1b]);
    expect(first.hasMore).toBe(true);
    const next = await list({ archived: 'include' }, 2, first.rows.at(-1)!.createdSeq);
    expect(ids(next)).toEqual([s2, lone]);
    const last = await list({ archived: 'include' }, 2, next.rows.at(-1)!.createdSeq);
    expect(ids(last)).toEqual([s1]);
    expect(last.hasMore).toBe(false);

    const [row] = (await list({ specId: 'S1', archived: 'only' })).rows;
    expect(row).toMatchObject({
      projectId: 'project',
      sessionId: archived,
      specId: 'S1',
      taskIds: [],
      readiness: 'ready',
    });
    expect(row!.archivedAt).toEqual(expect.any(String));
    expect((await list({ standalone: true, archived: 'exclude' })).rows[0]).not.toHaveProperty(
      'taskIds',
    );
  });

  it('refuses invalid list requests', async () => {
    await open();
    for (const [filter, budget] of [
      [{ archived: 'exclude' }, 501],
      [{ archived: 'exclude' }, 0],
      [{ specId: 'S1', standalone: true, archived: 'exclude' }, 10],
      [{ taskId: 'T1', archived: 'exclude' }, 10],
    ] as const) {
      await expect(list(filter as SessionListFilter, budget)).rejects.toMatchObject({
        code: 'SESSION_INPUT_INVALID',
      });
    }
  });

  it('decodes only the requested summaries in request order', async () => {
    await open();
    const a = await create();
    const b = await create(spec('S1'));
    await store!.call({
      op: 'rename',
      actor: 'user',
      sessionId: b,
      input: { requestId: randomUUID(), title: 'Plan' },
    });
    const summaries = await store!.call<StoredListSummary[]>({
      op: 'summaries',
      sessionIds: [b, a],
    });
    expect(summaries.map((s) => s.sessionId)).toEqual([b, a]);
    expect(summaries[0]).toMatchObject({ title: 'Plan', providerId: 'mock', readiness: 'ready' });
    expect(summaries[1]).not.toHaveProperty('title');
    await expect(
      store!.call({ op: 'summaries', sessionIds: Array.from({ length: 101 }, () => randomUUID()) }),
    ).rejects.toMatchObject({ code: 'SESSION_INPUT_INVALID' });
  });
});

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import { openSessionStore, type SessionStore } from './store';
import type { SessionListScan, StoredSession } from './protocol';

let store: SessionStore | undefined;
let directory = '';
afterEach(async () => {
  await store?.close();
  store = undefined;
  if (directory) {
    await rm(directory, { recursive: true, force: true });
  }
});

const ids = [
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
];

function stored(
  sessionId: string,
  createdAt: string,
  extra: Partial<StoredSession['snapshot']['session']> = {},
): StoredSession {
  return {
    ordinal: 0,
    snapshot: {
      revision: 0,
      eventSeq: 0,
      entries: [],
      history: { hasOlder: false },
      session: {
        sessionId,
        projectId: 'project',
        providerId: 'mock',
        mode: 'read-only',
        readiness: 'ready',
        capabilities: {
          view: true,
          manage: true,
          start: true,
          cancel: false,
          questions: true,
          permissions: true,
        },
        createdAt,
        updatedAt: createdAt,
        ...extra,
      },
    },
  };
}

/** A version 2 database: the v2 `sessions` shape with rows, no projection columns. */
async function v2Fixture(): Promise<void> {
  directory = await mkdtemp(join(tmpdir(), 'nevo-session-schema-'));
  const db = new DatabaseSync(join(directory, 'sessions.sqlite'));
  try {
    db.exec(
      'CREATE TABLE sessions(id TEXT PRIMARY KEY,project TEXT NOT NULL,seq INTEGER NOT NULL,ordinal INTEGER NOT NULL,data TEXT NOT NULL,native TEXT UNIQUE)',
    );
    const insert = db.prepare('INSERT INTO sessions VALUES(?,?,0,0,?,NULL)');
    // Rowid order differs from creation order; the last two share a createdAt (tie by rowid).
    insert.run(ids[0]!, 'project', JSON.stringify(stored(ids[0]!, '2026-11-03T00:00:00.000Z')));
    insert.run(
      ids[1]!,
      'project',
      JSON.stringify(
        stored(ids[1]!, '2026-11-01T00:00:00.000Z', {
          archivedAt: '2026-11-02T00:00:00.000Z',
          readiness: 'unavailable',
          updatedAt: '2026-11-02T00:00:00.000Z',
        }),
      ),
    );
    insert.run(ids[2]!, 'project', JSON.stringify(stored(ids[2]!, '2026-11-03T00:00:00.000Z')));
    db.exec('PRAGMA user_version=2');
  } finally {
    db.close();
  }
}

function inspect<T>(read: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(join(directory, 'sessions.sqlite'));
  try {
    return read(db);
  } finally {
    db.close();
  }
}

describe('Session schema v3', () => {
  it('migrates v2 once, backfilling the list projection in creation order', async () => {
    await v2Fixture();
    store = await openSessionStore({ directory, projectId: 'project' });
    expect(
      inspect((db) =>
        db
          .prepare(
            'SELECT id,created_seq,archived_at,readiness,updated_at FROM sessions ORDER BY created_seq',
          )
          .all(),
      ),
    ).toEqual([
      {
        id: ids[1],
        created_seq: 1,
        archived_at: '2026-11-02T00:00:00.000Z',
        readiness: 'unavailable',
        updated_at: '2026-11-02T00:00:00.000Z',
      },
      {
        id: ids[0],
        created_seq: 2,
        archived_at: null,
        readiness: 'ready',
        updated_at: '2026-11-03T00:00:00.000Z',
      },
      {
        id: ids[2],
        created_seq: 3,
        archived_at: null,
        readiness: 'ready',
        updated_at: '2026-11-03T00:00:00.000Z',
      },
    ]);
    expect(inspect((db) => db.prepare('PRAGMA user_version').get())).toEqual({ user_version: 3 });
    expect(
      inspect((db) => [
        db.prepare('SELECT count(*) AS n FROM session_associations').get(),
        db
          .prepare(
            "SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'sessions_%' ORDER BY name",
          )
          .all(),
      ]),
    ).toEqual([{ n: 0 }, [{ name: 'sessions_archived' }, { name: 'sessions_created' }]]);

    // Existing Sessions are standalone; a new Session continues the creation counter.
    const created = await store.call<{ sessionId: string }>({
      op: 'create',
      actor: 'user',
      input: {
        requestId: '20000000-0000-4000-8000-000000000001',
        providerId: 'mock',
        mode: 'read-only',
      },
    });
    const scan = await store.call<SessionListScan>({
      op: 'list',
      filter: { standalone: true, archived: 'include' },
      scanBudget: 10,
    });
    expect(scan.rows.map((row) => [row.sessionId, row.createdSeq])).toEqual([
      [created.sessionId, 4],
      [ids[2], 3],
      [ids[0], 2],
      [ids[1], 1],
    ]);

    // Reopening a v3 store neither re-runs the backfill nor rewrites creation order.
    await store.close();
    store = await openSessionStore({ directory, projectId: 'project' });
    expect(
      inspect((db) =>
        db.prepare('SELECT created_seq FROM sessions WHERE id=?').get(created.sessionId),
      ),
    ).toEqual({ created_seq: 4 });
  });

  it('keeps the projection columns in step with the snapshot on every save', async () => {
    directory = await mkdtemp(join(tmpdir(), 'nevo-session-schema-'));
    store = await openSessionStore({ directory, projectId: 'project' });
    const { sessionId } = await store.call<{ sessionId: string }>({
      op: 'create',
      actor: 'user',
      input: {
        requestId: '20000000-0000-4000-8000-000000000002',
        providerId: 'mock',
        mode: 'read-only',
      },
    });
    await store.call({
      op: 'archive',
      actor: 'user',
      sessionId,
      input: { requestId: '20000000-0000-4000-8000-000000000003' },
    });
    const row = inspect(
      (db) =>
        db.prepare('SELECT data,archived_at,readiness,updated_at FROM sessions').get() as {
          data: string;
          archived_at: string;
          readiness: string;
          updated_at: string;
        },
    );
    const session = (JSON.parse(row.data) as StoredSession).snapshot.session;
    expect([row.archived_at, row.readiness, row.updated_at]).toEqual([
      session.archivedAt,
      session.readiness,
      session.updatedAt,
    ]);
  });

  it('refuses a newer schema version without changing it', async () => {
    directory = await mkdtemp(join(tmpdir(), 'nevo-session-schema-'));
    const db = new DatabaseSync(join(directory, 'sessions.sqlite'));
    db.exec('CREATE TABLE meta(key TEXT PRIMARY KEY,value TEXT NOT NULL); PRAGMA user_version=4');
    db.close();
    await expect(openSessionStore({ directory, projectId: 'project' })).rejects.toMatchObject({
      code: 'SESSION_STORE_UNAVAILABLE',
    });
    expect(inspect((check) => check.prepare('PRAGMA user_version').get())).toEqual({
      user_version: 4,
    });
  });
});

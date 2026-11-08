import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { SessionChange } from '@nevo/specflow-contracts/sessions';
import { openSessionStore, type SessionStore } from './store';
import type { DriverFact, EventBatch, SessionView, StartAdmission } from './protocol';
import { SESSION_TABLE_OWNERSHIP } from './session-management';

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
  directory = await mkdtemp(join(tmpdir(), 'nevo-session-management-'));
  store = await openSessionStore({ directory, projectId: 'project' });

  return store;
}

async function create(providerId = 'mock', requestId = randomUUID()) {
  return (
    await store!.call<{ sessionId: string }>({
      op: 'create',
      actor: 'user',
      input: { requestId, providerId, mode: 'read-only' },
    })
  ).sessionId;
}

async function start(sessionId: string, native = false) {
  const admitted = await store!.call<StartAdmission>({
    op: 'start',
    actor: 'user',
    sessionId,
    input: { requestId: randomUUID(), message: 'Hello' },
    ...(native
      ? {
          nativeWorkspace: directory,
          nativeScope: 'account',
          nativeWorkspaceIdentity: 'a'.repeat(64),
        }
      : {}),
  });
  let seq = 0;
  const emit = (fact: DriverFact) =>
    store!.call({ op: 'fact', sessionId, ...admitted, driverSeq: ++seq, fact });

  return { ...admitted, emit };
}

async function events(sessionId: string): Promise<SessionChange[]> {
  const all: SessionChange[] = [];
  for (;;) {
    const batch = await store!.call<EventBatch>({
      op: 'events',
      sessionId,
      after: all.at(-1)?.eventSeq ?? 0,
    });
    if (!batch.events.length) {
      return all;
    }

    all.push(...batch.events);
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

const tables = (db: DatabaseSync) =>
  (
    db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
      .all() as { name: string }[]
  ).map((row) => row.name);

/** Rows per table whose text columns mention any of the identifiers. */
function mentions(db: DatabaseSync, ids: readonly string[]): Record<string, number> {
  return Object.fromEntries(
    tables(db).map((table) => [
      table,
      db
        .prepare(`SELECT * FROM ${table}`)
        .all()
        .filter((row) =>
          Object.values(row).some(
            (value) => typeof value === 'string' && ids.some((id) => value.includes(id)),
          ),
        ).length,
    ]),
  );
}

function identifiers(db: DatabaseSync, sessionId: string): string[] {
  const turns = db.prepare('SELECT id,data FROM turns WHERE session=?').all(sessionId) as {
    id: string;
    data: string;
  }[];
  const contents = db.prepare('SELECT id FROM contents WHERE session=?').all(sessionId) as {
    id: string;
  }[];

  return [
    sessionId,
    ...turns.flatMap((t) => [t.id, (JSON.parse(t.data) as { invocationId: string }).invocationId]),
    ...contents.map((c) => c.id),
  ];
}

describe('Session management store', () => {
  it('classifies every Session store table for delete', async () => {
    await open();
    const schema = inspect(tables).sort();
    // A new table must be added to the delete map as Session-owned or explicitly global.
    expect(Object.keys(SESSION_TABLE_OWNERSHIP).sort()).toEqual(schema);
    expect(
      Object.entries(SESSION_TABLE_OWNERSHIP)
        .filter(([, owned]) => owned === null)
        .map(([table]) => table)
        .sort(),
    ).toEqual(['meta', 'owner']);
  });

  it('renames idempotently with a trimmed nonblank title and one session event', async () => {
    await open();
    const sessionId = await create();
    const input = { requestId: randomUUID(), title: '  Plan review  ' };
    const renamed = await store!.call<SessionView>({
      op: 'rename',
      actor: 'user',
      sessionId,
      input,
    });
    expect(renamed.session.title).toBe('Plan review');
    expect(
      await store!.call<SessionView>({ op: 'rename', actor: 'user', sessionId, input }),
    ).toEqual(renamed);
    const changes = (await events(sessionId)).filter((event) => event.kind === 'session');
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ changes: { session: { title: 'Plan review' } } });
    await expect(
      store!.call({ op: 'rename', actor: 'user', sessionId, input: { ...input, title: 'Other' } }),
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
    // The same key from another actor is a separate request.
    await store!.call({ op: 'rename', actor: 'other', sessionId, input: { ...input, title: 'B' } });
    await expect(
      store!.call({
        op: 'rename',
        actor: 'user',
        sessionId,
        input: { requestId: randomUUID(), title: '   ' },
      }),
    ).rejects.toMatchObject({ code: 'SESSION_INPUT_INVALID' });
    await expect(
      store!.call({
        op: 'rename',
        actor: 'user',
        sessionId: randomUUID(),
        input: { requestId: randomUUID(), title: 'Missing' },
      }),
    ).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });

  it('archives only a settled Session, keeps it read-only and unarchives it', async () => {
    await open();
    const sessionId = await create();
    const turn = await start(sessionId);
    const archive = { op: 'archive' as const, actor: 'user', sessionId };
    await expect(
      store!.call({ ...archive, input: { requestId: randomUUID() } }),
    ).rejects.toMatchObject({ code: 'TURN_CONFLICT', details: { turnId: turn.turnId } });
    await turn.emit({ kind: 'outcome', outcome: 'completed' });
    const input = { requestId: randomUUID() };
    const archived = await store!.call<SessionView>({ ...archive, input });
    expect(archived.session.archivedAt).toEqual(expect.any(String));
    expect(await store!.call<SessionView>({ ...archive, input })).toEqual(archived);
    const again = await store!.call<SessionView>({
      ...archive,
      input: { requestId: randomUUID() },
    });
    expect(again.session.archivedAt).toBe(archived.session.archivedAt);
    expect((await events(sessionId)).filter((event) => event.kind === 'session')).toHaveLength(1);
    await expect(
      store!.call({
        op: 'start',
        actor: 'user',
        sessionId,
        input: { requestId: randomUUID(), message: 'Blocked' },
      }),
    ).rejects.toMatchObject({ code: 'SESSION_ARCHIVED' });
    await expect(
      store!.call({
        op: 'respond',
        actor: 'user',
        sessionId,
        interactionId: randomUUID(),
        input: { requestId: randomUUID(), kind: 'permission', decision: 'allow' },
      }),
    ).rejects.toMatchObject({ code: 'SESSION_ARCHIVED' });
    // Reads keep working while archived.
    await expect(store!.call({ op: 'snapshot', sessionId, actor: 'user' })).resolves.toBeDefined();
    const restored = await store!.call<SessionView>({
      op: 'unarchive',
      actor: 'user',
      sessionId,
      input: { requestId: randomUUID() },
    });
    expect(restored.session.archivedAt).toBeUndefined();
    await expect(start(sessionId)).resolves.toMatchObject({ fresh: true });
  });

  it('deletes every Session-owned row, keeps other Sessions and refuses unsettled Turns', async () => {
    await open();
    const createRequest = randomUUID();
    const victim = await create('controlled', createRequest);
    const survivor = await create('controlled');
    for (const sessionId of [victim, survivor]) {
      const turn = await start(sessionId, true);
      await expect(store!.call({ op: 'delete', sessionId })).rejects.toMatchObject({
        code: 'TURN_CONFLICT',
        details: { turnId: turn.turnId },
      });
      await turn.emit({
        kind: 'correlation',
        providerSessionId: turn.providerContext!.nativeSessionId,
      });
      await turn.emit({ kind: 'work-open', key: 'tool', workKind: 'tool', title: 'Inspect' });
      await turn.emit({ kind: 'action-open', key: 'read', parentKey: 'tool', title: 'Read' });
      await turn.emit({ kind: 'text', key: 'read', channel: 'tool-output', text: 'output' });
      await turn.emit({ kind: 'work-open', key: 'q', workKind: 'interaction', title: 'Question' });
      await turn.emit({
        kind: 'interaction',
        key: 'q',
        interaction: { kind: 'question', prompt: 'Continue?', allowText: true },
      });
      await turn.emit({
        kind: 'usage',
        sampleId: 'u',
        basis: 'delta',
        counters: { inputTokens: 3 },
      });
      await turn.emit({
        kind: 'usage',
        sampleId: 'total',
        basis: 'session-cumulative',
        counters: { inputTokens: 5 },
      });
      await turn.emit({
        kind: 'measurement',
        sampleId: 'c',
        metric: 'cost',
        basis: 'delta',
        baseline: true,
        value: { currency: 'USD', amount: '0.01', basis: 'provider-reported', meaning: 'billed' },
      });
      await turn.emit({ kind: 'text', key: 'answer', channel: 'answer', text: 'Done' });
      await turn.emit({ kind: 'outcome', outcome: 'completed' });
      await store!.call({
        op: 'telemetry-refresh-admit',
        sessionId,
        actor: 'user',
        input: { requestId: randomUUID(), groups: ['limits'] },
        binding: { accountScope: 'account', credentialGeneration: 'generation' },
      });
      await store!.call({
        op: 'rename',
        actor: 'user',
        sessionId,
        input: { requestId: randomUUID(), title: 'Kept' },
      });
      await store!.call({
        op: 'cancel',
        actor: 'user',
        sessionId,
        turnId: turn.turnId,
        requestId: randomUUID(),
      });
    }

    const { victimIds, survivorIds } = inspect((db) => ({
      victimIds: identifiers(db, victim),
      survivorIds: identifiers(db, survivor),
    }));
    const before = inspect((db) => ({
      victim: mentions(db, victimIds),
      survivor: mentions(db, survivorIds),
      total: Object.fromEntries(
        tables(db).map((table) => [
          table,
          (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n,
        ]),
      ),
    }));
    // The scenario populates every Session-owned table that current code writes
    // (usage_session is a retained legacy table without writers).
    const populated = Object.entries(before.victim)
      .filter(([, rows]) => rows > 0)
      .map(([table]) => table);
    expect(populated).toEqual(
      expect.arrayContaining([
        'sessions',
        'provider_contexts',
        'turns',
        'entries',
        'work',
        'actions',
        'contents',
        'chunks',
        'content_revisions',
        'text_keys',
        'interactions',
        'requests',
        'facts',
        'usage_samples',
        'usage_basis',
        'events',
        'telemetry_sessions',
        'telemetry_turns',
        'telemetry_samples',
        'telemetry_baselines',
        'telemetry_refresh_requests',
      ]),
    );

    await expect(store!.call({ op: 'delete', sessionId: victim })).resolves.toBeNull();
    const after = inspect((db) => ({
      victim: mentions(db, victimIds),
      survivor: mentions(db, survivorIds),
      meta: (db.prepare('SELECT COUNT(*) AS n FROM meta').get() as { n: number }).n,
    }));
    expect(Object.values(after.victim).every((rows) => rows === 0)).toBe(true);
    expect(after.survivor).toEqual(before.survivor);
    expect(after.meta).toBe(before.total.meta);

    await expect(store!.call({ op: 'delete', sessionId: victim })).rejects.toMatchObject({
      code: 'SESSION_NOT_FOUND',
    });
    await expect(
      store!.call({ op: 'snapshot', sessionId: victim, actor: 'user' }),
    ).rejects.toMatchObject({ code: 'SESSION_NOT_FOUND' });
    // Idempotency records go with the Session: the old create key no longer replays it.
    expect(await create('controlled', createRequest)).not.toBe(victim);
    await expect(
      store!.call({ op: 'snapshot', sessionId: survivor, actor: 'user' }),
    ).resolves.toMatchObject({
      snapshot: { session: { title: 'Kept' } },
    });
  });

  it('refuses delete with a distinct code while Engine effect evidence is unsettled', async () => {
    await open();
    const sessionId = (
      await store!.call<{ sessionId: string }>({
        op: 'create',
        actor: 'user',
        input: { requestId: randomUUID(), providerId: 'controlled', mode: 'workspace-write' },
      })
    ).sessionId;
    const started = await store!.call<StartAdmission>({
      op: 'start',
      actor: 'user',
      sessionId,
      input: { requestId: randomUUID(), message: 'Write' },
      nativeWorkspace: directory,
      nativeScope: 'account',
      nativeWorkspaceIdentity: 'a'.repeat(64),
      effectBinding: 'b'.repeat(64),
    });
    await expect(store!.call({ op: 'delete', sessionId })).rejects.toMatchObject({
      code: 'SESSION_DELETE_BLOCKED',
      details: { turnId: started.turnId },
    });
    await expect(store!.call({ op: 'snapshot', sessionId, actor: 'user' })).resolves.toBeDefined();
  });

  it('allows renaming an archived Session (owner decision)', async () => {
    await open();
    const sessionId = await create();
    await store!.call({
      op: 'archive',
      actor: 'user',
      sessionId,
      input: { requestId: randomUUID() },
    });
    const renamed = await store!.call<SessionView>({
      op: 'rename',
      actor: 'user',
      sessionId,
      input: { requestId: randomUUID(), title: 'Archived title' },
    });
    expect(renamed.session.title).toBe('Archived title');
    expect(typeof renamed.session.archivedAt).toBe('string');
  });

  it('wakes subscribers of a deleted Session after commit', async () => {
    await open();
    const sessionId = await create();
    let woken = 0;
    const unsubscribe = store!.subscribe(sessionId, () => woken++);
    await store!.call({ op: 'delete', sessionId });
    unsubscribe();
    expect(woken).toBe(1);
  });
});

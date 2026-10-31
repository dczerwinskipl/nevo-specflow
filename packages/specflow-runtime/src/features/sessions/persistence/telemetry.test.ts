import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { validateTelemetrySnapshot } from '@nevo/specflow-contracts/sessions';
import { createSessionTelemetry } from './telemetry';
import { initializeSessionSchema } from './schema';
import type { StoredSession, StoredTurn, DriverFact } from './protocol';
import type { Row } from './encoding';
import { openSessionStore } from './store';
import type { StartAdmission } from './protocol';

const databases: DatabaseSync[] = [];
afterEach(() => {
  for (const db of databases.splice(0)) {
    db.close();
  }
});
function fixture() {
  const db = new DatabaseSync(':memory:');
  databases.push(db);
  let time = '2026-10-31T12:00:00.000Z';
  const get = (sql: string, ...args: SQLInputValue[]) =>
    db.prepare(sql).get(...args) as Row | undefined;
  const selectedBatches: number[] = [];
  const all = (sql: string, ...args: SQLInputValue[]) => {
    const rows = db.prepare(sql).all(...args) as Row[];
    if (sql.startsWith('SELECT rowid AS cursor')) {
      selectedBatches.push(rows.length);
    }

    return rows;
  };

  const run = (sql: string, ...args: SQLInputValue[]) => db.prepare(sql).run(...args);
  initializeSessionSchema(db, get);
  const s = {
    ordinal: 0,
    snapshot: {
      revision: 0,
      eventSeq: 0,
      session: { sessionId: '11111111-1111-4111-8111-111111111111' },
    },
  } as StoredSession;
  const events: unknown[] = [];
  const deps = {
    owner: 'test-runtime',
    get,
    all,
    run,
    now: () => time,
    session: () => s,
    emit: (_s: StoredSession, kind: string, changes: unknown) => {
      s.snapshot.eventSeq++;
      events.push({ kind, changes });
    },
  };
  let telemetry = createSessionTelemetry(deps);
  function turn(index: number, usage?: StoredTurn['summary']['usage']) {
    const t = {
      invocationId: 'invocation-' + index,
      cancelRequested: false,
      summary: {
        turnId: `22222222-2222-4222-8222-${String(index).padStart(12, '0')}`,
        state: 'active',
        createdAt: time,
        usage,
      },
    } as StoredTurn;
    // The feature owner only needs normalized Turn metadata, never content/chunks.
    run(
      'INSERT OR IGNORE INTO sessions VALUES(?,?,?,?,?,NULL)',
      s.snapshot.session.sessionId,
      'project',
      0,
      0,
      JSON.stringify(s),
    );
    run(
      'INSERT INTO turns VALUES(?,?,?,?)',
      t.summary.turnId,
      s.snapshot.session.sessionId,
      'terminal',
      JSON.stringify(t),
    );

    return t;
  }

  return {
    db,
    get,
    run,
    s,
    events,
    selectedBatches,
    turn,
    setTime: (next: string) => {
      time = next;
    },
    get telemetry() {
      return telemetry;
    },
    reopen: () => {
      telemetry = createSessionTelemetry(deps);
    },
  };
}

const dollars = (
  sampleId: string,
  amount: string,
  basis: 'delta' | 'turn-total' | 'session-cumulative' = 'turn-total',
  meaning: 'billed' | 'api-equivalent' = 'api-equivalent',
): Extract<DriverFact, { kind: 'measurement' }> => ({
  kind: 'measurement',
  metric: 'cost',
  sampleId,
  basis,
  value: { currency: 'USD', amount, basis: 'provider-reported', meaning },
});

describe('materialized Session telemetry', () => {
  it('maintains exact decimal totals, duplicate identity and Turn coverage across reopen', () => {
    const f = fixture();
    f.telemetry.create(f.s);
    const t = f.turn(1);
    f.telemetry.start(f.s, t);
    t.summary.usage = { inputTokens: 12, outputTokens: 5, cachedTokens: 4 };
    f.telemetry.usage(f.s, t, {
      kind: 'usage',
      sampleId: 'u1',
      basis: 'turn-total',
      counters: t.summary.usage,
    });
    f.telemetry.measurement(f.s, t, dollars('one', '0.1', 'delta'));
    f.telemetry.measurement(f.s, t, dollars('two', '0.2', 'delta'));
    const revision = f.telemetry.read(f.s).revision;
    f.reopen();
    f.telemetry.measurement(f.s, t, dollars('two', '0.2', 'delta'));
    expect(f.telemetry.read(f.s).revision).toBe(revision);
    expect(() => f.telemetry.measurement(f.s, t, dollars('two', '0.3', 'delta'))).toThrow(
      'changed its meaning',
    );
    const snapshot = f.telemetry.read(f.s);
    expect(snapshot.cost.session).toMatchObject({
      status: 'available',
      value: { amount: '0.3', coverage: { complete: true, totalTurns: 1, observedTurns: 1 } },
    });
    expect(snapshot.usage.session).toMatchObject({
      value: {
        inputTokens: 12,
        cacheReadTokens: 4,
        relationships: { cacheReadToInput: 'unknown' },
      },
    });
    expect(validateTelemetrySnapshot({ ...snapshot, accessRevision: 'access-1' })).toBe(true);
    f.telemetry.start(f.s, f.turn(2));
    expect(f.telemetry.read(f.s).usage.session).toMatchObject({
      status: 'partial',
      value: { coverage: { complete: false, observedTurns: 1, totalTurns: 2 } },
    });
  });

  it('does not turn a missing cumulative baseline or a reset into zero or complete accounting', () => {
    const f = fixture();
    f.telemetry.create(f.s);
    const t = f.turn(1);
    f.telemetry.start(f.s, t);
    f.telemetry.measurement(f.s, t, dollars('baseline', '10', 'session-cumulative'));
    expect(f.telemetry.read(f.s).cost.session.status).toBe('unavailable');
    f.telemetry.measurement(f.s, t, dollars('increase', '10.125', 'session-cumulative'));
    expect(f.telemetry.read(f.s).cost.session).toMatchObject({
      status: 'partial',
      value: { amount: '0.125', coverage: { complete: false } },
    });
    f.telemetry.measurement(f.s, t, dollars('reset', '1', 'session-cumulative'));
    f.telemetry.measurement(f.s, t, dollars('after-reset', '1.25', 'session-cumulative'));
    expect(f.telemetry.read(f.s).cost.session).toMatchObject({
      status: 'partial',
      value: { amount: '0.375' },
    });
  });

  it('accepts a positively established fresh zero baseline and refuses incompatible aggregation', () => {
    const f = fixture();
    f.telemetry.create(f.s);
    const t = f.turn(1);
    f.telemetry.start(f.s, t);
    f.telemetry.measurement(f.s, t, dollars('fresh', '0', 'session-cumulative'));
    f.telemetry.measurement(f.s, t, dollars('total', '1.25', 'session-cumulative'));
    expect(f.telemetry.read(f.s).cost.session).toMatchObject({
      status: 'available',
      value: { amount: '1.25' },
    });
    const next = f.turn(2);
    f.telemetry.start(f.s, next);
    f.telemetry.measurement(f.s, next, dollars('billed', '2', 'turn-total', 'billed'));
    expect(f.telemetry.read(f.s).cost.session).toMatchObject({
      status: 'partial',
      value: { amount: '1.25', meaning: 'api-equivalent' },
    });
  });

  it('marks missing token dimensions partial and rejects overlapping cost bases', () => {
    const f = fixture();
    f.telemetry.create(f.s);
    const first = f.turn(1, { inputTokens: 10, outputTokens: 5 });
    f.telemetry.start(f.s, first);
    f.telemetry.usage(f.s, first, {
      kind: 'usage',
      sampleId: 'one',
      basis: 'turn-total',
      counters: first.summary.usage!,
    });
    f.telemetry.measurement(f.s, first, dollars('base', '0', 'session-cumulative'));
    f.telemetry.measurement(f.s, first, dollars('cost', '1', 'session-cumulative'));
    expect(() => f.telemetry.measurement(f.s, first, dollars('mixed', '3', 'turn-total'))).toThrow(
      'cannot mix',
    );
    const second = f.turn(2, { inputTokens: 20 });
    f.telemetry.start(f.s, second);
    f.telemetry.usage(f.s, second, {
      kind: 'usage',
      sampleId: 'two',
      basis: 'turn-total',
      counters: second.summary.usage!,
    });
    expect(f.telemetry.read(f.s).usage.session).toMatchObject({
      status: 'partial',
      value: {
        inputTokens: 30,
        outputTokens: 5,
        coverage: { complete: false, observedTurns: 2, totalTurns: 2 },
      },
    });
    f.telemetry.measurement(f.s, second, dollars('turn-two', '2'));
    const third = f.turn(3);
    f.telemetry.start(f.s, third);
    f.telemetry.measurement(f.s, third, dollars('new-baseline', '4', 'session-cumulative'));
    f.telemetry.measurement(f.s, third, dollars('new-total', '5', 'session-cumulative'));
    expect(f.telemetry.read(f.s).cost.session).toMatchObject({
      status: 'partial',
      value: { amount: '4', coverage: { complete: false } },
    });
  });

  it('migrates v1 metadata in bounded restart-safe batches without double-counting live ledgers', () => {
    const f = fixture();
    for (let n = 1; n <= 205; n++) {
      f.turn(n, { inputTokens: n });
    }

    f.db.exec('PRAGMA user_version=1');
    initializeSessionSchema(f.db, f.get);
    expect(f.get('PRAGMA user_version')?.user_version).toBe(2);
    expect(f.telemetry.read(f.s).usage.session).toMatchObject({
      status: 'unavailable',
      reason: 'BASELINE_MISSING',
    });
    expect(f.telemetry.migrate()).toEqual({ done: false });
    f.reopen();
    const live = f.turn(206, { inputTokens: 9 });
    f.telemetry.start(f.s, live);
    f.telemetry.usage(f.s, live, {
      kind: 'usage',
      sampleId: 'live',
      basis: 'turn-total',
      counters: { inputTokens: 9 },
    });
    while (!f.telemetry.migrate().done) {
      /* each call is an independently committed worker batch */
    }

    expect(f.selectedBatches).toEqual([100, 100, 5]);
    const snapshot = f.telemetry.read(f.s);
    expect(snapshot.usage.session).toMatchObject({
      status: 'partial',
      value: {
        inputTokens: 21124,
        coverage: { complete: false, totalTurns: 206, observedTurns: 206 },
      },
    });
    expect(snapshot.usage.turn?.turnId).toBe(live.summary.turnId);
    expect(f.telemetry.migrate()).toEqual({ done: true });
  });

  it('persists expiry, preserves failed-refresh observations and fences account limits', () => {
    const f = fixture();
    f.telemetry.create(f.s);
    const sample: Extract<DriverFact, { kind: 'measurement' }> = {
      kind: 'measurement',
      metric: 'limits',
      sampleId: 'limits',
      value: { windows: [{ windowId: 'weekly', scope: 'account', unit: 'percent', used: '25' }] },
    };
    f.telemetry.observations(f.s, [sample], 'account-a');
    expect(f.telemetry.read(f.s, 'account-b').limits).toMatchObject({
      status: 'unavailable',
      reason: 'NOT_OBSERVED',
    });
    f.setTime('2026-10-31T12:01:01.000Z');
    expect(f.telemetry.expire(f.s)).toBe(true);
    const revision = f.telemetry.read(f.s).revision;
    expect(f.telemetry.expire(f.s)).toBe(false);
    expect(f.telemetry.read(f.s).revision).toBe(revision);
    f.telemetry.refreshState(f.s, 'idle', ['limits'], true);
    f.reopen();
    expect(f.telemetry.read(f.s, 'account-a').limits).toMatchObject({
      freshness: 'stale',
      reason: 'REFRESH_FAILED',
      observedAt: '2026-10-31T12:00:00.000Z',
      value: { windows: [{ used: '25' }] },
    });
  });

  it('initializes synthetic baselines without inventing observed usage or spend', () => {
    const f = fixture();
    f.telemetry.create(f.s);
    const first = f.turn(1, { inputTokens: 0 });
    f.telemetry.start(f.s, first);
    f.telemetry.usage(f.s, first, {
      kind: 'usage',
      sampleId: 'baseline',
      basis: 'session-cumulative',
      baseline: true,
      counters: { inputTokens: 0 },
    });
    f.telemetry.measurement(f.s, first, {
      ...dollars('baseline', '0', 'session-cumulative'),
      baseline: true,
    } as Extract<DriverFact, { kind: 'measurement'; metric: 'cost' }>);
    expect(f.telemetry.read(f.s).usage.session.status).toBe('unavailable');
    expect(f.telemetry.read(f.s).cost.session.status).toBe('unavailable');
    f.telemetry.terminal(f.s, first);
    const second = f.turn(2, { inputTokens: 20 });
    f.telemetry.start(f.s, second);
    f.telemetry.usage(f.s, second, {
      kind: 'usage',
      sampleId: 'after-lost-result',
      basis: 'session-cumulative',
      counters: { inputTokens: 20 },
    });
    f.telemetry.measurement(f.s, second, dollars('after-lost-result', '5', 'session-cumulative'));
    expect(f.telemetry.read(f.s).usage.turn?.reading.status).toBe('unavailable');
    expect(f.telemetry.read(f.s).cost.turn?.reading.status).toBe('unavailable');
  });

  it('does not attribute cumulative spend across a Turn missing native samples', () => {
    const f = fixture();
    f.telemetry.create(f.s);
    const first = f.turn(1);
    f.telemetry.start(f.s, first);
    const usage = (
      turn: StoredTurn,
      sampleId: string,
      inputTokens: number,
      summaryTokens: number,
    ) => {
      turn.summary.usage = { inputTokens: summaryTokens };
      f.telemetry.usage(f.s, turn, {
        kind: 'usage',
        sampleId,
        basis: 'session-cumulative',
        counters: { inputTokens },
      });
    };

    usage(first, 'fresh', 0, 0);
    usage(first, 'one', 10, 10);
    f.telemetry.measurement(f.s, first, dollars('fresh', '0', 'session-cumulative'));
    f.telemetry.measurement(f.s, first, dollars('one', '1', 'session-cumulative'));
    f.telemetry.terminal(f.s, first);
    const missing = f.turn(2);
    f.telemetry.start(f.s, missing);
    f.telemetry.terminal(f.s, missing);
    f.reopen();
    const third = f.turn(3);
    f.telemetry.start(f.s, third);
    usage(third, 'three', 30, 20);
    f.telemetry.measurement(f.s, third, dollars('three', '6', 'session-cumulative'));
    expect(f.telemetry.read(f.s).usage.turn?.reading.status).toBe('unavailable');
    expect(f.telemetry.read(f.s).cost.turn?.reading.status).toBe('unavailable');
    usage(third, 'four', 35, 25);
    f.telemetry.measurement(f.s, third, dollars('four', '7', 'session-cumulative'));
    expect(f.telemetry.read(f.s).usage.turn?.reading).toMatchObject({
      status: 'partial',
      value: { inputTokens: 5, coverage: { complete: false } },
    });
    expect(f.telemetry.read(f.s).cost.turn?.reading).toMatchObject({
      status: 'partial',
      value: { amount: '1', coverage: { complete: false } },
    });
    expect(f.telemetry.read(f.s).usage.session).toMatchObject({
      status: 'partial',
      value: { inputTokens: 15 },
    });
    expect(f.telemetry.read(f.s).cost.session).toMatchObject({
      status: 'partial',
      value: { amount: '2' },
    });
  });

  it('initializes empty legacy Sessions after migration without inventing historical Turns', () => {
    const f = fixture();
    while (!f.telemetry.migrate().done) {
      /* no old Turns */
    }

    const t = f.turn(1, { inputTokens: 3 });
    f.telemetry.start(f.s, t);
    f.telemetry.usage(f.s, t, {
      kind: 'usage',
      sampleId: 'first',
      basis: 'turn-total',
      counters: { inputTokens: 3 },
    });
    expect(f.telemetry.read(f.s).usage.session).toMatchObject({
      status: 'available',
      value: { inputTokens: 3, coverage: { complete: true, observedTurns: 1, totalTurns: 1 } },
    });
  });

  it('fences credential generations and preserves source observation time during cache fanout', () => {
    const f = fixture();
    f.telemetry.create(f.s);
    const sample: Extract<DriverFact, { kind: 'measurement' }> = {
      kind: 'measurement',
      metric: 'limits',
      sampleId: 'limits',
      value: { windows: [{ windowId: 'weekly', scope: 'account', unit: 'percent', used: '25' }] },
    };
    f.telemetry.observationFence(f.s, 'account-a', 'credential-one');
    f.telemetry.observations(
      f.s,
      [sample],
      'account-a',
      '2026-10-31T12:00:00.000Z',
      'credential-one',
    );
    f.telemetry.observationFence(f.s, 'account-a', 'credential-two');
    expect(() =>
      f.telemetry.observations(
        f.s,
        [sample],
        'account-a',
        '2026-10-31T12:00:00.000Z',
        'credential-one',
      ),
    ).toThrow('generation changed');
    expect(f.telemetry.read(f.s, 'account-a').limits.status).toBe('unavailable');
    f.setTime('2026-10-31T12:01:10.000Z');
    f.telemetry.observations(
      f.s,
      [sample],
      'account-a',
      '2026-10-31T12:00:00.000Z',
      'credential-two',
    );
    expect(f.telemetry.read(f.s, 'account-a').limits).toMatchObject({
      freshness: 'stale',
      observedAt: '2026-10-31T12:00:00.000Z',
      staleAt: '2026-10-31T12:01:00.000Z',
    });
    expect(() =>
      f.telemetry.observations(
        f.s,
        [sample],
        'account-a',
        '2026-10-31T12:02:00.000Z',
        'credential-two',
      ),
    ).toThrow('timestamp');
  });

  it('ignores an old refresh failure after a new credential generation owns the reading', () => {
    const f = fixture();
    f.telemetry.create(f.s);
    f.telemetry.observationFence(f.s, 'account-a', 'old');
    f.telemetry.refreshState(f.s, 'running', ['limits'], false, 'old');
    f.telemetry.observationFence(f.s, 'account-a', 'new');
    f.telemetry.refreshState(f.s, 'running', ['limits'], false, 'new');
    f.telemetry.observations(
      f.s,
      [
        {
          kind: 'measurement',
          metric: 'limits',
          sampleId: 'new',
          value: {
            windows: [{ windowId: 'weekly', scope: 'account', unit: 'percent', used: '20' }],
          },
        },
      ],
      'account-a',
      '2026-10-31T12:00:00.000Z',
      'new',
    );
    const before = f.telemetry.read(f.s, 'account-a');
    f.telemetry.refreshState(f.s, 'idle', ['limits'], true, 'old');
    expect(f.telemetry.read(f.s, 'account-a')).toEqual(before);
    f.telemetry.refreshState(f.s, 'idle', [], false, 'new');
    const completed = f.telemetry.read(f.s, 'account-a');
    f.telemetry.refreshState(f.s, 'idle', ['limits'], true, 'old');
    expect(f.telemetry.read(f.s, 'account-a')).toEqual(completed);
    expect(completed.limits).toMatchObject({
      freshness: 'fresh',
      value: { windows: [{ used: '20' }] },
    });
  });

  it('merges native window updates without renewing older windows and replaces full snapshots', () => {
    const f = fixture();
    f.telemetry.create(f.s);
    const t = f.turn(1);
    f.telemetry.start(f.s, t);
    f.run(
      'INSERT INTO provider_contexts VALUES(?,?,?,?,?,?)',
      f.s.snapshot.session.sessionId,
      'native',
      'workspace',
      1,
      1,
      'account-a',
    );
    const update = (
      sampleId: string,
      windowId: string,
      windowUpdate = true,
    ): Extract<DriverFact, { kind: 'measurement'; metric: 'limits' }> => ({
      kind: 'measurement',
      metric: 'limits',
      sampleId,
      ...(windowUpdate ? { windowUpdate: true as const } : {}),
      value: { windows: [{ windowId, scope: 'account', unit: 'percent', used: '10' }] },
    });
    f.telemetry.measurement(f.s, t, update('one', 'five_hour'));
    f.setTime('2026-10-31T12:00:30.000Z');
    f.telemetry.measurement(f.s, t, update('two', 'seven_day'));
    expect(f.telemetry.read(f.s, 'account-a').limits).toMatchObject({
      observedAt: '2026-10-31T12:00:00.000Z',
      staleAt: '2026-10-31T12:01:00.000Z',
      value: { windows: [{ windowId: 'five_hour' }, { windowId: 'seven_day' }] },
    });
    f.setTime('2026-10-31T12:01:05.000Z');
    f.telemetry.measurement(f.s, t, update('three', 'seven_day'));
    expect(f.telemetry.read(f.s, 'account-a').limits).toMatchObject({
      freshness: 'stale',
      observedAt: '2026-10-31T12:00:00.000Z',
    });
    f.telemetry.measurement(f.s, t, update('four', 'seven_day', false));
    expect(f.telemetry.read(f.s, 'account-a').limits).toMatchObject({
      freshness: 'fresh',
      observedAt: '2026-10-31T12:01:05.000Z',
      value: { windows: [{ windowId: 'seven_day' }] },
    });
    const reading = f.telemetry.read(f.s, 'account-a').limits;
    expect(reading.status).not.toBe('unavailable');
    if (reading.status !== 'unavailable') {
      expect(reading.value.windows).toHaveLength(1);
    }

    f.run('UPDATE provider_contexts SET scope=?', 'account-b');
    f.telemetry.measurement(f.s, t, update('five', 'five_hour'));
    const changedAccount = f.telemetry.read(f.s, 'account-b').limits;
    expect(changedAccount.status).not.toBe('unavailable');
    if (changedAccount.status !== 'unavailable') {
      expect(changedAccount.value.windows).toHaveLength(1);
    }
  });

  it('retires context on input without changing historical usage observation time', () => {
    const f = fixture();
    f.telemetry.create(f.s);
    const t = f.turn(1, { inputTokens: 10 });
    f.telemetry.start(f.s, t);
    f.telemetry.usage(f.s, t, {
      kind: 'usage',
      sampleId: 'u',
      basis: 'turn-total',
      counters: { inputTokens: 10 },
    });
    f.telemetry.measurement(f.s, t, {
      kind: 'measurement',
      metric: 'context',
      sampleId: 'c',
      value: { contextGeneration: 'ctx-a', occupiedTokens: 5 },
    });
    f.setTime('2026-10-31T12:01:00.000Z');
    f.telemetry.start(f.s, f.turn(2));
    expect(f.telemetry.read(f.s).context).toMatchObject({
      status: 'unavailable',
      reason: 'NOT_OBSERVED',
    });
    expect(f.telemetry.read(f.s).usage.session.observedAt).toBe('2026-10-31T12:00:00.000Z');
  });

  it('expires context observations after one minute even across reopen without new input', () => {
    const f = fixture();
    f.telemetry.create(f.s);
    const t = f.turn(1);
    f.telemetry.start(f.s, t);
    f.run(
      'INSERT INTO provider_contexts VALUES(?,?,?,?,?,?)',
      f.s.snapshot.session.sessionId,
      'native',
      'workspace',
      1,
      1,
      'account-a',
    );
    f.telemetry.measurement(f.s, t, {
      kind: 'measurement',
      metric: 'context',
      sampleId: 'context',
      value: { contextGeneration: 'context-a', occupiedTokens: 50 },
    });
    expect(f.telemetry.read(f.s, 'account-a').context).toMatchObject({
      freshness: 'fresh',
      staleAt: '2026-10-31T12:01:00.000Z',
    });
    const before = f.events.length;
    f.setTime('2026-10-31T12:01:00.000Z');
    f.reopen();
    expect(f.telemetry.read(f.s, 'account-a').context).toMatchObject({
      freshness: 'stale',
      value: { occupiedTokens: 50 },
    });
    // The read projects freshness without emitting an outbox write.
    expect(f.events).toHaveLength(before);
    f.telemetry.expire(f.s);
    expect(f.events).toHaveLength(before + 1);
    f.telemetry.expire(f.s);
    expect(f.events).toHaveLength(before + 1);
  });

  it('hides a context gauge after account change or absent verified scope while retaining usage', () => {
    const f = fixture();
    f.telemetry.create(f.s);
    const t = f.turn(1, { inputTokens: 10 });
    f.telemetry.start(f.s, t);
    f.run(
      'INSERT INTO provider_contexts VALUES(?,?,?,?,?,?)',
      f.s.snapshot.session.sessionId,
      'native',
      'workspace',
      1,
      1,
      'account-a',
    );
    f.telemetry.usage(f.s, t, {
      kind: 'usage',
      sampleId: 'u',
      basis: 'turn-total',
      counters: { inputTokens: 10 },
    });
    f.telemetry.measurement(f.s, t, {
      kind: 'measurement',
      metric: 'context',
      sampleId: 'context-a',
      value: { contextGeneration: 'context-a', occupiedTokens: 50 },
    });
    expect(f.telemetry.read(f.s, 'account-a').context).toMatchObject({
      status: 'available',
      value: { occupiedTokens: 50 },
    });
    expect(f.telemetry.read(f.s).context.status).toBe('unavailable');
    expect(f.telemetry.read(f.s, 'account-b').context.status).toBe('unavailable');
    f.telemetry.observationFence(f.s, 'account-b', 'credential-b');
    expect(f.telemetry.read(f.s, 'account-a').context.status).toBe('unavailable');
    expect(f.telemetry.read(f.s, 'account-b').usage.session).toMatchObject({
      value: { inputTokens: 10 },
    });
  });

  it('publishes terminal telemetry and restores bounded aggregates and refresh receipts through the Worker', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'nevo-telemetry-'));
    let store = await openSessionStore({ directory, projectId: 'telemetry' });
    try {
      const { sessionId } = await store.call<{ sessionId: string }>({
        op: 'create',
        actor: 'actor',
        input: { requestId: randomUUID(), providerId: 'mock', mode: 'read-only' },
      });
      const admitted = await store.call<StartAdmission>({
        op: 'start',
        sessionId,
        actor: 'actor',
        input: { requestId: randomUUID(), message: 'usage' },
      });
      const fact = (driverSeq: number, value: DriverFact) =>
        store.call({
          op: 'fact',
          sessionId,
          turnId: admitted.turnId,
          invocationId: admitted.invocationId,
          driverSeq,
          fact: value,
        });
      await fact(1, {
        kind: 'usage',
        sampleId: 'native',
        basis: 'turn-total',
        counters: { inputTokens: 22 },
      });
      await fact(2, dollars('cost', '0.000000000001'));
      await fact(3, { kind: 'outcome', outcome: 'completed' });
      const snapshot = await store.call<
        ReturnType<ReturnType<typeof createSessionTelemetry>['read']>
      >({ op: 'telemetry', sessionId });
      expect(snapshot.usage.session).toMatchObject({
        status: 'available',
        value: { inputTokens: 22 },
      });
      expect(snapshot.cost.session).toMatchObject({ value: { amount: '0.000000000001' } });
      expect(store.readMetrics()).toMatchObject({ rows: 2, contentBytes: 0 });
      const input = { requestId: randomUUID(), groups: ['limits' as const] };
      const receipt = await store.call({
        op: 'telemetry-refresh-admit',
        sessionId,
        actor: 'actor',
        input,
      });
      await store.close();
      store = await openSessionStore({ directory, projectId: 'telemetry' });
      expect(
        await store.call({ op: 'telemetry-refresh-admit', sessionId, actor: 'actor', input }),
      ).toEqual({ ...(receipt as object), fresh: false });
      await expect(
        store.call({
          op: 'telemetry-refresh-replay',
          sessionId,
          actor: 'actor',
          input: { ...input, groups: ['context'] },
        }),
      ).rejects.toMatchObject({ code: 'IDEMPOTENCY_CONFLICT' });
      while (!(await store.call<{ done: boolean }>({ op: 'telemetry-migrate' })).done) {
        /* bounded startup recovery */
      }

      const restored = await store.call<typeof snapshot>({ op: 'telemetry', sessionId });
      expect(restored.refresh).toEqual({ state: 'idle', groups: [] });
      expect(restored.limits).toMatchObject({ status: 'unavailable' });
      expect(restored.cost).toEqual(snapshot.cost);
      expect(restored.usage).toEqual(snapshot.usage);
      const events = await store.call<{ events: { kind: string }[] }>({
        op: 'events',
        sessionId,
        after: 0,
      });
      expect(events.events.some((event) => event.kind === 'telemetry')).toBe(true);
    } finally {
      await store.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

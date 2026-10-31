import { createHash } from 'node:crypto';
import type {
  SessionChange,
  TelemetrySnapshot,
  TelemetryTokenUsage,
  TelemetryMoneyUsage,
  TelemetryReading,
  TelemetryContextUsage,
  TelemetryLimitsUsage,
  TelemetryGroup,
} from '@nevo/specflow-contracts/sessions';
import type { StoreDatabase } from './database';
import type { StoredSession, StoredTurn, DriverFact } from './protocol';
import { fail, stable } from './encoding';

type Tokens = Omit<TelemetryTokenUsage, 'coverage' | 'relationships'>;
type Money = Omit<TelemetryMoneyUsage, 'coverage'>;
type Measurement = Extract<DriverFact, { kind: 'measurement' }>;
interface TurnLedger {
  order: number;
  turnId: string;
  at: string;
  usage?: Tokens;
  usageIncomplete?: boolean;
  usageAt?: string;
  cost?: Money;
  costIncomplete?: boolean;
  costAt?: string;
  costBasis?: 'delta' | 'turn-total' | 'session-cumulative';
}
interface Ledger {
  baselineReady?: boolean;
  revision: number;
  totalTurns: number;
  observedUsage: number;
  observedCost: number;
  incompleteUsage: number;
  incompleteCost: number;
  usage: Tokens;
  usageDimensions: Partial<Record<keyof Tokens, number>>;
  cost?: Money;
  incompatibleCost: boolean;
  usageAt?: string;
  costAt?: string;
  latest?: TurnLedger;
  context?: TelemetryReading<TelemetryContextUsage>;
  limits?: TelemetryReading<TelemetryLimitsUsage>;
  limitsScope?: string;
  limitsGeneration?: string;
  limitWindowTimes?: Record<string, string>;
  observationFence?: { scope: string; generation: string };
  refresh: TelemetrySnapshot['refresh'];
  refreshOwner?: string;
}
const tokenKeys = [
  'inputTokens',
  'outputTokens',
  'cacheReadTokens',
  'cacheWriteTokens',
  'reasoningTokens',
] as const;
const relationships = {
  cacheReadToInput: 'unknown',
  cacheWriteToInput: 'unknown',
  reasoningToOutput: 'unknown',
} as const;
const scale = 1_000_000_000_000n;
/** Integer decimal arithmetic preserves the public twelve-place monetary precision. */
function decimal(value: string): bigint {
  if (!/^(0|[1-9][0-9]{0,15})(\.[0-9]{1,12})?$/.test(value)) {
    return fail('SESSION_INPUT_INVALID', 'Invalid telemetry decimal.');
  }

  const [whole, fraction = ''] = value.split('.');

  return BigInt(whole!) * scale + BigInt(fraction.padEnd(12, '0'));
}

function money(value: bigint): string {
  if (value < 0n || value >= 10_000_000_000_000_000n * scale) {
    return fail('SESSION_INPUT_INVALID', 'Telemetry decimal overflow.');
  }

  const fraction = (value % scale).toString().padStart(12, '0').replace(/0+$/, '');

  return (value / scale).toString() + (fraction ? '.' + fraction : '');
}

function safe(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    return fail('SESSION_INPUT_INVALID', 'Telemetry counter overflow.');
  }

  return value;
}

function sameMoney(a: Money, b: Money) {
  return a.currency === b.currency && a.basis === b.basis && a.meaning === b.meaning;
}

function unavailable(
  reason: TelemetryReading<never>['reason'] = 'NOT_OBSERVED',
): TelemetryReading<never> {
  return { status: 'unavailable', freshness: 'unknown', reason, refreshable: false };
}

/** Materialized telemetry shares the caller's transaction and existing outbox owner. */
export function createSessionTelemetry(
  deps: StoreDatabase & {
    owner: string;
    now(this: void): string;
    session(this: void, id: string): StoredSession;
    emit(this: void, s: StoredSession, kind: SessionChange['kind'], changes: unknown): void;
  },
) {
  const { get, all, run, now, emit } = deps;
  const readJson = <T>(sql: string, ...args: string[]): T | undefined => {
    const row = get(sql, ...args);

    return row ? (JSON.parse(String(row.data)) as T) : undefined;
  };

  function load(sessionId: string): Ledger {
    return (
      readJson<Ledger>('SELECT data FROM telemetry_sessions WHERE session=?', sessionId) ?? {
        baselineReady:
          get("SELECT value FROM meta WHERE key='telemetry-migration-phase'")?.value ===
            'publish' ||
          get("SELECT value FROM meta WHERE key='telemetry-migration-done'")?.value === '1',
        revision: 0,
        totalTurns: 0,
        observedUsage: 0,
        observedCost: 0,
        incompleteUsage: 0,
        incompleteCost: 0,
        usage: {},
        usageDimensions: {},
        incompatibleCost: false,
        refresh: { state: 'idle', groups: [] },
      }
    );
  }

  function save(s: StoredSession, data: Ledger) {
    data.revision = safe(data.revision + 1);
    run(
      'INSERT OR REPLACE INTO telemetry_sessions VALUES(?,?)',
      s.snapshot.session.sessionId,
      JSON.stringify(data),
    );
    emit(s, 'telemetry', { telemetryRevision: data.revision });
  }

  function ledger(turn: StoredTurn): TurnLedger {
    return {
      order: Number(
        get('SELECT rowid AS ordinal FROM turns WHERE id=?', turn.summary.turnId)?.ordinal ?? 0,
      ),
      turnId: turn.summary.turnId,
      at: turn.summary.createdAt,
    };
  }

  function update(s: StoredSession, next: TurnLedger) {
    const sid = s.snapshot.session.sessionId;
    const old = readJson<TurnLedger>('SELECT data FROM telemetry_turns WHERE turn=?', next.turnId);
    if (old && stable(old) === stable(next)) {
      return;
    }

    const data = load(sid);
    if (!old) {
      data.totalTurns = safe(data.totalTurns + 1);
    }

    data.observedUsage += Number(!!next.usage) - Number(!!old?.usage);
    data.incompleteUsage += Number(!!next.usageIncomplete) - Number(!!old?.usageIncomplete);
    data.usageDimensions ??= {};
    for (const key of tokenKeys) {
      data.usageDimensions[key] =
        (data.usageDimensions[key] ?? 0) +
        Number(next.usage?.[key] !== undefined) -
        Number(old?.usage?.[key] !== undefined);
      if (next.usage?.[key] !== undefined || old?.usage?.[key] !== undefined) {
        data.usage[key] = safe(
          (data.usage[key] ?? 0) + (next.usage?.[key] ?? 0) - (old?.usage?.[key] ?? 0),
        );
        if (!data.usageDimensions[key]) {
          delete data.usage[key];
        }
      }
    }

    data.observedCost += Number(!!next.cost) - Number(!!old?.cost);
    data.incompleteCost += Number(!!next.costIncomplete) - Number(!!old?.costIncomplete);
    if (next.cost) {
      data.cost ??= { ...next.cost, amount: '0' };

      if (sameMoney(data.cost, next.cost) && (!old?.cost || sameMoney(data.cost, old.cost))) {
        data.cost.amount = money(
          decimal(data.cost.amount) + decimal(next.cost.amount) - decimal(old?.cost?.amount ?? '0'),
        );
      } else {
        data.incompatibleCost = true;
      }
    }

    if (!data.latest || next.order >= data.latest.order || next.turnId === data.latest.turnId) {
      data.latest = next;
    }

    if (next.usageAt) {
      data.usageAt = next.usageAt;
    }

    if (next.costAt) {
      data.costAt = next.costAt;
    }

    run(
      'INSERT OR REPLACE INTO telemetry_turns VALUES(?,?,?)',
      next.turnId,
      sid,
      JSON.stringify(next),
    );
    save(s, data);
  }

  function start(s: StoredSession, t: StoredTurn) {
    update(s, ledger(t));
    const data = load(s.snapshot.session.sessionId);
    if (data.context?.value) {
      data.context = unavailable('NOT_OBSERVED');
      save(s, data);
    }
  }

  function usage(s: StoredSession, t: StoredTurn, f: Extract<DriverFact, { kind: 'usage' }>) {
    const old =
      readJson<TurnLedger>('SELECT data FROM telemetry_turns WHERE turn=?', t.summary.turnId) ??
      ledger(t);
    const counters = t.summary.usage as Record<string, number> | undefined;
    const next: Tokens = {};
    for (const key of tokenKeys) {
      const value = counters?.[key === 'cacheReadTokens' ? 'cachedTokens' : key] ?? counters?.[key];
      if (value !== undefined) {
        next[key] = safe(value);
      }
    }

    // A first cumulative sample establishes a baseline, not a zero-valued Turn.
    if (Object.keys(next).length) {
      old.usage = next;
      old.usageAt = now();
    }

    if (f.basis === 'session-cumulative') {
      const baseline = readJson<Record<string, number>>(
        'SELECT data FROM telemetry_baselines WHERE session=? AND metric=?',
        s.snapshot.session.sessionId,
        'usage',
      );
      if (
        (!baseline && Object.values(f.counters).some((value) => value !== 0)) ||
        (baseline &&
          Object.entries(f.counters).some(
            ([key, value]) => baseline[key] === undefined || value < baseline[key],
          ))
      ) {
        old.usageIncomplete = true;
      }

      run(
        'INSERT OR REPLACE INTO telemetry_baselines VALUES(?,?,?)',
        s.snapshot.session.sessionId,
        'usage',
        JSON.stringify(f.counters),
      );
    }

    update(s, old);
  }

  function limitsObservation(
    data: Ledger,
    fact: Extract<Measurement, { metric: 'limits' }>,
    observedAt: string,
    scope?: string,
    generation?: string,
  ) {
    const windows = new Map<
      string,
      { window: TelemetryLimitsUsage['windows'][number]; at: string }
    >();
    const previous = data.limits;
    if (
      fact.windowUpdate &&
      scope !== undefined &&
      data.limitsScope === scope &&
      data.limitsGeneration === generation &&
      previous?.value &&
      previous.observedAt
    ) {
      for (const window of previous.value.windows) {
        windows.set(window.windowId, {
          window,
          at: data.limitWindowTimes?.[window.windowId] ?? previous.observedAt,
        });
      }
    }

    for (const window of fact.value.windows) {
      windows.set(window.windowId, { window, at: observedAt });
    }

    if (windows.size > 16) {
      fail('SESSION_PAYLOAD_TOO_LARGE', 'Too many telemetry limit windows.');
    }

    const oldest = [...windows.values()].map((item) => item.at).sort()[0] ?? observedAt;
    const staleAt = new Date(Date.parse(oldest) + 60_000).toISOString();
    data.limits = {
      status: 'available',
      freshness: staleAt <= now() ? 'stale' : 'fresh',
      observedAt: oldest,
      staleAt,
      source: 'provider-reported',
      refreshable: false,
      value: { windows: [...windows.values()].map((item) => item.window) },
    };
    data.limitWindowTimes = Object.fromEntries([...windows].map(([id, item]) => [id, item.at]));
    data.limitsScope = scope;
    data.limitsGeneration = generation;
  }

  function measurement(s: StoredSession, t: StoredTurn, f: Measurement) {
    const sid = s.snapshot.session.sessionId;
    const hash = createHash('sha256').update(stable(f)).digest('hex');
    const sample = get(
      'SELECT hash FROM telemetry_samples WHERE invocation=? AND metric=? AND sample=?',
      t.invocationId,
      f.metric,
      f.sampleId,
    );
    if (sample) {
      if (sample.hash !== hash) {
        fail('SESSION_INPUT_INVALID', 'Telemetry sample changed its meaning.');
      }

      return;
    }

    run(
      'INSERT INTO telemetry_samples VALUES(?,?,?,?)',
      t.invocationId,
      f.metric,
      f.sampleId,
      hash,
    );
    if (f.metric !== 'cost') {
      const data = load(sid);
      const reading = {
        status: 'available' as const,
        freshness: 'fresh' as const,
        observedAt: now(),
        source: 'provider-reported' as const,
        refreshable: false,
        value: f.value,
      };
      if (f.metric === 'context') {
        data.context = reading as TelemetryReading<TelemetryContextUsage>;
      } else {
        const scope = get('SELECT scope FROM provider_contexts WHERE session=?', sid)?.scope;
        limitsObservation(
          data,
          f,
          reading.observedAt,
          typeof scope === 'string' ? scope : undefined,
        );
      }

      save(s, data);

      return;
    }

    const next =
      readJson<TurnLedger>('SELECT data FROM telemetry_turns WHERE turn=?', t.summary.turnId) ??
      ledger(t);
    if (next.costBasis && next.costBasis !== f.basis) {
      fail('SESSION_INPUT_INVALID', 'A Turn cannot mix monetary accounting bases.');
    }

    next.costBasis = f.basis;
    if (f.basis !== 'session-cumulative') {
      // An intervening noncumulative Turn supplies no continuation baseline.
      // Reusing an older native total could count that Turn a second time.
      run('DELETE FROM telemetry_baselines WHERE session=? AND metric=?', sid, 'cost');
    }

    const value: Money = f.value;
    const amount = decimal(value.amount);
    if (f.basis === 'turn-total') {
      next.cost = value;
    } else if (f.basis === 'delta') {
      if (next.cost && !sameMoney(next.cost, value)) {
        fail('SESSION_INPUT_INVALID', 'Incompatible monetary samples.');
      }

      next.cost = { ...value, amount: money(decimal(next.cost?.amount ?? '0') + amount) };
    } else {
      const previous = readJson<Money>(
        'SELECT data FROM telemetry_baselines WHERE session=? AND metric=?',
        sid,
        'cost',
      );
      if (previous && sameMoney(previous, value) && amount >= decimal(previous.amount)) {
        if (next.cost && !sameMoney(next.cost, value)) {
          fail('SESSION_INPUT_INVALID', 'Incompatible monetary samples.');
        }

        next.cost = {
          ...value,
          amount: money(decimal(next.cost?.amount ?? '0') + amount - decimal(previous.amount)),
        };
      } else if (amount !== 0n || previous) {
        next.costIncomplete = true;
      }

      run(
        'INSERT OR REPLACE INTO telemetry_baselines VALUES(?,?,?)',
        sid,
        'cost',
        JSON.stringify(value),
      );
    }

    if (next.cost) {
      next.costAt = now();
    }

    update(s, next);
  }

  function read(
    s: StoredSession,
    expectedScope?: string,
  ): Omit<TelemetrySnapshot, 'accessRevision'> {
    const data = load(s.snapshot.session.sessionId);
    const ready = data.baselineReady === true;
    const coverage = (observed: number, incomplete: number) => ({
      complete: ready && !incomplete && observed === data.totalTurns,
      observedTurns: observed,
      totalTurns: data.totalTurns,
    });
    const reading = <T>(
      value: T | undefined,
      complete: boolean,
      source: 'runtime-aggregate' | 'provider-reported',
      observedAt?: string,
    ): TelemetryReading<T> =>
      value === undefined
        ? unavailable(ready ? 'NOT_OBSERVED' : 'BASELINE_MISSING')
        : {
            status: complete ? 'available' : 'partial',
            freshness: observedAt ? 'fresh' : 'unknown',
            source,
            refreshable: false,
            ...(observedAt ? { observedAt } : {}),
            value,
            ...(!complete ? { reason: 'BASELINE_MISSING' as const } : {}),
          };
    const missingDimensions = Object.values(data.usageDimensions).some(
      (count) => count > 0 && count !== data.totalTurns,
    );
    const usageCoverage = coverage(
      data.observedUsage,
      data.incompleteUsage + Number(missingDimensions),
    );
    const costCoverage = coverage(
      data.observedCost,
      data.incompleteCost + Number(data.incompatibleCost),
    );
    const latest = data.latest;
    const projectGauge = <T>(value: TelemetryReading<T> | undefined): TelemetryReading<T> => {
      if (!value) {
        return unavailable('NOT_SUPPORTED');
      }

      return value.staleAt && value.staleAt <= now() ? { ...value, freshness: 'stale' } : value;
    };

    return {
      sessionId: s.snapshot.session.sessionId,
      revision: data.revision,
      eventSeq: s.snapshot.eventSeq,
      usage: {
        session: reading(
          ready && data.observedUsage
            ? { ...data.usage, relationships, coverage: usageCoverage }
            : undefined,
          usageCoverage.complete,
          'runtime-aggregate',
          data.usageAt,
        ),
        ...(latest
          ? {
              turn: {
                turnId: latest.turnId,
                reading: reading(
                  latest.usage
                    ? {
                        ...latest.usage,
                        relationships,
                        coverage: {
                          complete: !latest.usageIncomplete,
                          observedTurns: 1,
                          totalTurns: 1,
                        },
                      }
                    : undefined,
                  !latest.usageIncomplete,
                  'provider-reported',
                  latest.usageAt,
                ),
              },
            }
          : {}),
      },
      cost: {
        session: reading(
          ready && data.cost ? { ...data.cost, coverage: costCoverage } : undefined,
          costCoverage.complete,
          'runtime-aggregate',
          data.costAt,
        ),
        ...(latest
          ? {
              turn: {
                turnId: latest.turnId,
                reading: reading(
                  latest.cost
                    ? {
                        ...latest.cost,
                        coverage: {
                          complete: !latest.costIncomplete,
                          observedTurns: 1,
                          totalTurns: 1,
                        },
                      }
                    : undefined,
                  !latest.costIncomplete,
                  'provider-reported',
                  latest.costAt,
                ),
              },
            }
          : {}),
      },
      context: projectGauge(data.context),
      limits:
        expectedScope === undefined || data.limitsScope !== expectedScope
          ? unavailable('NOT_OBSERVED')
          : projectGauge(data.limits),
      refresh: data.refresh,
    };
  }

  function migrate(): { done: boolean } {
    // Only indexed unfinished refresh records are visited. A live request owned by
    // this Worker must never be mistaken for a refresh orphaned by the old owner.
    const orphaned = all(
      "SELECT session,data FROM telemetry_sessions WHERE json_extract(data,'$.refresh.state')!='idle' AND coalesce(json_extract(data,'$.refreshOwner'),'')!=? ORDER BY session LIMIT 100",
      deps.owner,
    );
    for (const row of orphaned) {
      const data = JSON.parse(String(row.data)) as Ledger;
      refreshState(deps.session(String(row.session)), 'idle', data.refresh.groups, true);
    }

    if (orphaned.length) {
      return { done: false };
    }

    if (get("SELECT value FROM meta WHERE key='telemetry-migration-done'")?.value === '1') {
      return { done: true };
    }

    if (get("SELECT value FROM meta WHERE key='telemetry-migration-phase'")?.value === 'publish') {
      const after = String(
        get("SELECT value FROM meta WHERE key='telemetry-migration-publish'")?.value ?? '',
      );
      const rows = all(
        'SELECT session,data FROM telemetry_sessions WHERE session>? ORDER BY session LIMIT 100',
        after,
      );
      for (const row of rows) {
        const data = JSON.parse(String(row.data)) as Ledger;
        if (data.baselineReady) {
          continue;
        }

        data.baselineReady = true;
        save(deps.session(String(row.session)), data);
      }

      if (rows.length) {
        run(
          "INSERT OR REPLACE INTO meta VALUES('telemetry-migration-publish',?)",
          String(rows.at(-1)!.session),
        );
      }

      if (rows.length < 100) {
        run("INSERT OR REPLACE INTO meta VALUES('telemetry-migration-done','1')");

        return { done: true };
      }

      return { done: false };
    }

    const cursor = Number(
      get("SELECT value FROM meta WHERE key='telemetry-migration-cursor'")?.value ?? 0,
    );
    let highWater = get("SELECT value FROM meta WHERE key='telemetry-migration-high-water'")?.value;
    if (highWater === undefined) {
      highWater = String(
        get('SELECT rowid AS ordinal FROM turns ORDER BY rowid DESC LIMIT 1')?.ordinal ?? 0,
      );
      run("INSERT INTO meta VALUES('telemetry-migration-high-water',?)", highWater);
    }

    const rows = all(
      'SELECT rowid AS cursor,session,data FROM turns WHERE rowid>? AND rowid<=? ORDER BY rowid LIMIT 100',
      cursor,
      Number(highWater),
    );
    for (const row of rows) {
      const t = JSON.parse(String(row.data)) as StoredTurn;
      // A ledger already written by a concurrent live fact wins over legacy data.
      if (!get('SELECT turn FROM telemetry_turns WHERE turn=?', t.summary.turnId)) {
        const next = ledger(t);
        const legacy = t.summary.usage as Record<string, number> | undefined;
        if (legacy && Object.keys(legacy).length) {
          next.usage = {};
          for (const key of tokenKeys) {
            const value = legacy[key === 'cacheReadTokens' ? 'cachedTokens' : key] ?? legacy[key];
            if (value !== undefined) {
              next.usage[key] = safe(value);
            }
          }

          next.usageIncomplete = true; // v1 did not retain accounting coverage.
        }

        update(deps.session(String(row.session)), next);
      }
    }

    if (rows.length) {
      run(
        "UPDATE meta SET value=? WHERE key='telemetry-migration-cursor'",
        String(rows.at(-1)!.cursor),
      );
    }

    if (rows.length < 100) {
      run("INSERT OR REPLACE INTO meta VALUES('telemetry-migration-phase','publish')");
    }

    return { done: false };
  }

  function terminal(s: StoredSession) {
    // Measurements are already durable before terminal publication, in this transaction path.
    const data = load(s.snapshot.session.sessionId);
    save(s, data);
  }

  function create(s: StoredSession) {
    const data = load(s.snapshot.session.sessionId);
    data.baselineReady = true;
    run(
      'INSERT OR REPLACE INTO telemetry_sessions VALUES(?,?)',
      s.snapshot.session.sessionId,
      JSON.stringify(data),
    );
  }

  function refreshState(
    s: StoredSession,
    state: 'queued' | 'running' | 'idle',
    groups: TelemetryGroup[],
    failed = false,
    expectedGeneration?: string,
  ) {
    const data = load(s.snapshot.session.sessionId);
    if (
      expectedGeneration !== undefined &&
      data.observationFence?.generation !== expectedGeneration
    ) {
      return;
    }

    data.refresh = { state, groups: state === 'idle' ? [] : groups };
    data.refreshOwner = deps.owner;
    if (failed) {
      for (const group of groups) {
        if (group === 'context' || group === 'limits') {
          const value = data[group];
          if (group === 'context') {
            data.context = {
              ...(data.context ?? unavailable()),
              freshness: value?.value ? 'stale' : 'unknown',
              reason: 'REFRESH_FAILED',
            };
          } else {
            data.limits = {
              ...(data.limits ?? unavailable()),
              freshness: value?.value ? 'stale' : 'unknown',
              reason: 'REFRESH_FAILED',
            };
          }
        }
      }
    }

    save(s, data);
  }

  function observations(
    s: StoredSession,
    measurements: readonly Measurement[],
    expectedScope?: string,
    observedAt = now(),
    expectedGeneration?: string,
  ) {
    if (
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(observedAt) ||
      !Number.isFinite(Date.parse(observedAt)) ||
      Date.parse(observedAt) > Date.parse(now())
    ) {
      fail('SESSION_INPUT_INVALID', 'Invalid telemetry observation timestamp.');
    }

    const fence = load(s.snapshot.session.sessionId).observationFence;
    if (
      (fence || expectedGeneration) &&
      (fence?.scope !== expectedScope || fence?.generation !== expectedGeneration)
    ) {
      fail('PROVIDER_UNAVAILABLE', 'Telemetry credential generation changed.');
    }

    for (const f of measurements) {
      if (f.metric === 'cost') {
        fail('CAPABILITY_UNSUPPORTED', 'Cost refresh requires a native Turn.');
      }

      const data = load(s.snapshot.session.sessionId);
      const reading = {
        status: 'available' as const,
        freshness: 'fresh' as const,
        observedAt,
        source: 'provider-reported' as const,
        refreshable: false,
        value: f.value,
      };
      if (f.metric === 'context') {
        data.context = reading as TelemetryReading<TelemetryContextUsage>;
      } else {
        limitsObservation(data, f, observedAt, expectedScope, expectedGeneration);
      }

      save(s, data);
    }
  }

  function observationFence(s: StoredSession, scope: string, generation: string) {
    if (!scope || !generation || scope.length > 1024 || generation.length > 1024) {
      fail('SESSION_INPUT_INVALID', 'Invalid telemetry binding.');
    }

    const data = load(s.snapshot.session.sessionId);
    if (data.observationFence?.scope === scope && data.observationFence.generation === generation) {
      return;
    }

    data.observationFence = { scope, generation };
    if (data.limitsScope !== scope || data.limitsGeneration !== generation) {
      data.limits = unavailable('NOT_OBSERVED');
    }

    save(s, data);
  }

  function expire(s: StoredSession) {
    const data = load(s.snapshot.session.sessionId);
    let changed = false;
    for (const key of ['limits', 'context'] as const) {
      const reading = data[key];
      if (reading?.freshness === 'fresh' && reading.staleAt && reading.staleAt <= now()) {
        reading.freshness = 'stale';
        changed = true;
      }
    }

    if (changed) {
      save(s, data);
    }

    return changed;
  }

  return {
    create,
    start,
    usage,
    measurement,
    read,
    migrate,
    terminal,
    refreshState,
    observations,
    observationFence,
    expire,
  };
}

import { setTimeout as delay } from 'node:timers/promises';
import { randomUUID } from 'node:crypto';
import type {
  RefreshTelemetry,
  RefreshTelemetryReceipt,
  TelemetrySnapshot,
} from '@nevo/specflow-contracts/sessions';
import type { SessionStore } from '../persistence/store';
import type { SessionDriver } from '../providers/driver';
import { validateDriverFact } from '../providers/facts';
import { SessionError } from '../errors';
import type { MeasurementFact } from '../persistence/protocol';

const REFRESH_INTERVAL_MS = 30000;
const REFRESH_TIMEOUT_MS = 10000;
const MAX_BINDINGS = 64;
const MAX_WATCHES = 32;

function isPermitted(check: () => boolean): boolean {
  try {
    return check();
  } catch {
    return false;
  }
}

export class TelemetryRateLimited extends Error {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super('Telemetry refresh is rate limited.');
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Read-only provider refresh and materialized reads; never dispatches a Turn. */
export function createSessionTelemetryService(
  store: SessionStore,
  driverFor: (providerId: string) => SessionDriver | undefined,
) {
  interface Source {
    providerId: string;
    nativeScope?: string;
  }
  interface Job {
    at: number;
    promise: Promise<MeasurementFact[]>;
    controller: AbortController;
    running: boolean;
    groups: RefreshTelemetry['groups'];
    observedAt?: string;
    accountKey: string;
    generation: string;
  }
  const jobs = new Map<string, Job>();
  const completions = new Set<Promise<void>>();
  let admissions = Promise.resolve();
  let queued = 0;
  let requests = 0;
  const watches = new Map<
    string,
    {
      consumers: Set<() => boolean>;
      interval: ReturnType<typeof setInterval>;
      expiry?: ReturnType<typeof setTimeout>;
      pending: boolean;
      unsubscribe: () => void;
    }
  >();
  const shutdown = new AbortController();
  let stopped = false;
  let migrationStatus: 'running' | 'completed' | 'failed' = 'running';
  const migration = (async () => {
    while (!stopped) {
      try {
        if ((await store.call<{ done: boolean }>({ op: 'telemetry-migrate' })).done) {
          migrationStatus = 'completed';

          return;
        }

        await delay(0, undefined, { signal: shutdown.signal });
      } catch (error) {
        if (stopped) {
          return;
        }

        if (!(error instanceof SessionError) || error.code !== 'SESSION_STORE_BUSY') {
          throw error;
        }

        await delay(100, undefined, { signal: shutdown.signal });
      }
    }
  })();
  // Failures are visible during normal operation, not only at close(). Never
  // publish raw SQLite errors or private filesystem paths in this diagnostic.
  void migration.catch(() => {
    migrationStatus = 'failed';
  });

  const source = (sessionId: string) => store.call<Source>({ op: 'telemetry-source', sessionId });

  async function snapshot(sessionId: string): Promise<Omit<TelemetrySnapshot, 'accessRevision'>> {
    const info = await source(sessionId);
    const driver = driverFor(info.providerId);
    const result = await store.call<Omit<TelemetrySnapshot, 'accessRevision'>>({
      op: 'telemetry',
      sessionId,
      expectedScope: driver?.contextScope?.(),
    });
    if (driver?.telemetryGroups) {
      for (const group of ['cost', 'usage', 'context', 'limits'] as const) {
        const readings =
          group === 'usage' || group === 'cost'
            ? [result[group].session, result[group].turn?.reading]
            : [result[group]];
        for (const reading of readings) {
          if (
            reading?.status === 'unavailable' &&
            (reading.reason === 'NOT_SUPPORTED' || reading.reason === 'NOT_OBSERVED')
          ) {
            reading.reason = driver.telemetryGroups.includes(group)
              ? 'NOT_OBSERVED'
              : 'NOT_SUPPORTED';
          }
        }
      }
    }

    const supported =
      driver?.describe().readiness === 'ready' ? (driver.telemetry?.refreshableGroups ?? []) : [];
    result.limits.refreshable = supported.includes('limits');
    result.context.refreshable = false;

    return { ...result, migration: { status: migrationStatus } };
  }

  async function within<T>(run: () => Promise<T>, signal: AbortSignal): Promise<T> {
    signal.throwIfAborted();
    let rejectAbort!: (error: unknown) => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAbort = reject;
    });
    const cancel = () => rejectAbort(signal.reason);
    signal.addEventListener('abort', cancel, { once: true });
    try {
      return await Promise.race([run(), aborted]);
    } finally {
      signal.removeEventListener('abort', cancel);
    }
  }

  async function serialize<T>(action: () => Promise<T>): Promise<T> {
    if (queued >= 64) {
      throw new TelemetryRateLimited(1);
    }

    queued++;
    const before = admissions;
    let release!: () => void;
    admissions = new Promise<void>((resolve) => {
      release = resolve;
    });
    await before;
    try {
      return await action();
    } finally {
      queued--;
      release();
    }
  }

  async function refresh(
    sessionId: string,
    actor: string,
    input: RefreshTelemetry,
    automatic = false,
  ): Promise<RefreshTelemetryReceipt> {
    if (stopped) {
      throw new SessionError('SESSION_STORE_UNAVAILABLE', 'Session Runtime is stopping.');
    }

    // Count binding/discovery as well as admitted completions; neither may queue without bounds.
    if (requests + completions.size >= 64) {
      throw new TelemetryRateLimited(1);
    }

    requests++;
    try {
      const replay = await store.call<RefreshTelemetryReceipt | undefined>({
        op: 'telemetry-refresh-replay',
        sessionId,
        actor,
        input,
      });
      if (replay) {
        return replay;
      }

      const info = await source(sessionId);
      const driver = driverFor(info.providerId);
      const provider = driver?.telemetry;
      for (const group of input.groups) {
        // Shared refresh jobs currently have account affinity only. Context and
        // Turn observations require a different binding; do not admit them into
        // this account-scoped cache even if a future driver advertises them.
        if (group !== 'limits' || !provider?.refreshableGroups.includes(group)) {
          throw new SessionError('CAPABILITY_UNSUPPORTED', 'Telemetry group cannot be refreshed.', {
            capability: group,
          });
        }
      }

      if (!provider || !driver) {
        throw new SessionError('PROVIDER_UNAVAILABLE', 'Telemetry source is unavailable.');
      }

      const controller = new AbortController();
      const signal = AbortSignal.any([
        controller.signal,
        shutdown.signal,
        AbortSignal.timeout(REFRESH_TIMEOUT_MS),
      ]);
      // Bound binding discovery as well as the native read. No inference is permitted here.
      const binding = await within(() => provider.binding(signal), signal);
      signal.throwIfAborted();
      if (info.nativeScope && info.nativeScope !== binding.accountScope) {
        throw new SessionError('PROVIDER_UNAVAILABLE', 'Session provider account binding changed.');
      }

      const key = JSON.stringify([
        info.providerId,
        binding.accountScope,
        binding.credentialGeneration,
      ]);
      const accountKey = JSON.stringify([info.providerId, binding.accountScope]);

      return await serialize(async () => {
        if (stopped) {
          throw new SessionError('SESSION_STORE_UNAVAILABLE', 'Session Runtime is stopping.');
        }

        const replayed = await store.call<RefreshTelemetryReceipt | undefined>({
          op: 'telemetry-refresh-replay',
          sessionId,
          actor,
          input,
        });
        if (replayed) {
          return replayed;
        }

        const verified = await within(() => provider.binding(signal), signal);
        if (
          verified.accountScope !== binding.accountScope ||
          verified.credentialGeneration !== binding.credentialGeneration
        ) {
          throw new SessionError(
            'PROVIDER_UNAVAILABLE',
            'Telemetry account changed before admission.',
          );
        }

        for (const previous of jobs.values()) {
          if (
            previous.accountKey === accountKey &&
            previous.generation !== binding.credentialGeneration
          ) {
            previous.controller.abort();
          }
        }

        for (const [cachedKey, job] of jobs) {
          if (!job.running && Date.now() - job.at >= REFRESH_INTERVAL_MS) {
            jobs.delete(cachedKey);
          }
        }

        let job = jobs.get(key);
        if (
          job &&
          ((!job.running && !automatic) ||
            !input.groups.every((group) => job!.groups.includes(group)))
        ) {
          throw new TelemetryRateLimited(
            Math.max(1, Math.ceil((REFRESH_INTERVAL_MS - Date.now() + job.at) / 1000)),
          );
        }

        if (
          !job &&
          (jobs.size >= MAX_BINDINGS ||
            [...jobs.values()].filter((value) => value.running).length >= 8)
        ) {
          throw new TelemetryRateLimited(1);
        }

        const admitted = await store.call<{ fresh: boolean; receipt: RefreshTelemetryReceipt }>({
          op: 'telemetry-refresh-admit',
          sessionId,
          actor,
          input,
        });
        if (!admitted.fresh) {
          return admitted.receipt;
        }

        await store.call({
          op: 'telemetry-observation-fence',
          sessionId,
          scope: binding.accountScope,
          generation: binding.credentialGeneration,
        });
        if (!job) {
          const created: Job = {
            at: Date.now(),
            controller,
            running: true,
            groups: input.groups,
            promise: Promise.resolve([]),
            accountKey,
            generation: binding.credentialGeneration,
          };
          created.promise = within(async () => {
            const measurements = await provider.refresh({ groups: input.groups, binding }, signal);
            signal.throwIfAborted();
            for (const measurement of measurements) {
              validateDriverFact(measurement);
              if (!input.groups.includes(measurement.metric)) {
                throw new SessionError('SESSION_INPUT_INVALID', 'Unexpected telemetry group.');
              }
            }

            if (
              !input.groups.every((group) =>
                measurements.some((measurement) => measurement.metric === group),
              )
            ) {
              throw new SessionError(
                'PROVIDER_UNAVAILABLE',
                'Requested telemetry observation is unavailable.',
              );
            }

            const current = await provider.binding(signal);
            if (
              current.accountScope !== binding.accountScope ||
              current.credentialGeneration !== binding.credentialGeneration
            ) {
              throw new SessionError(
                'PROVIDER_UNAVAILABLE',
                'Telemetry account changed during refresh.',
              );
            }

            created.observedAt = new Date().toISOString();

            return measurements;
          }, signal).finally(() => {
            created.running = false;
          });
          void created.promise.catch(() => undefined);
          jobs.set(key, created);
          job = created;
        }

        const promise = (async () => {
          try {
            await store.call({
              op: 'telemetry-refresh-state',
              sessionId,
              state: 'running',
              groups: input.groups,
              expectedGeneration: binding.credentialGeneration,
            });
            const measurements = await job.promise;
            if (stopped) {
              return;
            }

            await serialize(async () => {
              if (stopped) {
                return;
              }

              const finalBinding = await within(() => provider.binding(signal), signal);
              if (
                finalBinding.accountScope !== binding.accountScope ||
                finalBinding.credentialGeneration !== binding.credentialGeneration
              ) {
                throw new SessionError(
                  'PROVIDER_UNAVAILABLE',
                  'Telemetry credential generation changed before publication.',
                );
              }

              await store.call({
                op: 'telemetry-observations',
                sessionId,
                measurements,
                expectedScope: binding.accountScope,
                expectedGeneration: binding.credentialGeneration,
                observedAt: job.observedAt,
              });
            });
            await store.call({
              op: 'telemetry-refresh-state',
              sessionId,
              state: 'idle',
              groups: [],
              expectedGeneration: binding.credentialGeneration,
            });
          } catch {
            if (!stopped) {
              await store.call({
                op: 'telemetry-refresh-state',
                sessionId,
                state: 'idle',
                groups: input.groups,
                failed: true,
                expectedGeneration: binding.credentialGeneration,
              });
            }
          }
        })();
        completions.add(promise);
        void promise.finally(() => completions.delete(promise)).catch(() => undefined);

        return admitted.receipt;
      });
    } catch (error) {
      if (error instanceof SessionError || error instanceof TelemetryRateLimited) {
        throw error;
      }

      throw new SessionError('PROVIDER_UNAVAILABLE', 'Telemetry source is unavailable.');
    } finally {
      requests--;
    }
  }

  async function scheduleExpiry(sessionId: string) {
    const watch = watches.get(sessionId);
    if (!watch || watch.pending || stopped) {
      return;
    }

    watch.pending = true;
    try {
      // Transcript/tool commits share the wake-up channel. Coalesce them rather than
      // rereading telemetry on every token, and stop work when the final viewer leaves.
      await delay(500, undefined, { signal: shutdown.signal });
      if (watches.get(sessionId) !== watch || ![...watch.consumers].some(isPermitted)) {
        return;
      }

      const value = await snapshot(sessionId);
      clearTimeout(watch.expiry);
      const deadlines = [value.context, value.limits].flatMap((reading) =>
        reading.freshness === 'fresh' && reading.staleAt ? [Date.parse(reading.staleAt)] : [],
      );
      if (deadlines.length && watches.get(sessionId) === watch) {
        watch.expiry = setTimeout(
          () => {
            void store.call({ op: 'telemetry-expire', sessionId }).catch(() => undefined);
          },
          Math.max(1, Math.min(...deadlines) - Date.now()),
        );
        watch.expiry.unref();
      }
    } finally {
      watch.pending = false;
    }
  }

  function watch(sessionId: string, permitted: () => boolean): () => void {
    let current = watches.get(sessionId);
    if (!current) {
      if (watches.size >= MAX_WATCHES) {
        return () => undefined;
      }

      const poll = () => {
        if (!watches.get(sessionId)?.consumers.size || stopped) {
          return;
        }

        if (![...watches.get(sessionId)!.consumers].some(isPermitted)) {
          return;
        }

        void refresh(
          sessionId,
          'runtime-telemetry-observer',
          {
            requestId: randomUUID(),
            groups: ['limits'],
          },
          true,
        ).catch(() => undefined);
      };

      const interval = setInterval(poll, REFRESH_INTERVAL_MS);
      interval.unref();
      current = {
        consumers: new Set(),
        interval,
        pending: false,
        unsubscribe: store.subscribe(sessionId, () => {
          void scheduleExpiry(sessionId).catch(() => undefined);
        }),
      };
      watches.set(sessionId, current);
      void scheduleExpiry(sessionId).catch(() => undefined);
      queueMicrotask(poll);
    }

    current.consumers.add(permitted);

    return () => {
      current.consumers.delete(permitted);
      if (!current.consumers.size) {
        current.unsubscribe();
        clearInterval(current.interval);
        clearTimeout(current.expiry);
        watches.delete(sessionId);
      }
    };
  }

  return {
    migrationStatus: () => migrationStatus,
    snapshot,
    refresh: (sessionId: string, actor: string, input: RefreshTelemetry) =>
      refresh(sessionId, actor, input),
    watch,
    async close() {
      stopped = true;
      shutdown.abort();
      for (const value of watches.values()) {
        value.unsubscribe();
        clearInterval(value.interval);
        clearTimeout(value.expiry);
      }

      watches.clear();
      for (const job of jobs.values()) {
        job.controller.abort();
      }

      await Promise.allSettled([...jobs.values()].map((job) => job.promise));
      await Promise.allSettled(completions);
      await migration;
    },
  };
}

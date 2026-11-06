import { setTimeout as delay } from 'node:timers/promises';
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
const MAX_REFRESH_REQUESTS = 64;
const EXPIRY_COALESCE_MS = 500;
const EXPIRY_RETRY_MS = 250;
const MAX_EXPIRY_ATTEMPTS = 3;

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
      consumers: number;
      expiry?: ReturnType<typeof setTimeout>;
      pending: boolean;
      dirty: boolean;
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
  ): Promise<RefreshTelemetryReceipt> {
    if (stopped) {
      throw new SessionError('SESSION_STORE_UNAVAILABLE', 'Session Runtime is stopping.');
    }

    // The store bounds the cheap replay lookup independently of provider work.
    const replay = await store.call<RefreshTelemetryReceipt | undefined>({
      op: 'telemetry-refresh-replay',
      sessionId,
      actor,
      input,
    });
    if (replay) {
      return replay;
    }

    if (requests + completions.size >= MAX_REFRESH_REQUESTS) {
      throw new TelemetryRateLimited(1);
    }

    requests++;
    try {
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
        // A confirmed external account switch retires the old gauges and fences
        // any unfinished publication. Do not rebind the native Session, issue a
        // request on the new account or leave old limits looking current.
        await store.call({
          op: 'telemetry-observation-fence',
          sessionId,
          scope: binding.accountScope,
          generation: binding.credentialGeneration,
        });

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

        const now = Date.now();
        let cooldownUntil = now;
        for (const [cachedKey, previous] of jobs) {
          const expiresAt = previous.at + REFRESH_INTERVAL_MS;
          if (!previous.running && expiresAt <= now) {
            jobs.delete(cachedKey);
            continue;
          }

          if (
            previous.accountKey === accountKey &&
            previous.generation !== binding.credentialGeneration
          ) {
            previous.controller.abort();
            cooldownUntil = Math.max(cooldownUntil, expiresAt);
          }
        }

        // Credential changes fence reads and results, but the rate budget belongs to the account.
        if (cooldownUntil > now) {
          throw new TelemetryRateLimited(Math.ceil((cooldownUntil - now) / 1000));
        }

        let job = jobs.get(key);
        if (job && !job.running) {
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
          binding,
        });
        if (!admitted.fresh) {
          return admitted.receipt;
        }

        if (!job) {
          const created: Job = {
            at: Date.now(),
            controller,
            running: true,
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

  async function retryExpiry<T>(run: () => Promise<T>, isWatching: () => boolean) {
    for (let attempt = 1; attempt <= MAX_EXPIRY_ATTEMPTS && isWatching(); attempt++) {
      try {
        return await run();
      } catch (error) {
        if (
          !(error instanceof SessionError) ||
          error.code !== 'SESSION_STORE_BUSY' ||
          attempt === MAX_EXPIRY_ATTEMPTS
        ) {
          throw error;
        }

        await delay(EXPIRY_RETRY_MS, undefined, { signal: shutdown.signal });
      }
    }
  }

  async function scheduleExpiry(sessionId: string) {
    const watch = watches.get(sessionId);
    if (!watch || stopped) {
      return;
    }

    watch.dirty = true;
    if (watch.pending) {
      return;
    }

    const isWatching = () => !stopped && watches.get(sessionId) === watch;
    watch.pending = true;
    try {
      while (watch.dirty && isWatching()) {
        // Transcript and telemetry commits share the wakeup channel.
        await delay(EXPIRY_COALESCE_MS, undefined, { signal: shutdown.signal });
        if (!isWatching()) {
          return;
        }

        watch.dirty = false;
        const deadline = await retryExpiry(
          () => store.call<number | undefined>({ op: 'telemetry-expiry-deadline', sessionId }),
          isWatching,
        );
        if (!isWatching()) {
          continue;
        }

        clearTimeout(watch.expiry);
        if (deadline !== undefined) {
          watch.expiry = setTimeout(
            () =>
              void retryExpiry(
                () => store.call({ op: 'telemetry-expire', sessionId }),
                isWatching,
              ).catch(() => undefined),
            Math.max(1, deadline - Date.now()),
          );
          watch.expiry.unref();
        }
      }
    } finally {
      watch.pending = false;
      if (watch.dirty && isWatching()) {
        void scheduleExpiry(sessionId).catch(() => undefined);
      }
    }
  }

  function watch(sessionId: string): () => void {
    let current = watches.get(sessionId);
    if (!current) {
      if (stopped || watches.size >= MAX_WATCHES) {
        return () => undefined;
      }

      current = {
        consumers: 0,
        pending: false,
        dirty: false,
        unsubscribe: store.subscribe(sessionId, () => {
          void scheduleExpiry(sessionId).catch(() => undefined);
        }),
      };
      watches.set(sessionId, current);
      void scheduleExpiry(sessionId).catch(() => undefined);
    }

    current.consumers++;
    let released = false;

    return () => {
      if (released || watches.get(sessionId) !== current) {
        return;
      }

      released = true;
      if (--current.consumers === 0) {
        current.unsubscribe();
        clearTimeout(current.expiry);
        watches.delete(sessionId);
      }
    };
  }

  return {
    migrationStatus: () => migrationStatus,
    snapshot,
    refresh,
    watch,
    async close() {
      stopped = true;
      shutdown.abort();
      for (const value of watches.values()) {
        value.unsubscribe();
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

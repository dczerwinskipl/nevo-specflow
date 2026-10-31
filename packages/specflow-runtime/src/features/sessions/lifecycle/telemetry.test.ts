import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { TelemetrySnapshot } from '@nevo/specflow-contracts/sessions';
import { createSessionTelemetryService, TelemetryRateLimited } from './telemetry';
import type { SessionStore } from '../persistence/store';
import type { MeasurementFact, StoreCommand } from '../persistence/protocol';
import { createMockDriver } from '../providers/mock';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });

  return { promise, resolve };
}

const unavailable = {
  status: 'unavailable',
  freshness: 'unknown',
  reason: 'NOT_OBSERVED',
  refreshable: false,
} as const;
const measurement: MeasurementFact = {
  kind: 'measurement',
  metric: 'limits',
  sampleId: 'sample',
  value: { windows: [{ windowId: 'hour', scope: 'account', unit: 'requests', remaining: '9' }] },
};
const services: ReturnType<typeof createSessionTelemetryService>[] = [];
afterEach(async () => {
  for (const service of services.splice(0)) {
    await service.close();
  }

  vi.restoreAllMocks();
  vi.useRealTimers();
});

function fixture(
  migrationFailure = false,
  refreshableGroups: ('limits' | 'context')[] = ['limits'],
) {
  const commands: StoreCommand[] = [];
  const snapshots: Omit<TelemetrySnapshot, 'accessRevision'>[] = [];
  const subscriptions = new Map<string, Set<() => void>>();
  const store: SessionStore = {
    call<T>(command: StoreCommand): Promise<T> {
      commands.push(command);
      if (command.op === 'telemetry-migrate' && migrationFailure) {
        return Promise.reject(new Error('Private migration diagnostic not for the DTO.'));
      }

      let result: unknown;
      if (command.op === 'telemetry-migrate') {
        result = { done: true };
      }

      if (command.op === 'telemetry-source') {
        result = { providerId: 'mock', nativeScope: 'account' };
      }

      if (command.op === 'telemetry-refresh-admit') {
        result = {
          fresh: true,
          receipt: {
            requestId: command.input.requestId,
            acceptedGroups: command.input.groups,
            state: 'queued',
            telemetryRevision: 1,
          },
        };
      }

      if (command.op === 'telemetry') {
        result = {
          sessionId: command.sessionId,
          revision: 0,
          eventSeq: 0,
          usage: { session: { ...unavailable } },
          cost: { session: { ...unavailable } },
          limits: { ...unavailable },
          context: { ...unavailable },
          refresh: { state: 'idle', groups: [] },
        } satisfies Omit<TelemetrySnapshot, 'accessRevision'>;
      }

      if (command.op === 'telemetry' && snapshots.length) {
        result = snapshots.shift();
      }

      return Promise.resolve(result as T);
    },
    subscribe(sessionId, listener) {
      const set = subscriptions.get(sessionId) ?? new Set<() => void>();
      set.add(listener);
      subscriptions.set(sessionId, set);

      return () => {
        set.delete(listener);
      };
    },
    close: () => Promise.resolve(),
    abandon: () => Promise.resolve(),
    readMetrics: () => ({ rows: 0, contentBytes: 0 }),
  };
  const binding = vi.fn(() =>
    Promise.resolve({
      accountScope: 'account',
      credentialGeneration: 'generation',
    }),
  );
  const refresh = vi.fn((_request: unknown, _signal: AbortSignal): Promise<MeasurementFact[]> =>
    Promise.resolve([measurement]),
  );
  const driver = {
    ...createMockDriver(),
    contextScope: () => 'account',
    telemetry: { refreshableGroups, binding, refresh },
  };
  const service = createSessionTelemetryService(store, () => driver);
  services.push(service);
  const request = (sessionId = randomUUID()) =>
    service.refresh(sessionId, 'actor', {
      requestId: randomUUID(),
      groups: ['limits'],
    });

  return { service, request, commands, binding, refresh, subscriptions, snapshots };
}

describe('Session telemetry refresh lifecycle', () => {
  it('retires previous account observations on a confirmed external switch without rebinding or querying limits', async () => {
    const f = fixture();
    f.binding.mockResolvedValue({
      accountScope: 'changed-account',
      credentialGeneration: 'changed-login',
    });
    await expect(f.request()).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(f.commands).toContainEqual(
      expect.objectContaining({
        op: 'telemetry-observation-fence',
        scope: 'changed-account',
        generation: 'changed-login',
      }),
    );
    expect(f.commands.some((command) => command.op === 'telemetry-refresh-admit')).toBe(false);
    expect(f.refresh).not.toHaveBeenCalled();
  });
  it('serves concurrent snapshots without expiry writes, migration work or provider reads', async () => {
    const f = fixture();
    await f.service.snapshot(randomUUID());
    f.commands.length = 0;
    await Promise.all(Array.from({ length: 32 }, () => f.service.snapshot(randomUUID())));
    expect(f.commands).toHaveLength(64);
    expect(
      f.commands.every(
        (command) => command.op === 'telemetry' || command.op === 'telemetry-source',
      ),
    ).toBe(true);
    expect(f.refresh).not.toHaveBeenCalled();
    expect(f.binding).not.toHaveBeenCalled();
  });

  it('exposes failed migration promptly without leaking its diagnostic or waiting for shutdown', async () => {
    const f = fixture(true);
    await vi.waitFor(() => expect(f.service.migrationStatus()).toBe('failed'));
    const value = await f.service.snapshot(randomUUID());
    expect(value.migration).toEqual({ status: 'failed' });
    expect(JSON.stringify(value)).not.toContain('Private migration diagnostic');
    services.splice(services.indexOf(f.service), 1);
    await expect(f.service.close()).rejects.toThrow('Private migration diagnostic');
  });
  it('reads snapshots without native discovery, refresh or prompt dispatch', async () => {
    const f = fixture();
    await f.service.snapshot(randomUUID());
    expect(f.binding).not.toHaveBeenCalled();
    expect(f.refresh).not.toHaveBeenCalled();
    expect(f.commands.some((command) => command.op === 'telemetry-refresh-admit')).toBe(false);
  });
  it('rejects context refresh before account binding even if a future driver advertises it', async () => {
    const f = fixture(false, ['context']);
    // This scheduler has account-only affinity; advertising another group cannot
    // accidentally share native-context data across Sessions on that account.
    await expect(
      f.service.refresh(randomUUID(), 'actor', {
        requestId: randomUUID(),
        groups: ['context'],
      }),
    ).rejects.toMatchObject({ code: 'CAPABILITY_UNSUPPORTED' });
    expect(f.binding).not.toHaveBeenCalled();
    expect(f.refresh).not.toHaveBeenCalled();
  });

  it('allows passive account monitoring with ViewProviderLimits without Manage', async () => {
    const f = fixture();
    const permissions = { view: true, limits: true, manage: false };
    const unwatch = f.service.watch(randomUUID(), () => permissions.view && permissions.limits);
    await vi.waitFor(() => expect(f.refresh).toHaveBeenCalledOnce());
    expect(permissions.manage).toBe(false);
    unwatch();
  });

  it('keeps scoped limits and telemetry revision at the same committed read boundary', async () => {
    const f = fixture();
    const initial = await f.service.snapshot(randomUUID());
    const updated: Omit<TelemetrySnapshot, 'accessRevision'> = {
      ...initial,
      revision: 3,
      eventSeq: 4,
      limits: {
        status: 'available',
        freshness: 'fresh',
        refreshable: false,
        value: measurement.metric === 'limits' ? measurement.value : { windows: [] },
      },
    };
    f.snapshots.push(updated);
    f.commands.length = 0;
    const result = await f.service.snapshot(initial.sessionId);
    expect(result.limits.status).toBe('available');
    expect(result.revision).toBe(3);
    expect(result.eventSeq).toBe(4);
    expect(f.commands.filter((command) => command.op === 'telemetry')).toHaveLength(1);
  });

  it('shares one unfinished native read and retains per-request Session publications', async () => {
    const f = fixture();
    const native = deferred<MeasurementFact[]>();
    f.refresh.mockImplementation(() => native.promise);
    const first = await f.request();
    const second = await f.request();
    expect(first.requestId).not.toBe(second.requestId);
    expect(f.refresh).toHaveBeenCalledTimes(1);
    native.resolve([measurement]);
    await vi.waitFor(() =>
      expect(f.commands.filter((command) => command.op === 'telemetry-observations')).toHaveLength(
        2,
      ),
    );
    await expect(f.request()).rejects.toBeInstanceOf(TelemetryRateLimited);
    expect(f.refresh).toHaveBeenCalledTimes(1);
  });

  it('times out a source ignoring abort and never publishes its late result', async () => {
    vi.useFakeTimers();
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((milliseconds) => {
      const controller = new AbortController();
      setTimeout(() => controller.abort(new Error('Controlled timeout.')), milliseconds);

      return controller.signal;
    });
    const f = fixture();
    const native = deferred<MeasurementFact[]>();
    f.refresh.mockImplementation(() => native.promise);
    await f.request();
    const signal = f.refresh.mock.calls[0]![1];
    await vi.advanceTimersByTimeAsync(10000);
    expect(signal.aborted).toBe(true);
    await vi.waitFor(() =>
      expect(
        f.commands.some((command) => command.op === 'telemetry-refresh-state' && command.failed),
      ).toBe(true),
    );
    native.resolve([measurement]);
    await Promise.resolve();
    await Promise.resolve();
    expect(f.commands.some((command) => command.op === 'telemetry-observations')).toBe(false);
  });

  it('does no native work for unauthorized consumers and stops polling after the last unsubscribe', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const sessionId = randomUUID();
    const stops = Array.from({ length: 32 }, () => f.service.watch(sessionId, () => false));
    await vi.advanceTimersByTimeAsync(90000);
    expect(f.binding).not.toHaveBeenCalled();
    expect(f.refresh).not.toHaveBeenCalled();
    for (const stop of stops) {
      stop();
    }

    expect(f.subscriptions.get(sessionId)?.size).toBe(0);
    await vi.advanceTimersByTimeAsync(90000);
    expect(f.binding).not.toHaveBeenCalled();
  });

  it('fences a changed account generation before publishing the refreshed observation', async () => {
    const f = fixture();
    f.refresh.mockImplementation(() => {
      f.binding.mockResolvedValue({
        accountScope: 'account',
        credentialGeneration: 'new-generation',
      });

      return Promise.resolve([measurement]);
    });
    await f.request();
    await vi.waitFor(() =>
      expect(
        f.commands.some((command) => command.op === 'telemetry-refresh-state' && command.failed),
      ).toBe(true),
    );
    expect(f.commands.some((command) => command.op === 'telemetry-observations')).toBe(false);
  });

  it('rejects a generation change before durable admission without starting a native read', async () => {
    const f = fixture();
    f.binding.mockResolvedValueOnce({
      accountScope: 'account',
      credentialGeneration: 'generation',
    });
    f.binding.mockResolvedValue({
      accountScope: 'account',
      credentialGeneration: 'new-generation',
    });
    await expect(f.request()).rejects.toMatchObject({ code: 'PROVIDER_UNAVAILABLE' });
    expect(f.commands.some((command) => command.op === 'telemetry-refresh-admit')).toBe(false);
    expect(f.refresh).not.toHaveBeenCalled();
  });

  it('rechecks the generation when a completed native read waits to publish', async () => {
    const f = fixture();
    let generation = 'generation';
    let calls = 0;
    f.binding.mockImplementation(() => {
      const result = { accountScope: 'account', credentialGeneration: generation };
      // Rotate after the source's post-read check, before serialized publication.
      if (++calls === 3) {
        generation = 'new-generation';
      }

      return Promise.resolve(result);
    });
    await f.request();
    await vi.waitFor(() =>
      expect(
        f.commands.some((command) => command.op === 'telemetry-refresh-state' && command.failed),
      ).toBe(true),
    );
    expect(f.refresh).toHaveBeenCalledTimes(1);
    expect(f.commands.some((command) => command.op === 'telemetry-observations')).toBe(false);
  });

  it('bounds binding discovery before admitting more native reads', async () => {
    const f = fixture();
    const binding = deferred<{ accountScope: string; credentialGeneration: string }>();
    f.binding.mockImplementation(() => binding.promise);
    const started = Array.from({ length: 64 }, () => f.request().catch((error: unknown) => error));
    await vi.waitFor(() => expect(f.binding).toHaveBeenCalledTimes(64));
    await expect(f.request()).rejects.toBeInstanceOf(TelemetryRateLimited);
    expect(f.binding).toHaveBeenCalledTimes(64);
    await f.service.close();
    await Promise.all(started);
    expect(f.refresh).not.toHaveBeenCalled();
  });

  it('projects one fast shared account read to all concurrently subscribed Sessions', async () => {
    vi.useFakeTimers();
    const f = fixture();
    const ids = Array.from({ length: 32 }, () => randomUUID());
    const stops = ids.map((id) => f.service.watch(id, () => true));
    await vi.advanceTimersByTimeAsync(0);
    expect(f.refresh).toHaveBeenCalledTimes(1);
    const observed = new Set(
      f.commands.flatMap((command) =>
        command.op === 'telemetry-observations' ? [command.sessionId] : [],
      ),
    );
    for (const stop of stops) {
      stop();
    }

    expect(observed.size).toBe(32);
  });
});

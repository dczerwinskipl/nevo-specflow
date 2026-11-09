import type { TelemetrySnapshot } from '@nevo/specflow-contracts/sessions';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../../api';
import type { ManagedSessionsApi, TelemetryRead } from '../api';
import type { TelemetrySignal } from '../feed';
import { createSessionTelemetryStore } from './sessionTelemetryStore';
import { fullTelemetrySnapshot } from './sessionTelemetry.stories-support';

const sessionId = fullTelemetrySnapshot.sessionId;
const at = (revision: number, accessRevision = fullTelemetrySnapshot.accessRevision) =>
  ({ ...fullTelemetrySnapshot, revision, accessRevision }) satisfies TelemetrySnapshot;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

function setup() {
  const telemetry = vi.fn<ManagedSessionsApi['telemetry']>();
  const refreshTelemetry = vi.fn<ManagedSessionsApi['refreshTelemetry']>();
  const store = createSessionTelemetryStore({ telemetry, refreshTelemetry }, sessionId, {
    minIntervalMs: 500,
  });
  let emit: (signal: TelemetrySignal) => void = () => undefined;
  const disconnect = store.connect((listener) => {
    emit = listener;

    return () => {
      emit = () => undefined;
    };
  });

  return { store, telemetry, refreshTelemetry, emit: (s: TelemetrySignal) => emit(s), disconnect };
}

const snapshotRead = (snapshot: TelemetrySnapshot, etag?: string): TelemetryRead => ({
  kind: 'snapshot',
  snapshot,
  ...(etag ? { etag } : {}),
});

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('telemetry reads', () => {
  it('reads on resync and revalidates with the received ETag; 304 keeps the snapshot', async () => {
    const { store, telemetry, emit } = setup();
    telemetry.mockResolvedValueOnce(snapshotRead(at(5), '"r5"'));
    emit({ kind: 'resync' });
    await vi.runAllTimersAsync();
    expect(store.getSnapshot().snapshot?.revision).toBe(5);
    expect(telemetry).toHaveBeenLastCalledWith(sessionId, undefined, expect.any(AbortSignal));

    telemetry.mockResolvedValueOnce({ kind: 'not-modified' });
    emit({ kind: 'resync' });
    await vi.runAllTimersAsync();
    expect(telemetry).toHaveBeenLastCalledWith(sessionId, '"r5"', expect.any(AbortSignal));
    expect(store.getSnapshot().snapshot?.revision).toBe(5);
  });

  it('refetches only for a telemetry revision newer than the held one', async () => {
    const { store, telemetry, emit } = setup();
    telemetry.mockResolvedValue(snapshotRead(at(5)));
    emit({ kind: 'resync' });
    await vi.runAllTimersAsync();
    emit({ kind: 'revision', revision: 5 });
    emit({ kind: 'revision', revision: 4 });
    await vi.runAllTimersAsync();
    expect(telemetry).toHaveBeenCalledTimes(1);

    telemetry.mockResolvedValue(snapshotRead(at(6)));
    emit({ kind: 'revision', revision: 6 });
    await vi.runAllTimersAsync();
    expect(telemetry).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().snapshot?.revision).toBe(6);
  });

  it('reads once more after an invalidation that arrived during a read, at most twice a second', async () => {
    const { store, telemetry, emit } = setup();
    const first = deferred<TelemetryRead>();
    telemetry.mockReturnValueOnce(first.promise).mockResolvedValueOnce(snapshotRead(at(8)));
    emit({ kind: 'resync' });
    emit({ kind: 'revision', revision: 7 });
    emit({ kind: 'revision', revision: 8 });
    first.resolve(snapshotRead(at(6)));
    await vi.advanceTimersByTimeAsync(0);
    expect(telemetry).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(499);
    expect(telemetry).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(telemetry).toHaveBeenCalledTimes(2);
    await vi.runAllTimersAsync();
    expect(store.getSnapshot().snapshot?.revision).toBe(8);
  });

  it('never lets an older revision replace a newer one of the same access generation', async () => {
    const { store, telemetry, emit } = setup();
    telemetry.mockResolvedValueOnce(snapshotRead(at(9), '"r9"'));
    emit({ kind: 'resync' });
    await vi.runAllTimersAsync();
    telemetry.mockResolvedValueOnce(snapshotRead(at(7), '"r7"'));
    emit({ kind: 'resync' });
    await vi.runAllTimersAsync();
    expect(store.getSnapshot().snapshot?.revision).toBe(9);
    // The rejected answer's ETag is not adopted either.
    emit({ kind: 'resync' });
    telemetry.mockResolvedValueOnce({ kind: 'not-modified' });
    await vi.runAllTimersAsync();
    expect(telemetry).toHaveBeenLastCalledWith(sessionId, '"r9"', expect.any(AbortSignal));
  });

  it('replaces the snapshot outright on a new access generation', async () => {
    const { store, telemetry, emit } = setup();
    telemetry.mockResolvedValueOnce(snapshotRead(at(9)));
    emit({ kind: 'resync' });
    await vi.runAllTimersAsync();
    telemetry.mockResolvedValueOnce(snapshotRead(at(2, 'rev-new')));
    emit({ kind: 'resync' });
    await vi.runAllTimersAsync();
    expect(store.getSnapshot().snapshot).toMatchObject({ revision: 2, accessRevision: 'rev-new' });
  });

  it('drops the held snapshot when access to it is gone, keeps it on other failures', async () => {
    const { store, telemetry, emit } = setup();
    telemetry.mockResolvedValueOnce(snapshotRead(at(3)));
    emit({ kind: 'resync' });
    await vi.runAllTimersAsync();
    telemetry.mockRejectedValueOnce(
      new ApiError({
        kind: 'network',
        operation: 'sessions',
        outcome: 'not-applied',
        retryable: true,
      }),
    );
    emit({ kind: 'resync' });
    await vi.runAllTimersAsync();
    expect(store.getSnapshot().snapshot?.revision).toBe(3);
    telemetry.mockRejectedValueOnce(
      new ApiError({
        kind: 'forbidden',
        operation: 'sessions',
        outcome: 'not-applied',
        retryable: false,
      }),
    );
    emit({ kind: 'resync' });
    await vi.runAllTimersAsync();
    expect(store.getSnapshot().snapshot).toBeUndefined();
  });

  it('ignores signals and in-flight answers after disconnect', async () => {
    const { store, telemetry, emit, disconnect } = setup();
    const pending = deferred<TelemetryRead>();
    telemetry.mockReturnValueOnce(pending.promise);
    emit({ kind: 'resync' });
    disconnect();
    pending.resolve(snapshotRead(at(4)));
    await vi.runAllTimersAsync();
    expect(store.getSnapshot().snapshot).toBeUndefined();
    store.signal({ kind: 'resync' });
    expect(telemetry).toHaveBeenCalledTimes(1);
  });
});

describe('provider-limits refresh', () => {
  const receipt = (telemetryRevision: number) => ({
    requestId: '00000000-0000-4000-8000-000000000099',
    acceptedGroups: ['limits' as const],
    state: 'queued' as const,
    telemetryRevision,
  });

  it('sends only limits, ignores presses while sending, and reads the receipt revision', async () => {
    const { store, telemetry, refreshTelemetry } = setup();
    const sent = deferred<ReturnType<typeof receipt>>();
    refreshTelemetry.mockReturnValueOnce(sent.promise);
    telemetry.mockResolvedValue(snapshotRead(at(43)));
    const press = store.refreshLimits();
    expect(store.getSnapshot().refresh.sending).toBe(true);
    await expect(store.refreshLimits()).resolves.toBe('ignored');
    sent.resolve(receipt(43));
    await expect(press).resolves.toBe('sent');
    expect(refreshTelemetry).toHaveBeenCalledOnce();
    expect(refreshTelemetry.mock.calls[0]![1].groups).toEqual(['limits']);
    expect(store.getSnapshot().refresh.sending).toBe(false);
    await vi.runAllTimersAsync();
    expect(telemetry).toHaveBeenCalledOnce();
  });

  it('cools down after 429 for Retry-After, then allows a new request', async () => {
    const { store, refreshTelemetry } = setup();
    refreshTelemetry.mockRejectedValueOnce(
      new ApiError({
        kind: 'rate-limited',
        operation: 'sessions',
        outcome: 'not-applied',
        retryable: true,
        status: 429,
        retryAfterMs: 20_000,
      }),
    );
    await expect(store.refreshLimits()).resolves.toBe('cooldown');
    expect(store.getSnapshot().refresh.coolingDown).toBe(true);
    await expect(store.refreshLimits()).resolves.toBe('ignored');
    await vi.advanceTimersByTimeAsync(20_000);
    expect(store.getSnapshot().refresh.coolingDown).toBe(false);
    refreshTelemetry.mockResolvedValueOnce(receipt(1));
    await expect(store.refreshLimits()).resolves.toBe('sent');
    expect(refreshTelemetry.mock.calls[1]![1].requestId).not.toBe(
      refreshTelemetry.mock.calls[0]![1].requestId,
    );
  });

  it('cools down for the snapshot retryAfterSeconds', async () => {
    const { store, telemetry, emit } = setup();
    telemetry.mockResolvedValueOnce(
      snapshotRead({
        ...at(5),
        refresh: { state: 'idle', groups: [], retryAfterSeconds: 10 },
      }),
    );
    emit({ kind: 'resync' });
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getSnapshot().refresh.coolingDown).toBe(true);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(store.getSnapshot().refresh.coolingDown).toBe(false);
  });

  it.each([
    new ApiError({
      kind: 'forbidden',
      operation: 'sessions',
      outcome: 'not-applied',
      retryable: false,
      status: 403,
    }),
    new ApiError({
      kind: 'precondition',
      operation: 'sessions',
      outcome: 'not-applied',
      retryable: false,
      status: 422,
      code: 'CAPABILITY_UNSUPPORTED',
    }),
  ])(
    'treats %s as a definite refusal for this mount; its note lasts until the next snapshot',
    async (error) => {
      const { store, telemetry, refreshTelemetry, emit } = setup();
      refreshTelemetry.mockRejectedValueOnce(error);
      await expect(store.refreshLimits()).resolves.toBe('refused');
      expect(store.getSnapshot().refresh).toMatchObject({ refused: true, refusedNote: true });
      await expect(store.refreshLimits()).resolves.toBe('ignored');
      telemetry.mockResolvedValueOnce(snapshotRead(at(6)));
      emit({ kind: 'resync' });
      await vi.runAllTimersAsync();
      expect(store.getSnapshot().refresh).toMatchObject({ refused: true, refusedNote: false });
    },
  );

  it('reuses the requestId after an unconfirmed request', async () => {
    const { store, refreshTelemetry } = setup();
    refreshTelemetry
      .mockRejectedValueOnce(
        new ApiError({
          kind: 'network',
          operation: 'sessions',
          outcome: 'unknown',
          retryable: true,
        }),
      )
      .mockResolvedValueOnce(receipt(2));
    await expect(store.refreshLimits()).resolves.toBe('unconfirmed');
    expect(store.getSnapshot().refresh.unconfirmed).toBe(true);
    await expect(store.refreshLimits()).resolves.toBe('sent');
    expect(store.getSnapshot().refresh.unconfirmed).toBe(false);
    expect(refreshTelemetry.mock.calls[1]![1].requestId).toBe(
      refreshTelemetry.mock.calls[0]![1].requestId,
    );
  });
});

describe('telemetry review fixes', () => {
  const receipt = {
    requestId: '00000000-0000-4000-8000-000000000099',
    acceptedGroups: ['limits' as const],
    state: 'queued' as const,
    telemetryRevision: 1,
  };
  const refusal = (kind: 'forbidden' | 'not-found', status: number) =>
    new ApiError({ kind, operation: 'sessions', outcome: 'not-applied', retryable: false, status });

  it('clears the refusal note when a later read loses access, leaving no snapshot', async () => {
    const { store, telemetry, refreshTelemetry, emit } = setup();
    telemetry.mockResolvedValueOnce(snapshotRead(at(3)));
    emit({ kind: 'resync' });
    await vi.runAllTimersAsync();
    refreshTelemetry.mockRejectedValueOnce(refusal('forbidden', 403));
    await store.refreshLimits();
    telemetry.mockRejectedValueOnce(refusal('forbidden', 403));
    emit({ kind: 'resync' });
    await vi.runAllTimersAsync();
    expect(store.getSnapshot()).toEqual({
      refresh: expect.objectContaining({ refused: true, refusedNote: false }) as unknown,
    });
  });

  it('starts the snapshot cooldown once per revision, not on every revalidation', async () => {
    const { store, telemetry, emit } = setup();
    const cooling = {
      ...at(5),
      refresh: { state: 'idle' as const, groups: [], retryAfterSeconds: 10 },
    };
    telemetry.mockResolvedValue(snapshotRead(cooling));
    emit({ kind: 'resync' });
    await vi.advanceTimersByTimeAsync(6_000);
    // The same revision again (a revalidation answered 200) does not extend the cooldown.
    emit({ kind: 'resync' });
    await vi.advanceTimersByTimeAsync(4_000);
    expect(telemetry).toHaveBeenCalledTimes(2);
    expect(store.getSnapshot().refresh.coolingDown).toBe(false);
  });

  it('forgets a refusal and the retained requestId on a new access generation', async () => {
    const { store, telemetry, refreshTelemetry, emit } = setup();
    telemetry.mockResolvedValueOnce(snapshotRead(at(3)));
    emit({ kind: 'resync' });
    await vi.runAllTimersAsync();
    refreshTelemetry
      .mockRejectedValueOnce(
        new ApiError({
          kind: 'network',
          operation: 'sessions',
          outcome: 'unknown',
          retryable: true,
        }),
      )
      .mockRejectedValueOnce(refusal('forbidden', 403));
    await store.refreshLimits();
    await store.refreshLimits();
    expect(store.getSnapshot().refresh.refused).toBe(true);
    telemetry.mockResolvedValueOnce(snapshotRead(at(1, 'rev-granted')));
    emit({ kind: 'resync' });
    await vi.runAllTimersAsync();
    expect(store.getSnapshot().refresh).toMatchObject({ refused: false, unconfirmed: false });
    refreshTelemetry.mockResolvedValueOnce(receipt);
    await expect(store.refreshLimits()).resolves.toBe('sent');
    expect(refreshTelemetry.mock.calls[2]![1].requestId).not.toBe(
      refreshTelemetry.mock.calls[0]![1].requestId,
    );
  });

  it('reports a definite rejection (409) without the unconfirmed note, with a new requestId next', async () => {
    const { store, refreshTelemetry } = setup();
    refreshTelemetry
      .mockRejectedValueOnce(
        new ApiError({
          kind: 'conflict',
          operation: 'sessions',
          outcome: 'not-applied',
          retryable: false,
          status: 409,
          code: 'IDEMPOTENCY_CONFLICT',
        }),
      )
      .mockResolvedValueOnce(receipt);
    await expect(store.refreshLimits()).resolves.toBe('rejected');
    expect(store.getSnapshot().refresh).toMatchObject({ rejected: true, unconfirmed: false });
    await expect(store.refreshLimits()).resolves.toBe('sent');
    expect(store.getSnapshot().refresh.rejected).toBe(false);
    expect(refreshTelemetry.mock.calls[1]![1].requestId).not.toBe(
      refreshTelemetry.mock.calls[0]![1].requestId,
    );
  });

  it('treats a 404 refresh as lost access', async () => {
    const { store, telemetry, refreshTelemetry, emit } = setup();
    telemetry.mockResolvedValueOnce(snapshotRead(at(3)));
    emit({ kind: 'resync' });
    await vi.runAllTimersAsync();
    refreshTelemetry.mockRejectedValueOnce(refusal('not-found', 404));
    await expect(store.refreshLimits()).resolves.toBe('access-lost');
    expect(store.getSnapshot().snapshot).toBeUndefined();
    expect(store.getSnapshot().refresh).toMatchObject({ refused: true, refusedNote: false });
  });

  it('cools down for 30 s when a 429 has no Retry-After', async () => {
    const { store, refreshTelemetry } = setup();
    refreshTelemetry.mockRejectedValueOnce(
      new ApiError({
        kind: 'rate-limited',
        operation: 'sessions',
        outcome: 'not-applied',
        retryable: true,
        status: 429,
      }),
    );
    await expect(store.refreshLimits()).resolves.toBe('cooldown');
    await vi.advanceTimersByTimeAsync(29_999);
    expect(store.getSnapshot().refresh.coolingDown).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(store.getSnapshot().refresh.coolingDown).toBe(false);
  });

  it('clears a running cooldown on disconnect', async () => {
    const { store, refreshTelemetry, disconnect } = setup();
    refreshTelemetry.mockRejectedValueOnce(
      new ApiError({
        kind: 'rate-limited',
        operation: 'sessions',
        outcome: 'not-applied',
        retryable: true,
        status: 429,
        retryAfterMs: 20_000,
      }),
    );
    await store.refreshLimits();
    disconnect();
    expect(vi.getTimerCount()).toBe(0);
    expect(store.getSnapshot().refresh.coolingDown).toBe(false);
  });
});

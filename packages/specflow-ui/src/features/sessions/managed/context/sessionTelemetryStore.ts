import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type { TelemetrySnapshot } from '@nevo/specflow-contracts/sessions';
import { isApiError } from '../../../../api';
import { writeOutcomeUnknown } from '../../../../shared/http/apiErrorCode';
import type { ManagedSessionsApi } from '../api';
import type { TelemetrySignal } from '../feed';

/** The provider-limits refresh command as the control shows it (session-actions-ux §1.2). */
export interface LimitsRefreshState {
  /** The refresh POST is in flight. */
  readonly sending: boolean;
  /** Rate-limited (429 `Retry-After`, or the snapshot's `retryAfterSeconds`): presses are ignored. */
  readonly coolingDown: boolean;
  /** The last request was not confirmed; the next press repeats it with the same `requestId`. */
  readonly unconfirmed: boolean;
  /** Definitely refused (403, 422 `CAPABILITY_UNSUPPORTED`): no control for this mount. */
  readonly refused: boolean;
  /** The refusal note, shown until the next telemetry snapshot. */
  readonly refusedNote: boolean;
}

/** What one press did; `ignored` while sending, cooling down or refused. */
export type LimitsRefreshOutcome = 'sent' | 'ignored' | 'cooldown' | 'refused' | 'unconfirmed';

export interface SessionTelemetryState {
  readonly snapshot?: TelemetrySnapshot;
  readonly refresh: LimitsRefreshState;
}

export interface SessionTelemetryStoreOptions {
  /** Least time between two telemetry reads (coalescing: at most twice per second). */
  readonly minIntervalMs?: number;
  /** Cooldown when a 429 carries no `Retry-After`. */
  readonly defaultCooldownMs?: number;
  readonly now?: () => number;
}

const idleRefresh: LimitsRefreshState = {
  sending: false,
  coolingDown: false,
  unconfirmed: false,
  refused: false,
  refusedNote: false,
};

/**
 * Session telemetry for one mounted Session: the held snapshot (revalidated with its ETag), the
 * reads that the Session stream's invalidations ask for, and the provider-limits refresh command.
 *
 * Reads are serialized and coalesced: an invalidation during a read asks for exactly one more read
 * after it, and two reads start at least `minIntervalMs` apart. A response never replaces a newer
 * snapshot of the same access generation; a new `accessRevision` replaces it outright.
 */
export function createSessionTelemetryStore(
  api: Pick<ManagedSessionsApi, 'telemetry' | 'refreshTelemetry'>,
  sessionId: string,
  options: SessionTelemetryStoreOptions = {},
) {
  const minIntervalMs = options.minIntervalMs ?? 500;
  const defaultCooldownMs = options.defaultCooldownMs ?? 30_000;
  const now = options.now ?? Date.now;

  let state: SessionTelemetryState = { refresh: idleRefresh };
  let etag: string | undefined;
  const listeners = new Set<() => void>();
  const notify = (next: SessionTelemetryState) => {
    state = next;
    for (const listener of listeners) {
      listener();
    }
  };

  const setRefresh = (changes: Partial<LimitsRefreshState>) =>
    notify({ ...state, refresh: { ...state.refresh, ...changes } });

  // Read scheduling; `connected` guards every callback that may outlive `disconnect()`.
  let connected = false;
  let inFlight: AbortController | undefined;
  let again = false;
  let lastStart = Number.NEGATIVE_INFINITY;
  let readTimer: ReturnType<typeof setTimeout> | undefined;

  function request() {
    if (!connected) {
      return;
    }

    if (inFlight) {
      again = true;

      return;
    }

    if (readTimer !== undefined) {
      return;
    }

    const wait = lastStart + minIntervalMs - now();
    if (wait > 0) {
      readTimer = setTimeout(() => {
        readTimer = undefined;
        request();
      }, wait);

      return;
    }

    void read();
  }

  async function read() {
    const controller = new AbortController();
    inFlight = controller;
    again = false;
    lastStart = now();
    try {
      const result = await api.telemetry(sessionId, etag, controller.signal);
      if (controller.signal.aborted) {
        return;
      }

      if (result.kind === 'snapshot') {
        accept(result.snapshot, result.etag);
      }
    } catch (error) {
      // Access to this Session's telemetry is gone: drop what was held instead of showing it.
      if (
        !controller.signal.aborted &&
        isApiError(error) &&
        (error.kind === 'forbidden' || error.kind === 'not-found')
      ) {
        etag = undefined;
        notify({ refresh: state.refresh });
      }
      // Other failures keep the held snapshot; the next invalidation reads again.
    } finally {
      if (inFlight === controller) {
        inFlight = undefined;
        if (again) {
          request();
        }
      }
    }
  }

  function accept(snapshot: TelemetrySnapshot, received: string | undefined) {
    const held = state.snapshot;
    if (snapshot.sessionId !== sessionId) {
      return;
    }

    if (held?.accessRevision === snapshot.accessRevision && snapshot.revision < held.revision) {
      return;
    }

    etag = received;
    notify({ snapshot, refresh: { ...state.refresh, refusedNote: false } });
    if (snapshot.refresh.retryAfterSeconds) {
      coolDown(snapshot.refresh.retryAfterSeconds * 1000);
    }
  }

  let cooldownUntil = Number.NEGATIVE_INFINITY;
  let cooldownTimer: ReturnType<typeof setTimeout> | undefined;
  function coolDown(ms: number) {
    const until = now() + ms;
    if (until <= cooldownUntil) {
      return;
    }

    cooldownUntil = until;
    if (cooldownTimer !== undefined) {
      clearTimeout(cooldownTimer);
    }

    cooldownTimer = setTimeout(() => {
      cooldownTimer = undefined;
      setRefresh({ coolingDown: false });
    }, ms);
    setRefresh({ coolingDown: true });
  }

  // Kept across presses until the Runtime confirms or definitely refuses that request.
  let pendingRequestId: string | undefined;

  /** Applies one telemetry signal of the Session stream. */
  function signal(received: TelemetrySignal) {
    if (received.kind === 'resync') {
      request();

      return;
    }

    if (!state.snapshot || received.revision > state.snapshot.revision) {
      request();
    }
  }

  /** Asks the Runtime for a new provider-limits reading (the only refreshable group). */
  async function refreshLimits(): Promise<LimitsRefreshOutcome> {
    const refresh = state.refresh;
    if (refresh.sending || refresh.coolingDown || refresh.refused) {
      return 'ignored';
    }

    const requestId = (pendingRequestId ??= crypto.randomUUID());
    setRefresh({ sending: true, unconfirmed: false });
    try {
      const receipt = await api.refreshTelemetry(sessionId, { requestId, groups: ['limits'] });
      pendingRequestId = undefined;
      setRefresh({ sending: false });
      // The receipt's revision carries the queued/running state; read it like an invalidation.
      signal({ kind: 'revision', revision: receipt.telemetryRevision });

      return 'sent';
    } catch (error) {
      if (isApiError(error) && error.kind === 'rate-limited') {
        pendingRequestId = undefined;
        setRefresh({ sending: false });
        coolDown(error.retryAfterMs ?? defaultCooldownMs);

        return 'cooldown';
      }

      if (
        isApiError(error) &&
        (error.kind === 'forbidden' || error.code === 'CAPABILITY_UNSUPPORTED')
      ) {
        pendingRequestId = undefined;
        setRefresh({ sending: false, refused: true, refusedNote: true });

        return 'refused';
      }

      // Any other definite refusal cannot succeed when repeated: the next press is a new request.
      if (!writeOutcomeUnknown(error)) {
        pendingRequestId = undefined;
      }

      setRefresh({ sending: false, unconfirmed: true });

      return 'unconfirmed';
    }
  }

  return {
    getSnapshot: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },
    /** Follows `subscribe` telemetry signals while connected; returns the disconnect. */
    connect(subscribe: (listener: (signal: TelemetrySignal) => void) => () => void) {
      connected = true;
      const unsubscribe = subscribe(signal);

      return () => {
        unsubscribe();
        connected = false;
        inFlight?.abort();
        inFlight = undefined;
        again = false;
        if (readTimer !== undefined) {
          clearTimeout(readTimer);
          readTimer = undefined;
        }
      };
    },
    signal,
    refreshLimits,
  };
}

export type SessionTelemetryStore = ReturnType<typeof createSessionTelemetryStore>;

/** The mounted Session's telemetry, fed by `subscribeTelemetry` (the feed's own stream). */
export function useSessionTelemetry(
  api: ManagedSessionsApi,
  sessionId: string,
  subscribeTelemetry: (listener: (signal: TelemetrySignal) => void) => () => void,
) {
  const store = useMemo(() => createSessionTelemetryStore(api, sessionId), [api, sessionId]);
  useEffect(() => store.connect(subscribeTelemetry), [store, subscribeTelemetry]);
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);

  return { state, refreshLimits: store.refreshLimits };
}

import type { CreateSpecRequest, CreatedSpec } from '@nevo/specflow-contracts/specs';
import { isApiError } from '../../../../api';
import { createOperationHardLimitMs, type ProjectCreationApi } from '../api/api.project';

/** What the server journal says about one Create operation. */
export type OperationReading =
  | { kind: 'completed'; created: CreatedSpec }
  | { kind: 'in-progress' }
  | { kind: 'recovery-required' }
  /** The Runtime observed the run fail after reserving it; `code` is its stable Create code. */
  | { kind: 'failed'; code: string }
  /** 404: the Engine has no record, so nothing was started under this operation id. */
  | { kind: 'not-started' }
  /** The status could not be read (connection, server); it says nothing about the operation. */
  | { kind: 'unreadable'; error: unknown };

/** How a submit or a watch ended. */
export type CreateWatchResult =
  | { kind: 'completed'; created: CreatedSpec }
  /** The server declared the request refused before doing anything (definite failure). */
  | { kind: 'failed'; error: unknown }
  | { kind: 'recovery-required' }
  /** The inspection reported the operation failed after it was accepted (stable code only). */
  | { kind: 'operation-failed'; code: string }
  | { kind: 'not-started' }
  /** The outcome stays unknown (lost answer, hard limit); only the same operation may be checked. */
  | { kind: 'unresolved'; error?: unknown };

/**
 * What the live progress stream (a display aid) says about the operation. It only shapes how soon
 * the inspection endpoint, the single source of truth, is read again:
 * - `live`: the stream is open (or not yet heard from); the poll is a slow safety net;
 * - `terminal`: the stream delivered its last event (completed, failed, recovery-required): read
 *   now, then continue with the regular backoff (a `failed` event need not move the journal);
 * - `lost`: the stream failed, dropped or is unsupported: poll with the regular backoff (3 s for the
 *   first minute, then 10 s).
 */
export type StreamHint = 'live' | 'terminal' | 'lost';

/** Mutable hint with change notification; the watcher reads it, the screen feeds it. */
export interface StreamHints {
  current(): StreamHint;
  set(hint: StreamHint): void;
  /** Resolves when the hint changes, or at once when `signal` aborts. */
  changed(signal?: AbortSignal): Promise<void>;
}

export function createStreamHints(): StreamHints {
  let hint: StreamHint = 'live';
  const waiting = new Set<() => void>();
  return {
    current: () => hint,
    set(next) {
      if (next === hint) return;
      hint = next;
      for (const wake of [...waiting]) wake();
    },
    changed: (signal) =>
      new Promise<void>((resolve) => {
        const done = () => {
          waiting.delete(done);
          signal?.removeEventListener('abort', done);
          resolve();
        };
        if (signal?.aborted) return resolve();
        waiting.add(done);
        signal?.addEventListener('abort', done, { once: true });
      }),
  };
}

export interface WatchTiming {
  readonly hardLimitMs: number;
  /** Poll interval after `watchedMs` of watching, given what the progress stream says. */
  readonly pollIntervalMs: (watchedMs: number, stream: StreamHint) => number;
  readonly now: () => number;
  /** Resolves after `ms`, or early when `signal` aborts. */
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
}

/** Safety-net poll while the progress stream is healthy; it normally delivers the end itself. */
const LIVE_STREAM_POLL_MS = 15_000;

export const defaultWatchTiming: WatchTiming = {
  hardLimitMs: createOperationHardLimitMs,
  pollIntervalMs: (watchedMs, stream) =>
    stream === 'live' ? LIVE_STREAM_POLL_MS : watchedMs < 60_000 ? 3_000 : 10_000,
  now: () => Date.now(),
  sleep: (ms, signal) =>
    new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms);
      signal?.addEventListener(
        'abort',
        () => {
          clearTimeout(timer);
          resolve();
        },
        { once: true },
      );
    }),
};

export interface WatchHooks {
  /** The server accepted the operation (202) and runs it detached: it is now shown as running. */
  readonly onAccepted?: () => void;
  /** Stops watching (e.g. the form unmounted). The request already sent is never cancelled. */
  readonly signal?: AbortSignal;
  /** What the progress stream says (display aid); without it the regular backoff applies. */
  readonly stream?: StreamHints;
}

/** Reads the operation status once (`not-found` means not started, never an error here). */
export async function readOperation(
  api: Pick<ProjectCreationApi, 'inspectOperation'>,
  operationId: string,
  signal?: AbortSignal,
): Promise<OperationReading> {
  try {
    const inspection = await api.inspectOperation(operationId, signal);
    if ('specId' in inspection) return { kind: 'completed', created: inspection };
    if (inspection.status === 'failed') return { kind: 'failed', code: inspection.code };
    return { kind: inspection.status };
  } catch (error) {
    if (isApiError(error) && error.kind === 'not-found') return { kind: 'not-started' };
    return { kind: 'unreadable', error };
  }
}

const isAuthFailure = (error: unknown) =>
  isApiError(error) && (error.kind === 'unauthenticated' || error.kind === 'forbidden');

/** How long the server asked a rate-limited client to wait (`Retry-After`); 0 when it said nothing. */
const retryAfterOf = (reading: OperationReading): number =>
  reading.kind === 'unreadable' &&
  isApiError(reading.error) &&
  reading.error.kind === 'rate-limited'
    ? (reading.error.retryAfterMs ?? 0)
    : 0;

/** A definite refusal proves the server changed nothing; anything else may have been committed. */
function interpretRejection(error: unknown): CreateWatchResult {
  return isApiError(error) && error.outcome === 'not-applied'
    ? { kind: 'failed', error }
    : { kind: 'unresolved', error };
}

/**
 * Sends the Create request in async mode (`Prefer: respond-async`) and follows it.
 *
 * - 202: the Runtime reserved the operation and works detached; `onAccepted` is called and the
 *   operation is watched until the inspection endpoint, the single source of truth, concludes. The
 *   progress stream only decides how soon it is read (see {@link StreamHint}).
 * - 201: an older Runtime ignored the preference and answered synchronously with the result.
 * - A definite refusal (4xx) is a failure; a request that fails with an unknown outcome ends as
 *   `unresolved`, so the user decides whether to check (same operation id) instead of the UI guessing.
 *
 * The request is never abandoned or cancelled; only the watching stops with `hooks.signal`.
 */
export async function submitCreateOperation(
  api: Pick<ProjectCreationApi, 'create' | 'inspectOperation'>,
  input: CreateSpecRequest & { operationId: string },
  hooks: WatchHooks = {},
  timing: WatchTiming = defaultWatchTiming,
): Promise<CreateWatchResult> {
  const startedAt = timing.now();
  let answer: Awaited<ReturnType<ProjectCreationApi['create']>>;
  try {
    answer = await api.create(input);
  } catch (error) {
    return interpretRejection(error);
  }
  if ('specId' in answer) return { kind: 'completed', created: answer };
  if (hooks.signal?.aborted) return { kind: 'unresolved' };
  hooks.onAccepted?.();
  return watchOperation(api, input.operationId, { startedAt, hooks, timing });
}

/** Watches an operation whose request this page did not send (resume after a reload or a check). */
export function resumeCreateOperation(
  api: Pick<ProjectCreationApi, 'inspectOperation'>,
  operationId: string,
  options: { startedAt?: number; hooks?: WatchHooks; timing?: WatchTiming } = {},
): Promise<CreateWatchResult> {
  const timing = options.timing ?? defaultWatchTiming;
  return watchOperation(api, operationId, {
    startedAt: options.startedAt ?? timing.now(),
    hooks: options.hooks ?? {},
    timing,
  });
}

async function watchOperation(
  api: Pick<ProjectCreationApi, 'inspectOperation'>,
  operationId: string,
  context: { startedAt: number; hooks: WatchHooks; timing: WatchTiming },
): Promise<CreateWatchResult> {
  const { startedAt, hooks, timing } = context;
  const watchStartedAt = timing.now();
  for (;;) {
    if (hooks.signal?.aborted) return { kind: 'unresolved' };
    const hintBefore = hooks.stream?.current();
    const reading = await readOperation(api, operationId, hooks.signal);
    if (reading.kind === 'completed') return reading;
    if (reading.kind === 'recovery-required') return reading;
    if (reading.kind === 'failed') return { kind: 'operation-failed', code: reading.code };
    // The session or the Create capability is gone: polling cannot succeed, so the owner is told
    // (the operation itself is unaffected and stays stored for a check after signing in again).
    if (reading.kind === 'unreadable' && isAuthFailure(reading.error))
      return { kind: 'unresolved', error: reading.error };
    // The operation was accepted (or found stored), so a missing record is final.
    if (reading.kind === 'not-started') return reading;
    // The limit bounds how long this page waits; one reading is always made, even after a reload.
    if (timing.now() - startedAt >= timing.hardLimitMs) return { kind: 'unresolved' };
    // The stream spoke while this reading was in flight: read again at once, do not sleep.
    if (hooks.stream && hooks.stream.current() !== hintBefore) continue;
    const interval = timing.pollIntervalMs(
      timing.now() - watchStartedAt,
      hooks.stream?.current() ?? 'lost',
    );
    await pause(Math.max(interval, retryAfterOf(reading)), hooks, timing);
  }
}

/** Sleeps `ms`, ending early when the watch is aborted or the progress stream changes its hint. */
async function pause(ms: number, hooks: WatchHooks, timing: WatchTiming): Promise<void> {
  const local = new AbortController();
  const stop = () => local.abort();
  hooks.signal?.addEventListener('abort', stop, { once: true });
  try {
    const sleeping = timing.sleep(ms, local.signal);
    await (hooks.stream ? Promise.race([sleeping, hooks.stream.changed(local.signal)]) : sleeping);
  } finally {
    local.abort();
    hooks.signal?.removeEventListener('abort', stop);
  }
}

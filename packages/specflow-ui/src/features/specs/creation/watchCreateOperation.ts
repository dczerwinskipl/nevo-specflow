import type { CreateSpecRequest, CreatedSpec } from '@nevo/specflow-contracts/specs';
import { isApiError } from '../../../api';
import {
  createOperationHardLimitMs,
  createSoftDeadlineMs,
  type ProjectCreationApi,
} from './api.project';

/** What the server journal says about one Create operation. */
export type OperationReading =
  | { kind: 'completed'; created: CreatedSpec }
  | { kind: 'in-progress' }
  | { kind: 'recovery-required' }
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
  | { kind: 'not-started' }
  /** The outcome stays unknown (lost answer, hard limit); only the same operation may be checked. */
  | { kind: 'unresolved'; error?: unknown };

export interface WatchTiming {
  readonly softDeadlineMs: number;
  readonly hardLimitMs: number;
  /** Poll interval after `watchedMs` of watching: fast at first, then relaxed. */
  readonly pollIntervalMs: (watchedMs: number) => number;
  readonly now: () => number;
  /** Resolves after `ms`, or early when `signal` aborts. */
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
}

export const defaultWatchTiming: WatchTiming = {
  softDeadlineMs: createSoftDeadlineMs,
  hardLimitMs: createOperationHardLimitMs,
  pollIntervalMs: (watchedMs) => (watchedMs < 60_000 ? 3_000 : 10_000),
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
  /** The submit outlived its soft deadline: the operation is now shown as running. */
  readonly onMonitoring?: () => void;
  /** Stops watching (e.g. the form unmounted). The request already sent is never cancelled. */
  readonly signal?: AbortSignal;
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
    return { kind: inspection.status };
  } catch (error) {
    if (isApiError(error) && error.kind === 'not-found') return { kind: 'not-started' };
    return { kind: 'unreadable', error };
  }
}

type PostSettled =
  { kind: 'completed'; created: CreatedSpec } | { kind: 'rejected'; error: unknown };

/** A definite refusal proves the server changed nothing; anything else may have been committed. */
function interpretRejection(error: unknown): CreateWatchResult {
  return isApiError(error) && error.outcome === 'not-applied'
    ? { kind: 'failed', error }
    : { kind: 'unresolved', error };
}

/**
 * Sends the Create request and watches it. The request is never abandoned: when no answer arrives
 * within the soft deadline the operation is shown as running (`onMonitoring`) and its journal is
 * polled while the original request stays in flight; the first conclusive answer wins. A request
 * that fails with an unknown outcome before the soft deadline ends as `unresolved`, so the user
 * decides whether to check (same operation id) instead of the UI guessing.
 */
export async function submitCreateOperation(
  api: Pick<ProjectCreationApi, 'create' | 'inspectOperation'>,
  input: CreateSpecRequest & { operationId: string },
  hooks: WatchHooks = {},
  timing: WatchTiming = defaultWatchTiming,
): Promise<CreateWatchResult> {
  const startedAt = timing.now();
  const post: Promise<PostSettled> = api.create(input).then(
    (created): PostSettled => ({ kind: 'completed', created }),
    (error: unknown): PostSettled => ({ kind: 'rejected', error }),
  );
  const early = await Promise.race([
    post,
    timing.sleep(timing.softDeadlineMs, hooks.signal).then(() => undefined),
  ]);
  if (early?.kind === 'completed') return early;
  if (early?.kind === 'rejected') return interpretRejection(early.error);
  if (hooks.signal?.aborted) return { kind: 'unresolved' };
  hooks.onMonitoring?.();
  return watchOperation(api, input.operationId, { post, startedAt, hooks, timing });
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
  context: {
    post?: Promise<PostSettled>;
    startedAt: number;
    hooks: WatchHooks;
    timing: WatchTiming;
  },
): Promise<CreateWatchResult> {
  const { post, startedAt, hooks, timing } = context;
  const watchStartedAt = timing.now();
  let settled: PostSettled | undefined;
  void post?.then((result) => {
    settled = result;
  });
  // A resumed watch has no request of its own: a missing record is final. With a request in
  // flight it may simply not have been journaled yet, until that request has failed too.
  let requestLost = post === undefined;
  for (;;) {
    if (settled?.kind === 'completed') return settled;
    if (settled?.kind === 'rejected') {
      const verdict = interpretRejection(settled.error);
      if (verdict.kind === 'failed') return verdict;
      requestLost = true;
    }
    if (hooks.signal?.aborted) return { kind: 'unresolved' };
    const reading = await readOperation(api, operationId, hooks.signal);
    if (reading.kind === 'completed') return reading;
    if (reading.kind === 'recovery-required') return reading;
    if (reading.kind === 'not-started' && requestLost) return reading;
    // The limit bounds how long this page waits; one reading is always made, even after a reload.
    if (timing.now() - startedAt >= timing.hardLimitMs) return { kind: 'unresolved' };
    const wait = timing.sleep(timing.pollIntervalMs(timing.now() - watchStartedAt), hooks.signal);
    await (post ? Promise.race([wait, post.then(() => undefined)]) : wait);
  }
}

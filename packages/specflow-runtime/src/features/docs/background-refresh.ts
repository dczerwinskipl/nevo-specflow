import type { IndexProgress as RefreshProgress, SemanticIndexResult } from '@nevo/specflow-docs';
import type { FastifyBaseLogger } from 'fastify';

/** One full refresh of the index; `signal` stops its endpoint requests. */
export type RunRefresh = (
  signal: AbortSignal,
  onProgress: (progress: RefreshProgress) => void,
) => Promise<SemanticIndexResult>;

/**
 * - `started`: a refresh was started now;
 * - `running`: one already runs;
 * - `cooling-down`: the last one failed less than `REFRESH_RETRY_AFTER_MS` ago (`message` says
 *   why), so none is started yet;
 * - `stopped`: the Runtime is closing.
 */
export type RefreshStart =
  | { readonly status: 'started' | 'running' | 'stopped' }
  | { readonly status: 'cooling-down'; readonly message: string };

/**
 * How long a failed refresh (for example an index that cannot be written) keeps the next one from
 * starting, so searches meanwhile do not retry it on every request.
 */
export const REFRESH_RETRY_AFTER_MS = 60_000;

export interface BackgroundRefresh {
  /** Starts a refresh without waiting for it, unless one runs, the last failed recently or it stopped. */
  start(): RefreshStart;
  /** The running refresh, with its progress once it embeds; `undefined` while none runs. */
  current(): { readonly progress: RefreshProgress | undefined } | undefined;
  /** Stops the running refresh's endpoint requests and waits until it has ended (lock released). */
  stop(): Promise<void>;
}

/**
 * The Runtime's background refresh of the semantic index (ADR 0020 §5): started when the Runtime is
 * ready and again by a search that finds a gap larger than it embeds (the in-process catch-up). At
 * most one runs at a time; start and readiness never wait for it, and searches meanwhile answer
 * lexically with `index-building`. A run never rejects: a failure is logged and a later search
 * retries once `REFRESH_RETRY_AFTER_MS` has passed. `stop` (Runtime close) aborts the running refresh and starts no other.
 */
export function createBackgroundRefresh(
  run: RunRefresh,
  log: FastifyBaseLogger,
  now: () => number = Date.now,
): BackgroundRefresh {
  const stopping = new AbortController();
  let failed: { readonly at: number; readonly message: string } | undefined;
  let running:
    { readonly promise: Promise<void>; readonly state: { progress?: RefreshProgress } } | undefined;

  const refresh = async (state: { progress?: RefreshProgress }): Promise<void> => {
    // Yield first: opening the corpus scans it synchronously, which must not delay readiness or
    // the search that started the refresh.
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (stopping.signal.aborted) {
      return;
    }

    try {
      const result = await run(stopping.signal, (progress) => {
        state.progress = progress;
      });
      failed = undefined;
      // `index-building` here means another process holds the index and brings it up to date.
      if (
        result.reason !== undefined &&
        result.reason.code !== 'index-building' &&
        !stopping.signal.aborted
      ) {
        failed = { at: now(), message: result.reason.message };
        log.warn({ reason: result.reason }, 'The documentation index was not refreshed.');
      }
    } catch (error) {
      failed = { at: now(), message: error instanceof Error ? error.message : String(error) };
      log.warn({ err: error }, 'The documentation index was not refreshed.');
    }
  };

  return {
    start() {
      if (stopping.signal.aborted) {
        return { status: 'stopped' };
      }

      if (running !== undefined) {
        return { status: 'running' };
      }

      if (failed !== undefined && now() - failed.at < REFRESH_RETRY_AFTER_MS) {
        return { status: 'cooling-down', message: failed.message };
      }

      const state: { progress?: RefreshProgress } = {};
      running = {
        state,
        promise: refresh(state).finally(() => {
          running = undefined;
        }),
      };

      return { status: 'started' };
    },
    current() {
      return running === undefined ? undefined : { progress: running.state.progress };
    },
    async stop() {
      stopping.abort();
      await running?.promise;
    },
  };
}

import type { IndexProgress as RefreshProgress, SemanticIndexResult } from '@nevo/specflow-docs';
import type { FastifyBaseLogger } from 'fastify';

/** One full refresh of the index; `signal` stops its endpoint requests. */
export type RunRefresh = (
  signal: AbortSignal,
  onProgress: (progress: RefreshProgress) => void,
) => Promise<SemanticIndexResult>;

export interface BackgroundRefresh {
  /** Starts a refresh without waiting for it, unless one runs or the refresh was stopped. */
  start(): void;
  /** The running refresh, with its progress once it embeds; `undefined` while none runs. */
  current(): { readonly progress: RefreshProgress | undefined } | undefined;
  /** Stops the running refresh's endpoint requests and waits until it has ended (lock released). */
  stop(): Promise<void>;
}

/**
 * The Runtime's background refresh of the semantic index (ADR 0020 §5): started when the Runtime is
 * ready and again by a search that finds a gap larger than it embeds (the in-process catch-up). At
 * most one runs at a time; start and readiness never wait for it, and searches meanwhile answer
 * lexically with `index-building`. A run never rejects: a failure is logged and a later search or
 * start retries. `stop` (Runtime close) aborts the running refresh and starts no other.
 */
export function createBackgroundRefresh(
  run: RunRefresh,
  log: FastifyBaseLogger,
): BackgroundRefresh {
  const stopping = new AbortController();
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
      // `index-building` here means another process holds the index and brings it up to date.
      if (
        result.reason !== undefined &&
        result.reason.code !== 'index-building' &&
        !stopping.signal.aborted
      ) {
        log.warn({ reason: result.reason }, 'The documentation index was not refreshed.');
      }
    } catch (error) {
      log.warn({ err: error }, 'The documentation index was not refreshed.');
    }
  };

  return {
    start() {
      if (running !== undefined || stopping.signal.aborted) {
        return;
      }

      const state: { progress?: RefreshProgress } = {};
      running = {
        state,
        promise: refresh(state).finally(() => {
          running = undefined;
        }),
      };
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

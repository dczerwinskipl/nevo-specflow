import type { IndexProgress as RefreshProgress } from '@nevo/specflow-docs';
import type { DocsSearchReason } from '@nevo/specflow-contracts/docs';
import type { FastifyBaseLogger } from 'fastify';

/**
 * One background job of an index (a full refresh, or a seed copy); `signal` stops its endpoint
 * requests. A `reason` other than `index-building` is a failure that is logged and cools down.
 */
export type RunRefresh = (
  signal: AbortSignal,
  onProgress: (progress: RefreshProgress) => void,
) => Promise<{ readonly reason?: DocsSearchReason }>;

/**
 * The Runtime-wide slot of background index jobs (E8): at most one job of any workspace runs at a
 * time, so several checkouts never embed at once. `claim` answers the release of the slot, or
 * `undefined` while another job holds it; nothing is queued, a later request asks again.
 */
export interface RefreshSlot {
  claim(): (() => void) | undefined;
  /** Whether a job of any index holds the slot now (the shared endpoint is busy with it). */
  held(): boolean;
}

export function createRefreshSlot(): RefreshSlot {
  let held = false;

  return {
    claim() {
      if (held) {
        return undefined;
      }

      held = true;
      let released = false;

      return () => {
        if (!released) {
          released = true;
          held = false;
        }
      };
    },
    held: () => held,
  };
}

/**
 * - `started`: a job was started now;
 * - `running`: one of this index already runs;
 * - `waiting`: another index's job holds the Runtime-wide slot; a later request starts this one;
 * - `cooling-down`: the last one failed less than `REFRESH_RETRY_AFTER_MS` ago (the failure was
 *   logged), so none is started yet;
 * - `stopped`: the index is released or the Runtime is closing.
 */
export interface RefreshStart {
  readonly status: 'started' | 'running' | 'waiting' | 'cooling-down' | 'stopped';
}

/**
 * How long a failed refresh (for example an index that cannot be written) keeps the next one from
 * starting, so searches meanwhile do not retry it on every request.
 */
export const REFRESH_RETRY_AFTER_MS = 60_000;

export interface BackgroundRefresh {
  /**
   * Starts `run` without waiting for it, unless a job of this index runs, the slot is taken, the
   * last job failed recently or the refresh was stopped.
   */
  start(run: RunRefresh): RefreshStart;
  /** The running job, with its progress once it embeds; `undefined` while none runs. */
  current(): { readonly progress: RefreshProgress | undefined } | undefined;
  /** Stops the running job's endpoint requests and waits until it has ended (lock released). */
  stop(): Promise<void>;
}

/**
 * The background jobs of one index (ADR 0020 §5): the start refresh of the Runtime's checkout, a
 * search's catch-up of a large gap and a seed copy. At most one runs per index, and at most one in
 * the Runtime (`slot`); start and readiness never wait for it, and searches meanwhile answer
 * lexically with `index-building`. A run never rejects: a failure is logged and a later request
 * retries once `REFRESH_RETRY_AFTER_MS` has passed. `stop` aborts the running job and starts no
 * other.
 */
export function createBackgroundRefresh(
  slot: RefreshSlot,
  log: FastifyBaseLogger,
  now: () => number = Date.now,
): BackgroundRefresh {
  const stopping = new AbortController();
  // When the last job failed; its error is logged, never answered.
  let failedAt: number | undefined;
  let running:
    { readonly promise: Promise<void>; readonly state: { progress?: RefreshProgress } } | undefined;

  const refresh = async (run: RunRefresh, state: { progress?: RefreshProgress }): Promise<void> => {
    // Yield first, so starting a refresh never delays readiness or the search that started it;
    // the corpus scan itself is asynchronous.
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (stopping.signal.aborted) {
      return;
    }

    try {
      const result = await run(stopping.signal, (progress) => {
        state.progress = progress;
      });
      failedAt = undefined;
      // `index-building` here means another process holds the index and brings it up to date.
      if (
        result.reason !== undefined &&
        result.reason.code !== 'index-building' &&
        !stopping.signal.aborted
      ) {
        failedAt = now();
        log.warn({ reason: result.reason }, 'The documentation index was not refreshed.');
      }
    } catch (error) {
      failedAt = now();
      log.warn({ err: error }, 'The documentation index was not refreshed.');
    }
  };

  return {
    start(run) {
      if (stopping.signal.aborted) {
        return { status: 'stopped' };
      }

      if (running !== undefined) {
        return { status: 'running' };
      }

      if (failedAt !== undefined && now() - failedAt < REFRESH_RETRY_AFTER_MS) {
        return { status: 'cooling-down' };
      }

      const release = slot.claim();
      if (release === undefined) {
        return { status: 'waiting' };
      }

      const state: { progress?: RefreshProgress } = {};
      running = {
        state,
        promise: refresh(run, state).finally(() => {
          running = undefined;
          release();
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

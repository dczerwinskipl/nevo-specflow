import type { FastifyBaseLogger } from 'fastify';

import type { ProjectDocs } from './project-docs';

export interface StartRefresh {
  /** Starts the refresh without waiting for it. */
  start(): void;
  /** Stops the refresh's endpoint requests and waits until it has ended (its lock released). */
  stop(): Promise<void>;
}

/**
 * The Runtime start refresh (ADR 0020 §5): one full refresh of the semantic index in the
 * background. Start and readiness never wait for it; searches meanwhile answer lexically with
 * `index-building`. It never rejects: a failure is logged and the next search or start retries.
 */
export function createStartRefresh(docs: ProjectDocs, log: FastifyBaseLogger): StartRefresh {
  const stopping = new AbortController();
  let running: Promise<void> | undefined;

  const run = async (): Promise<void> => {
    // Yield first: opening the corpus scans it synchronously, which must not delay readiness.
    await new Promise<void>((resolve) => setImmediate(resolve));
    if (stopping.signal.aborted) {
      return;
    }

    try {
      const result = await docs.refresh(stopping.signal);
      if (result.reason !== undefined && !stopping.signal.aborted) {
        log.warn(
          { reason: result.reason },
          'The documentation index was not refreshed on Runtime start.',
        );
      }
    } catch (error) {
      log.warn({ err: error }, 'The documentation index was not refreshed on Runtime start.');
    }
  };

  return {
    start() {
      running ??= run();
    },
    async stop() {
      stopping.abort();
      await running;
    },
  };
}

import {
  buildDocsIndex,
  openDocsSearch,
  openProjectIndex,
  readIndexActivity,
  searchDocumentationWithLeftOut,
  seedIndexIfMissing,
  type CreateEmbeddingProvider,
  type DocsChunks,
  type DocsConfiguration,
  type DocsCorpus,
  type DocsIndex,
  type DocsSearch,
  type DocsSearchRequest,
  type DocsSearchWithLeftOut,
  type IndexCatchUp,
  type IndexProgress,
} from '@nevo/specflow-docs';
import type { DocsSearchReason } from '@nevo/specflow-contracts/docs';
import type { FastifyBaseLogger } from 'fastify';

import {
  createBackgroundRefresh,
  type RefreshSlot,
  type RefreshStart,
  type RunRefresh,
} from './background-refresh';

export interface CorpusInstanceOptions {
  /** Absolute checkout root; the index lives in its `.nevo/local/cache/docs-index/`. */
  readonly root: string;
  readonly corpus: DocsCorpus;
  /**
   * The checkout's `docs` settings with the Runtime's trusted `ai.embeddings` (C10): a checkout's
   * own embedding settings never reach an instance.
   */
  readonly configuration: DocsConfiguration;
  /** Environment the embedding API key variable is read from. */
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly createProvider?: CreateEmbeddingProvider;
  readonly log: FastifyBaseLogger;
  /** The Runtime-wide slot every background job of every instance runs in. */
  readonly slot: RefreshSlot;
  /**
   * Seed a missing index from Project Home's (`from`) once, as the first background job, when
   * semantic search is on (ADR 0022 §3). Absent for Project Home itself.
   */
  readonly seed?: { readonly from: string; readonly settingsFingerprint: string };
}

/** What an operation of an instance reads; valid only inside `CorpusInstance.use`. */
export interface CorpusReads {
  readonly corpus: DocsCorpus;
  readonly index: DocsIndex;
  readonly configuration: DocsConfiguration;
  /** The corpus as chunks now; load it once per request and hand the snapshot on. */
  load(): Promise<DocsChunks>;
  /** A search over `snapshot`, counting the proposals it left out. */
  searchWithLeftOut(
    snapshot: DocsChunks,
    request: DocsSearchRequest,
  ): Promise<DocsSearchWithLeftOut>;
  /** The progress of the running background job, if one runs and embeds. */
  progress(): IndexProgress | undefined;
}

/**
 * One checkout's documentation as the Runtime serves it: one `DocsIndex` (one write admission for
 * every writer), one search and one background refresh. Disposal stops the refresh, waits for it
 * and for every operation in progress, so the instance writes nothing afterwards.
 */
export interface CorpusInstance {
  /**
   * Runs `operation` and resolves its result, or `undefined` without running it once disposal has
   * begun. A pending seed is started first, when the Runtime-wide slot is free.
   */
  use<T>(operation: (reads: CorpusReads) => Promise<T>): Promise<T | undefined>;
  /** Starts a full refresh unless a job runs (the start refresh of the Runtime's checkout). */
  startRefresh(): RefreshStart;
  dispose(): Promise<void>;
}

const SEEDING = {
  code: 'index-building',
  message:
    'The documentation index is being prepared from Project Home; searches are lexical until then.',
} as const;

/**
 * While a background job holds the Runtime-wide slot (this index's, or `'other'`: another
 * checkout's), a search embeds nothing (neither the read-time refresh nor the query): the shared
 * endpoint is busy with the job's batches, so a query would wait behind them up to the query
 * timeout and then report the endpoint as failed. The search answers lexically at once.
 */
function refreshingReason(
  running: { readonly progress: IndexProgress | undefined } | 'other',
): DocsSearchReason {
  if (running === 'other') {
    return {
      code: 'index-building',
      message:
        "The Runtime is updating another checkout's documentation index; searches are lexical until it has finished.",
    };
  }

  const { progress } = running;

  return {
    code: 'index-building',
    message: `The Runtime is updating the documentation index in the background${
      progress === undefined
        ? ''
        : ` (${String(progress.embedded)}/${String(progress.total)} chunks)`
    }; searches are lexical until it has finished.`,
  };
}

/** Opens the index (the uncached write admission, its Git check once now) and the search. */
export async function openCorpusInstance(options: CorpusInstanceOptions): Promise<CorpusInstance> {
  const { root, corpus, configuration, env, createProvider, log, seed } = options;
  const refresh = createBackgroundRefresh(options.slot, log);
  const index = await openProjectIndex(root, corpus, configuration);

  const catchUp: IndexCatchUp = {
    async running() {
      const current = refresh.current();
      if (current !== undefined) {
        const { progress } = current;

        return `the Runtime is updating it in the background${
          progress === undefined
            ? ''
            : ` (${String(progress.embedded)}/${String(progress.total)} chunks)`
        }`;
      }

      const activity = await readIndexActivity(index.directory);

      return activity.state === 'updating' ? 'another process is updating it' : undefined;
    },
    start() {
      const start = refresh.start(refreshRun);
      if (start.status === 'running') {
        refreshRequested = true;
      }

      switch (start.status) {
        case 'started':
          return Promise.resolve('the Runtime started updating it in the background');
        case 'running':
          return Promise.resolve('the Runtime is updating it in the background');
        case 'waiting':
          return Promise.resolve(
            "the Runtime is updating another checkout's index and starts this one on a later search",
          );
        case 'cooling-down':
          // No raw error text or path in a response; the failure itself is logged.
          return Promise.resolve(
            "the Runtime's last background update failed; it retries within a minute",
          );
        case 'stopped':
          return Promise.resolve('the Runtime is closing and does not update it');
      }
    },
  };

  const search: DocsSearch = openDocsSearch({
    corpus,
    configuration,
    env,
    index,
    catchUp,
    ...(createProvider ? { createProvider } : {}),
  });

  // Seeding needs semantic search with a usable trusted endpoint; its probe uses the query
  // provider, bounded like a search.
  const seedProvider =
    seed !== undefined && 'providers' in search.vectors
      ? search.vectors.providers.query
      : undefined;
  let seedPending = seedProvider !== undefined;
  // Until the seed has run, a search does not refresh the index itself, so a first small gap
  // never creates an index that the seed copy would then find present.
  let seeded = !seedPending;
  // A search or catch-up asked for while a seed is pending or runs: that job goes on to refresh.
  let refreshRequested = false;
  const seedOnce = async () => {
    if (!seedPending || seed === undefined || seedProvider === undefined) {
      return;
    }

    seedPending = false;
    try {
      const outcome = await seedIndexIfMissing(
        index,
        { checkoutRoot: seed.from },
        { settingsFingerprint: seed.settingsFingerprint, provider: seedProvider },
      );
      log.debug({ outcome, root }, 'Documentation index seed attempted.');
    } finally {
      seeded = true;
    }
  };

  const refreshRun: RunRefresh = async (signal, onProgress) => {
    await seedOnce();
    refreshRequested = false;

    return signal.aborted
      ? {}
      : buildDocsIndex(
          index,
          configuration,
          { env, signal, ...(createProvider ? { createProvider } : {}) },
          onProgress,
        );
  };

  const seedRun: RunRefresh = async (signal, onProgress) => {
    await seedOnce();

    return refreshRequested ? refreshRun(signal, onProgress) : {};
  };

  const reads: CorpusReads = {
    corpus,
    index,
    configuration,
    load: () => search.chunks.load(),
    // The search ranks the snapshot the request loaded, so its revision is the result's.
    searchWithLeftOut: (snapshot, request) => {
      if (!seeded) {
        // The seed job goes on to refresh the index once it has copied what it could.
        refreshRequested = true;
      }

      // The endpoint is the Runtime's, so another checkout's job keeps it busy too.
      const running = refresh.current() ?? (options.slot.held() ? 'other' : undefined);

      return searchDocumentationWithLeftOut(
        {
          chunks: { load: () => Promise.resolve(snapshot) },
          vectors: !seeded
            ? { reason: SEEDING }
            : running !== undefined
              ? { reason: refreshingReason(running) }
              : search.vectors,
        },
        request,
      );
    },
    progress: () => refresh.current()?.progress,
  };

  let disposed = false;
  const inProgress = new Set<Promise<void>>();

  return {
    use(operation) {
      if (disposed) {
        return Promise.resolve(undefined);
      }

      if (seedPending) {
        refresh.start(seedRun);
      }

      const result = operation(reads);
      const settled = result.then(
        () => undefined,
        () => undefined,
      );
      inProgress.add(settled);
      void settled.finally(() => inProgress.delete(settled));

      return result;
    },
    startRefresh: () => refresh.start(refreshRun),
    async dispose() {
      disposed = true;
      await refresh.stop();
      await Promise.all([...inProgress]);
    },
  };
}

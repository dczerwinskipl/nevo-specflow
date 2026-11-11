import {
  buildDocsIndex,
  checkIndexAccess,
  openDocsIndex,
  openDocsSearch,
  openFileSystemCorpus,
  createReachabilityCache,
  readIndexActivity,
  searchDocumentation,
  semanticStatus,
  type CreateEmbeddingProvider,
  type DocsConfiguration,
  type DocsSearch,
  type DocsSearchRequest,
  type IndexAccess,
  type IndexCatchUp,
} from '@nevo/specflow-docs';
import type { DocsSearchResult, DocsStatus } from '@nevo/specflow-contracts/docs';
import type { FastifyBaseLogger } from 'fastify';

import { createBackgroundRefresh } from './background-refresh';

export interface ProjectDocsOptions {
  /** Absolute project root; the corpus is its `docs.root`, the index lives below its `.nevo/`. */
  readonly projectRoot: string;
  readonly configuration: DocsConfiguration;
  /** Environment the embedding API key variable is read from. */
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly createProvider?: CreateEmbeddingProvider;
  /** Where the background refresh logs a failure. */
  readonly log: FastifyBaseLogger;
}

/**
 * The project's documentation as one Runtime process serves it: one index, one search and one
 * background refresh of the index (the start refresh and the search catch-up).
 */
export interface ProjectDocs {
  /**
   * Throws `DocsConfigError` while `docs.root` is not a directory and `DocsCorpusInvalidError` while
   * the corpus fails validation; both are the project's current state, checked again next time.
   * A gap larger than the search embeds starts the background refresh.
   */
  search(request: DocsSearchRequest): Promise<DocsSearchResult>;
  /** The semantic search status, with the progress of a running refresh; throws like `search`. */
  status(): Promise<DocsStatus>;
  /** Starts the background refresh unless one runs (the Runtime start refresh). */
  startRefresh(): void;
  /** Stops the background refresh and waits until it has ended (its lock released). */
  close(): Promise<void>;
}

const FOLLOW = '`GET /api/docs/status` reports its progress';

export function createProjectDocs(options: ProjectDocsOptions): ProjectDocs {
  const { projectRoot, configuration, env, createProvider } = options;
  let opened:
    { readonly index: ReturnType<typeof openDocsIndex>; readonly search: DocsSearch } | undefined;
  // The Git check of the index directory, once per process (`openProjectIndex`).
  let access: Promise<IndexAccess> | undefined;
  // Status requests of this instance share endpoint probes for a few seconds.
  const reachability = createReachabilityCache();

  const refresh = createBackgroundRefresh(
    async (signal, onProgress) =>
      buildDocsIndex(
        (await open()).index,
        configuration,
        { env, signal, ...(createProvider ? { createProvider } : {}) },
        onProgress,
      ),
    options.log,
  );

  // The in-process catch-up: this process's background refresh, never another process.
  const catchUp: IndexCatchUp = {
    async running() {
      const current = refresh.current();
      if (current !== undefined) {
        const { progress } = current;

        return `the Runtime is updating it in the background${
          progress === undefined
            ? ''
            : ` (${String(progress.embedded)}/${String(progress.total)} chunks)`
        }; ${FOLLOW}`;
      }

      const activity = await readIndexActivity((await open()).index.directory);

      return activity.state === 'updating'
        ? `another process is updating it; ${FOLLOW}`
        : undefined;
    },
    start() {
      const start = refresh.start();

      switch (start.status) {
        case 'started':
          return Promise.resolve(`the Runtime started updating it in the background; ${FOLLOW}`);
        case 'running':
          return Promise.resolve(`the Runtime is updating it in the background; ${FOLLOW}`);
        case 'cooling-down':
          return Promise.resolve(
            `the Runtime's last background update failed (${start.message}); it retries within a minute`,
          );
        case 'stopped':
          return Promise.resolve('the Runtime is closing and does not update it');
      }
    },
  };

  // Opened on first use and kept: the store decodes a generation's vectors once and the chunk
  // source keeps the parsed corpus. A missing root is not kept, so creating it later is enough.
  // `.nevo/local/` must be ignored by Git before anything is written there (`checkIndexAccess`).
  const open = async () => {
    // Only an endpoint lets anything write the index (`openProjectIndex` applies the same rule).
    const checked: IndexAccess =
      configuration.embeddings === undefined
        ? { writable: true }
        : await (access ??= checkIndexAccess(projectRoot));
    if (opened === undefined) {
      const corpus = openFileSystemCorpus(projectRoot, configuration.docs);
      const index = openDocsIndex(projectRoot, corpus, checked);
      opened = {
        index,
        search: openDocsSearch({
          corpus,
          configuration,
          env,
          index,
          catchUp,
          ...(createProvider ? { createProvider } : {}),
        }),
      };
    }

    return opened;
  };

  return {
    search: async (request) => searchDocumentation((await open()).search, request),
    status: async () =>
      semanticStatus(
        (await open()).index,
        configuration,
        { env, ...(createProvider ? { createProvider } : {}) },
        { backgroundCatchUp: true, reachability },
      ),
    startRefresh: () => {
      refresh.start();
    },
    close: () => refresh.stop(),
  };
}

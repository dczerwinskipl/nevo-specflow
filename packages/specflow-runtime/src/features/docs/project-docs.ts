import {
  buildDocsIndex,
  openDocsIndex,
  openDocsSearch,
  openFileSystemCorpus,
  readIndexActivity,
  searchDocumentation,
  semanticStatus,
  type CreateEmbeddingProvider,
  type DocsConfiguration,
  type DocsSearch,
  type DocsSearchRequest,
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

  const refresh = createBackgroundRefresh(
    (signal, onProgress) =>
      buildDocsIndex(
        open().index,
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

      const activity = await readIndexActivity(open().index.directory);

      return activity.state === 'updating'
        ? `another process is updating it; ${FOLLOW}`
        : undefined;
    },
    start() {
      refresh.start();

      return Promise.resolve(`the Runtime started updating it in the background; ${FOLLOW}`);
    },
  };

  // Opened on first use and kept: the store decodes a generation's vectors once and the chunk
  // source keeps the parsed corpus. A missing root is not kept, so creating it later is enough.
  const open = () => {
    if (opened === undefined) {
      const corpus = openFileSystemCorpus(projectRoot, configuration.docs);
      const index = openDocsIndex(projectRoot, corpus);
      opened = {
        index,
        search: openDocsSearch({
          projectRoot,
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
    search: (request) => searchDocumentation(open().search, request),
    status: () =>
      semanticStatus(
        open().index,
        configuration,
        { env, ...(createProvider ? { createProvider } : {}) },
        { backgroundCatchUp: true },
      ),
    startRefresh: () => refresh.start(),
    close: () => refresh.stop(),
  };
}

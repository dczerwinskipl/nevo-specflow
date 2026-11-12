import {
  createReachabilityCache,
  openFileSystemCorpus,
  semanticStatus,
  type CreateEmbeddingProvider,
  type DocsConfiguration,
  type DocsSearchRequest,
} from '@nevo/specflow-docs';
import type { DocsSearchResult, DocsStatus } from '@nevo/specflow-contracts/docs';
import type { FastifyBaseLogger } from 'fastify';

import type { RefreshSlot } from './background-refresh';
import { openCorpusInstance, type CorpusInstance, type CorpusReads } from './corpus-instance';

export interface ProjectDocsOptions {
  /** Absolute project root; the corpus is its `docs.root`, the index lives below its `.nevo/`. */
  readonly projectRoot: string;
  /** The settings loaded when the Runtime started. */
  readonly configuration: DocsConfiguration;
  /** Environment the embedding API key variable is read from. */
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly createProvider?: CreateEmbeddingProvider;
  /** Where the background refresh logs a failure. */
  readonly log: FastifyBaseLogger;
  readonly slot: RefreshSlot;
}

/**
 * The Runtime's own checkout as `GET /api/docs/search|status` serve it, with the settings loaded at
 * start, until the workspace documentation endpoints replace those routes. It shares the
 * Runtime-wide refresh slot with every workspace instance.
 */
export interface ProjectDocs {
  /** Throws `DocsConfigError` while `docs.root` is not a directory, checked again next time. */
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
  // Status requests of this instance share endpoint probes for a few seconds.
  const reachability = createReachabilityCache();
  let opened: Promise<CorpusInstance> | undefined;
  let closed = false;

  // Opened on first use and kept. A missing root is not kept, so creating it later is enough.
  const open = (): Promise<CorpusInstance> => {
    if (opened === undefined) {
      const opening = (async () =>
        openCorpusInstance({
          root: projectRoot,
          corpus: openFileSystemCorpus(projectRoot, configuration.docs),
          configuration,
          env,
          log: options.log,
          slot: options.slot,
          follow: FOLLOW,
          ...(createProvider ? { createProvider } : {}),
        }))();
      opened = opening;
      void opening.catch(() => {
        if (opened === opening) {
          opened = undefined;
        }
      });
    }

    return opened;
  };

  const use = async <T>(operation: (reads: CorpusReads) => Promise<T>): Promise<T> => {
    const result = closed ? undefined : await (await open()).use(operation);
    if (result === undefined) {
      throw new Error('The Runtime is closing.');
    }

    return result;
  };

  return {
    search: (request) => use((reads) => reads.search(request)),
    status: () =>
      use((reads) =>
        semanticStatus(
          reads.index,
          configuration,
          { env, ...(createProvider ? { createProvider } : {}) },
          { backgroundCatchUp: true, reachability },
        ),
      ),
    startRefresh: () => {
      void open().then(
        (instance) => instance.startRefresh(),
        (error: unknown) => {
          options.log.warn({ err: error }, 'The documentation index was not refreshed.');
        },
      );
    },
    close: async () => {
      closed = true;
      await (await opened?.catch(() => undefined))?.dispose();
    },
  };
}

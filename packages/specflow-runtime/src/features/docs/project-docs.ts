import {
  buildDocsIndex,
  openDocsIndex,
  openDocsSearch,
  openFileSystemCorpus,
  searchDocumentation,
  type CreateEmbeddingProvider,
  type DocsConfiguration,
  type DocsIndex,
  type DocsSearch,
  type DocsSearchRequest,
  type SemanticIndexResult,
} from '@nevo/specflow-docs';
import type { DocsSearchResult } from '@nevo/specflow-contracts/docs';

export interface ProjectDocsOptions {
  /** Absolute project root; the corpus is its `docs.root`, the index lives below its `.nevo/`. */
  readonly projectRoot: string;
  readonly configuration: DocsConfiguration;
  /** Environment the embedding API key variable is read from. */
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly createProvider?: CreateEmbeddingProvider;
}

/** The project's documentation as one Runtime process serves it: one index, one search. */
export interface ProjectDocs {
  /**
   * Throws `DocsConfigError` while `docs.root` is not a directory and `DocsCorpusInvalidError` while
   * the corpus fails validation; both are the project's current state, checked again next time.
   */
  search(request: DocsSearchRequest): Promise<DocsSearchResult>;
  /** Full refresh of the index (the start refresh); `signal` stops its endpoint requests. */
  refresh(signal: AbortSignal): Promise<SemanticIndexResult>;
}

export function createProjectDocs(options: ProjectDocsOptions): ProjectDocs {
  const { projectRoot, configuration, env, createProvider } = options;
  let opened: { readonly index: DocsIndex; readonly search: DocsSearch } | undefined;

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
          ...(createProvider ? { createProvider } : {}),
        }),
      };
    }

    return opened;
  };

  return {
    search: (request) => searchDocumentation(open().search, request),
    refresh: (signal) =>
      buildDocsIndex(open().index, configuration, {
        env,
        signal,
        ...(createProvider ? { createProvider } : {}),
      }),
  };
}

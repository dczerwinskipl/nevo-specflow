// The project's semantic documentation index: the vector store and the persisted chunk cache, both
// disposable cache under `.nevo/local/cache/docs-index/` (architecture.runtime.configuration).

import { join } from 'node:path';

import { createFileVectorStore, type VectorStore } from '@nevo/ai-semantic-search';

import type { DocsCorpus } from '../corpus/corpus';
import { createDocsChunkSource, type DocsChunkSource } from './chunk-source';

/** The index directory below the project root. */
export const DOCS_INDEX_DIRECTORY = '.nevo/local/cache/docs-index';

export interface DocsIndex {
  readonly chunks: DocsChunkSource;
  readonly store: VectorStore;
  /**
   * Absolute index directory, which also holds the refresh progress records (`progress.ts`) and
   * the background catch-up files (`catch-up.ts`). Absent for an index held only in memory (tests):
   * nothing is recorded and no catch-up is started then.
   */
  readonly directory?: string;
}

/** The vector store directory (with its `writer.lock`) inside an index directory. */
export function vectorsDirectory(directory: string): string {
  return join(directory, 'vectors');
}

/**
 * Open the index of a project. Keep one instance per project and process: the store decodes a
 * generation's vectors file once and the chunk source keeps the parsed corpus between reads. An
 * instance does not notice corruption of a generation it already decoded; the cache is disposable.
 * Opening writes nothing; the directory is created by the first write.
 */
export function openDocsIndex(
  projectRoot: string,
  corpus: DocsCorpus,
): DocsIndex & { readonly directory: string } {
  const directory = join(projectRoot, ...DOCS_INDEX_DIRECTORY.split('/'));

  return {
    chunks: createDocsChunkSource({ corpus, cacheFile: join(directory, 'units.json') }),
    store: createFileVectorStore({ directory: vectorsDirectory(directory) }),
    directory,
  };
}

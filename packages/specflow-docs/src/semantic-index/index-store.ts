// The project's semantic documentation index: the vector store and the persisted chunk cache, both
// disposable cache under `.nevo/local/cache/docs-index/` (architecture.runtime.configuration).

import { join } from 'node:path';

import { createFileVectorStore, type VectorStore } from '@nevo/ai-semantic-search';
import type { DocsSearchReason } from '@nevo/specflow-contracts/docs';

import type { DocsConfiguration } from '../config/docs-configuration';
import type { DocsCorpus } from '../corpus/corpus';
import { createDocsChunkSource, type DocsChunkSource } from './chunk-source';
import { cacheNotIgnoredReason } from './reasons';
import {
  admittedVectorStore,
  createIndexWrites,
  gitIgnoreAdmission,
  gitIgnores,
  type AdmitWrite,
  type GitIgnoreCheck,
  type IndexWrites,
} from './write-admission';

/** The index directory below the project root. */
export const DOCS_INDEX_DIRECTORY = '.nevo/local/cache/docs-index';

/** The path `git check-ignore` is asked about. */
const INDEX_DIRECTORY_PATH = `${DOCS_INDEX_DIRECTORY}/`;

export interface DocsIndex {
  readonly chunks: DocsChunkSource;
  /** Every writer it hands out takes its lock and applies each slice only once `writes` admits. */
  readonly store: VectorStore;
  /**
   * Absolute index directory, which also holds the refresh progress records (`progress.ts`) and
   * the background catch-up files (`catch-up.ts`). Absent for an index held only in memory (tests):
   * nothing is recorded and no catch-up is started then.
   */
  readonly directory?: string;
  /**
   * The write admission (`write-admission.ts`), asked immediately before every write of the index
   * directory: a seed copy asks it too. While its latest check refused, searches answer lexically
   * with the refusal, `semantic index` does not run and `semantic status` reports it.
   */
  readonly writes: IndexWrites;
}

/** May the index be written below the project root? */
export type IndexAccess =
  { readonly writable: true } | { readonly writable: false; readonly reason: DocsSearchReason };

/**
 * The check when an index is opened (`openProjectIndex`), so `semantic status` reports an index that
 * must not be written: the index is local cache and MUST NOT be committed, so in a Git work tree
 * that does not ignore it (for example a documentation-only setup without the `.nevo/local/` entry)
 * nothing is written there. Every write checks again (`DocsIndex.writes`).
 */
export async function checkIndexAccess(
  projectRoot: string,
  isIgnored: GitIgnoreCheck = gitIgnores,
): Promise<IndexAccess> {
  return (await gitIgnoreAdmission(projectRoot, INDEX_DIRECTORY_PATH, isIgnored)())
    ? { writable: true }
    : { writable: false, reason: cacheNotIgnoredReason(DOCS_INDEX_DIRECTORY) };
}

/** The vector store directory (with its writer lock files) inside an index directory. */
export function vectorsDirectory(directory: string): string {
  return join(directory, 'vectors');
}

/**
 * Open the index of a project with the outcome of a check made now (`checkIndexAccess`). Keep one
 * instance per project and process: the store decodes a generation's vectors file once and the
 * chunk source keeps the parsed corpus between reads. An instance does not notice corruption of a
 * generation it already decoded; the cache is disposable. Opening writes nothing; the directory is
 * created by the first write, and `admitWrite` (default: `git check-ignore` of the index directory,
 * uncached) is asked immediately before every write.
 */
export function openDocsIndex(
  projectRoot: string,
  corpus: DocsCorpus,
  access: IndexAccess,
  admitWrite: AdmitWrite = gitIgnoreAdmission(projectRoot, INDEX_DIRECTORY_PATH),
): DocsIndex & { readonly directory: string } {
  const directory = join(projectRoot, ...DOCS_INDEX_DIRECTORY.split('/'));
  const writes = createIndexWrites(
    admitWrite,
    cacheNotIgnoredReason(DOCS_INDEX_DIRECTORY),
    access.writable ? undefined : access.reason,
  );

  return {
    chunks: createDocsChunkSource({
      corpus,
      cache: {
        file: join(directory, 'units.json'),
        admitWrite: async () => (await writes.check()) === undefined,
      },
    }),
    store: admittedVectorStore(
      createFileVectorStore({ directory: vectorsDirectory(directory) }),
      writes,
    ),
    directory,
    writes,
  };
}

/**
 * `openDocsIndex` for a command or a Runtime: the Git check runs only with an embedding endpoint
 * configured, since only then can anything write the index.
 */
export async function openProjectIndex(
  projectRoot: string,
  corpus: DocsCorpus,
  configuration: DocsConfiguration,
  isIgnored: GitIgnoreCheck = gitIgnores,
): Promise<DocsIndex & { readonly directory: string }> {
  const access: IndexAccess =
    configuration.embeddings === undefined
      ? { writable: true }
      : await checkIndexAccess(projectRoot, isIgnored);

  return openDocsIndex(
    projectRoot,
    corpus,
    access,
    gitIgnoreAdmission(projectRoot, INDEX_DIRECTORY_PATH, isIgnored),
  );
}

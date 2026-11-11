// The project's semantic documentation index: the vector store and the persisted chunk cache, both
// disposable cache under `.nevo/local/cache/docs-index/` (architecture.runtime.configuration).

import { execFile } from 'node:child_process';
import { join } from 'node:path';

import { createFileVectorStore, type VectorStore } from '@nevo/ai-semantic-search';
import type { DocsSearchReason } from '@nevo/specflow-contracts/docs';

import type { DocsConfiguration } from '../config/docs-configuration';
import type { DocsCorpus } from '../corpus/corpus';
import { createDocsChunkSource, type DocsChunkSource } from './chunk-source';
import { cacheNotIgnoredReason } from './reasons';

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
  /**
   * Why the index must not be written (`checkIndexAccess`): searches answer lexically with it,
   * `semantic index` and refreshes do not run and `semantic status` reports it. The chunks are then
   * parsed in memory only.
   */
  readonly unavailable?: DocsSearchReason;
}

/** May the index be written below the project root? */
export type IndexAccess =
  { readonly writable: true } | { readonly writable: false; readonly reason: DocsSearchReason };

/**
 * Whether Git ignores `path` (relative to `projectRoot`): `undefined` when `projectRoot` is not in a
 * Git work tree or Git cannot be run, where nothing can commit the cache by accident.
 */
export type GitIgnoreCheck = (projectRoot: string, path: string) => Promise<boolean | undefined>;

const ignoreChecks = new Map<string, Promise<boolean | undefined>>();

/** `git check-ignore`, once per project root and process. */
export const gitIgnores: GitIgnoreCheck = (projectRoot, path) => {
  const key = `${projectRoot}\0${path}`;
  let check = ignoreChecks.get(key);
  if (check === undefined) {
    check = new Promise((resolve) => {
      execFile(
        'git',
        ['-C', projectRoot, 'check-ignore', '-q', '--', path],
        { windowsHide: true, timeout: 10_000 },
        (error) => {
          if (error === null) {
            resolve(true);
          } else {
            // Exit 1: not ignored; 128, a missing Git or a timeout: no answer.
            resolve(error.code === 1 ? false : undefined);
          }
        },
      );
    });
    ignoreChecks.set(key, check);
  }

  return check;
};

/**
 * The boundary check before the first write below `.nevo/local/`: the index is local cache and MUST
 * NOT be committed, so in a Git work tree that does not ignore it (for example a documentation-only
 * setup without the `.nevo/local/` entry) nothing is written there.
 */
export async function checkIndexAccess(
  projectRoot: string,
  isIgnored: GitIgnoreCheck = gitIgnores,
): Promise<IndexAccess> {
  const ignored = await isIgnored(projectRoot, `${DOCS_INDEX_DIRECTORY}/`);

  return ignored === false
    ? { writable: false, reason: cacheNotIgnoredReason(DOCS_INDEX_DIRECTORY) }
    : { writable: true };
}

/** The vector store directory (with its writer lock files) inside an index directory. */
export function vectorsDirectory(directory: string): string {
  return join(directory, 'vectors');
}

/**
 * Open the index of a project with the outcome of `checkIndexAccess`. Keep one instance per project
 * and process: the store decodes a generation's vectors file once and the chunk source keeps the
 * parsed corpus between reads. An instance does not notice corruption of a generation it already
 * decoded; the cache is disposable. Opening writes nothing; the directory is created by the first
 * write, which an index that is not `writable` never makes.
 */
export function openDocsIndex(
  projectRoot: string,
  corpus: DocsCorpus,
  access: IndexAccess,
): DocsIndex & { readonly directory: string } {
  const directory = join(projectRoot, ...DOCS_INDEX_DIRECTORY.split('/'));

  return {
    chunks: createDocsChunkSource(
      access.writable ? { corpus, cacheFile: join(directory, 'units.json') } : { corpus },
    ),
    store: createFileVectorStore({ directory: vectorsDirectory(directory) }),
    directory,
    ...(access.writable ? {} : { unavailable: access.reason }),
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

  return openDocsIndex(projectRoot, corpus, access);
}

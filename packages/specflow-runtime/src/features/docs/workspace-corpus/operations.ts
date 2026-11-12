import {
  projectDocsTree,
  readArticle,
  type ArticleResult,
  type DocsSearchRequest,
  type DocsSearchWithLeftOut,
  type DocsTree,
  type IndexProgress,
  type SkippedDocument,
  skippedUnderDocsRoot,
  underDocsRoot,
} from '@nevo/specflow-docs';

import type { WorkspaceCorpora, WorkspaceDocsResult } from './workspace-corpora';

export type WorkspaceSearchRequest = Omit<DocsSearchRequest, 'refresh' | 'semanticIndexCommand'>;

export interface WorkspaceSearch {
  /** The corpus revision of the snapshot the search ranked. */
  readonly revision: string;
  /** Its `skipped` is always present here. */
  readonly result: DocsSearchWithLeftOut & { readonly skipped: SkippedDocument[] };
  /** The workspace's running background refresh, once it embeds. */
  readonly indexProgress?: IndexProgress;
}

export interface WorkspaceArticle {
  readonly article: ArticleResult;
  /** The documents the snapshot the article was read from left out. */
  readonly skipped: readonly SkippedDocument[];
}

/**
 * The reads the workspace documentation endpoints answer. Each loads the corpus once and hands the
 * same snapshot to the primitive, so a response carries one consistent corpus revision. Every path,
 * also inside a skip reason, is relative to the checkout's `docs.root`.
 */
export interface WorkspaceDocsOperations {
  tree(workspaceId: string): Promise<WorkspaceDocsResult<DocsTree>>;
  article(workspaceId: string, documentId: string): Promise<WorkspaceDocsResult<WorkspaceArticle>>;
  /** Runs the bounded read-time refresh; a larger gap starts the background catch-up. */
  search(
    workspaceId: string,
    request: WorkspaceSearchRequest,
  ): Promise<WorkspaceDocsResult<WorkspaceSearch>>;
}

export function createWorkspaceDocsOperations(corpora: WorkspaceCorpora): WorkspaceDocsOperations {
  return {
    tree: (workspaceId) =>
      corpora.use(workspaceId, async (reads, docsRoot) =>
        projectDocsTree(await reads.load(), docsRoot),
      ),
    article: (workspaceId, documentId) =>
      corpora.use(workspaceId, async (reads, docsRoot) => {
        const snapshot = await reads.load();
        const article = await readArticle(reads.corpus, snapshot, documentId);

        return { article, skipped: skippedUnderDocsRoot(docsRoot, snapshot.skipped) };
      }),
    search: (workspaceId, request) =>
      corpora.use(workspaceId, async (reads, docsRoot) => {
        const snapshot = await reads.load();
        const result = await reads.searchWithLeftOut(snapshot, { ...request, refresh: true });
        const indexProgress = reads.progress();

        return {
          revision: snapshot.revision,
          result: {
            ...result,
            results: result.results.map((hit) => ({
              ...hit,
              file: underDocsRoot(docsRoot, hit.file),
            })),
            skipped: skippedUnderDocsRoot(docsRoot, result.skipped ?? []),
          },
          ...(indexProgress === undefined ? {} : { indexProgress }),
        };
      }),
  };
}

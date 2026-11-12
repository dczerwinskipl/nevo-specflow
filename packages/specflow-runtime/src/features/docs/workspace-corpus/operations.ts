import {
  projectDocsTree,
  readArticle,
  type ArticleResult,
  type DocsSearchRequest,
  type DocsSearchWithLeftOut,
  type DocsTree,
  type IndexProgress,
} from '@nevo/specflow-docs';

import type { WorkspaceCorpora, WorkspaceDocsResult } from './workspace-corpora';

export type WorkspaceSearchRequest = Omit<DocsSearchRequest, 'refresh' | 'semanticIndexCommand'>;

export interface WorkspaceSearch {
  /** The corpus revision of the snapshot the search ranked. */
  readonly revision: string;
  /** Paths (`skipped`, hit files) are checkout-relative, as the CLI reports them. */
  readonly result: DocsSearchWithLeftOut;
  /** The workspace's running background refresh, once it embeds. */
  readonly indexProgress?: IndexProgress;
}

/**
 * The reads the workspace documentation endpoints answer. Each loads the corpus once and hands the
 * same snapshot to the primitive, so a response carries one consistent corpus revision.
 */
export interface WorkspaceDocsOperations {
  /** Tree paths relative to `docs.root`. */
  tree(workspaceId: string): Promise<WorkspaceDocsResult<DocsTree>>;
  article(workspaceId: string, documentId: string): Promise<WorkspaceDocsResult<ArticleResult>>;
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
      corpora.use(workspaceId, async (reads) =>
        readArticle(reads.corpus, await reads.load(), documentId),
      ),
    search: (workspaceId, request) =>
      corpora.use(workspaceId, async (reads) => {
        const snapshot = await reads.load();
        const result = await reads.searchWithLeftOut(snapshot, { ...request, refresh: true });
        const indexProgress = reads.progress();

        return {
          revision: snapshot.revision,
          result,
          ...(indexProgress === undefined ? {} : { indexProgress }),
        };
      }),
  };
}

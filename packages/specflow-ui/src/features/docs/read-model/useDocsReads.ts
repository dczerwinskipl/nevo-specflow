import {
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
  type UseQueryResult,
} from '@tanstack/react-query';
import type { WorkspaceDocsSearch, WorkspaceDocsTree } from '@nevo/specflow-contracts/docs';
import { useAppServices } from '../../../app/useAppServices';
import type { DocsApi, DocsArticleResult, DocsSearchQuery } from './api';
import { docsKeys } from './queries';
import { reconcileDocsRevision, revisionOf } from './revision';

/**
 * Reads one answer and reconciles its workspace's other answers with its revision, every time:
 * also a refetch answering the revision its key already held, since another answer may have
 * arrived late from an older (or a reverted) corpus meanwhile. Reconciling does nothing when every
 * cached answer agrees, and it cannot loop: the Runtime answers each response from one snapshot, so
 * the answers of a stable corpus agree within two rounds. The workspace and key are the ones the
 * read was started for (captured here), never a "current" workspace read when the answer arrives.
 */
async function readCoherent<T>(
  queryClient: QueryClient,
  workspaceId: string,
  key: QueryKey,
  read: () => Promise<T>,
): Promise<T> {
  const data = await read();
  const revision = revisionOf(data);
  if (revision !== undefined) {
    reconcileDocsRevision(queryClient, workspaceId, key, revision);
  }

  return data;
}

/** Query options of the three reads; exported for tests and for prefetching. */
export const docsQueries = {
  tree: (api: DocsApi, queryClient: QueryClient, workspaceId: string) => {
    const queryKey = docsKeys.tree(workspaceId);

    return {
      queryKey,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        readCoherent(queryClient, workspaceId, queryKey, () => api.tree(workspaceId, signal)),
    };
  },
  document: (api: DocsApi, queryClient: QueryClient, workspaceId: string, documentId: string) => {
    const queryKey = docsKeys.document(workspaceId, documentId);

    return {
      queryKey,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        readCoherent(queryClient, workspaceId, queryKey, () =>
          api.article(workspaceId, documentId, signal),
        ),
    };
  },
  search: (api: DocsApi, queryClient: QueryClient, workspaceId: string, query: DocsSearchQuery) => {
    const queryKey = docsKeys.search(workspaceId, query);

    return {
      queryKey,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        readCoherent(queryClient, workspaceId, queryKey, () =>
          api.search(workspaceId, query, signal),
        ),
    };
  },
};

// No `placeholderData` from a previous key: a read of another workspace or document must never
// show the previous one's answer while it loads.

/** The tree of a workspace's documentation; disabled until a workspace is known. */
export function useDocsTree(workspaceId: string | undefined): UseQueryResult<WorkspaceDocsTree> {
  const { docsApi } = useAppServices();
  const queryClient = useQueryClient();

  return useQuery({
    ...docsQueries.tree(docsApi, queryClient, workspaceId ?? ''),
    enabled: workspaceId !== undefined,
  });
}

/** One article, or the refusal that names why it cannot be read (inactive, skipped, not found). */
export function useDocsArticle(
  workspaceId: string | undefined,
  documentId: string | undefined,
): UseQueryResult<DocsArticleResult> {
  const { docsApi } = useAppServices();
  const queryClient = useQueryClient();

  return useQuery({
    ...docsQueries.document(docsApi, queryClient, workspaceId ?? '', documentId ?? ''),
    enabled: workspaceId !== undefined && documentId !== undefined,
  });
}

/**
 * The answer held for one article, without reading it: for a screen that compares it with another
 * answer while the article's own view reads it.
 */
export function useHeldDocsArticle(
  workspaceId: string | undefined,
  documentId: string | undefined,
): DocsArticleResult | undefined {
  const { docsApi } = useAppServices();
  const queryClient = useQueryClient();

  return useQuery({
    ...docsQueries.document(docsApi, queryClient, workspaceId ?? '', documentId ?? ''),
    enabled: false,
  }).data;
}

/**
 * A search of a workspace's documentation; disabled while the query text has no non-space
 * character (the route requires one). Debouncing the text is the caller's.
 */
export function useDocsSearch(
  workspaceId: string | undefined,
  query: DocsSearchQuery,
): UseQueryResult<WorkspaceDocsSearch> {
  const { docsApi } = useAppServices();
  const queryClient = useQueryClient();

  return useQuery({
    ...docsQueries.search(docsApi, queryClient, workspaceId ?? '', query),
    enabled: workspaceId !== undefined && query.q.trim().length > 0,
  });
}

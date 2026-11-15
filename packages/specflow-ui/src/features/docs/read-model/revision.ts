import { hashKey, type QueryClient, type QueryKey } from '@tanstack/react-query';
import type { DocsArticleResult } from './api';
import { docsKeys } from './queries';

/**
 * The corpus revision a cached documentation answer describes: the tree's and the search's own, an
 * article's, or the corpus a document refusal (`404`, `410`) was decided in.
 */
export function revisionOf(data: unknown): string | undefined {
  if (typeof data !== 'object' || data === null) {
    return undefined;
  }

  if ('corpusRevision' in data && typeof data.corpusRevision === 'string') {
    return data.corpusRevision;
  }

  if (!('kind' in data)) {
    return undefined;
  }

  const result = data as DocsArticleResult;

  return (result.kind === 'article' ? result.article : result.refusal).corpusRevision;
}

export interface CachedRevision {
  readonly key: QueryKey;
  readonly revision: string | undefined;
}

/**
 * The cached answers that describe another corpus than `revision`, the one just read. A document
 * refusal or article of a newer corpus thus selects the tree (and the search), and a newer tree
 * selects the article and the search: the reader shows one corpus, never a mix. Answers not read
 * yet carry no revision and are left alone.
 */
export function outdatedByRevision(
  cached: readonly CachedRevision[],
  revision: string,
): QueryKey[] {
  return cached
    .filter((entry) => entry.revision !== undefined && entry.revision !== revision)
    .map((entry) => entry.key);
}

/**
 * Called with every answer of one workspace as it arrives: refreshes that workspace's other
 * answers of another corpus together (the tree, the articles and the searches). The answer itself
 * is excluded, since invalidating a query while it fetches would restart it. Only the workspace the
 * answer was requested for is touched.
 */
export function reconcileDocsRevision(
  queryClient: QueryClient,
  workspaceId: string,
  answeredKey: QueryKey,
  revision: string,
): void {
  const answered = hashKey(answeredKey);
  const cached = queryClient
    .getQueryCache()
    .findAll({ queryKey: docsKeys.workspace(workspaceId) })
    .filter((query) => query.queryHash !== answered)
    .map((query) => ({ key: query.queryKey, revision: revisionOf(query.state.data) }));
  const outdated = new Set(outdatedByRevision(cached, revision).map((key) => hashKey(key)));
  if (outdated.size === 0) {
    return;
  }

  void queryClient.invalidateQueries({
    queryKey: docsKeys.workspace(workspaceId),
    predicate: (query) => outdated.has(query.queryHash),
  });
}

/**
 * Switching away from a workspace: its reads in flight are cancelled and its answers no screen
 * observes any more are dropped, so a late answer can only land in its own workspace's entries and
 * a later return reads it afresh. An entry still observed (a screen that has not moved to the new
 * workspace yet) is kept; it is garbage-collected once unobserved.
 */
export function leaveDocsWorkspace(queryClient: QueryClient, workspaceId: string): void {
  void queryClient.cancelQueries({ queryKey: docsKeys.workspace(workspaceId) });
  queryClient.removeQueries({
    queryKey: docsKeys.workspace(workspaceId),
    predicate: (query) => query.getObserversCount() === 0,
  });
}

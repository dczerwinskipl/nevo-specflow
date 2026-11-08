import { useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useAppServices } from '../../../app/useAppServices';
import { asApiError } from '../../../api';
import { sessionAssociationKeys } from '../associations/queries';
import { sessionAssociationsOperation } from '../associations/api';
import { loadSessions, type SessionCollection, type SessionListLoad } from './loadSessions';
import type { SessionListItem } from '@nevo/specflow-contracts/sessions';

/** What the Specification Sessions list shows (session-association-ux §3). */
export type SpecificationSessionListState =
  | { status: 'loading' }
  | { status: 'failed'; retry: () => void }
  | { status: 'forbidden' }
  | {
      status: 'ready';
      rows: readonly SessionListItem[];
      /** A cursor remains: "Show more" is offered. */
      hasMore: boolean;
      loadingMore: boolean;
      /** The last load spent its requests without a row while a cursor remains. */
      noneInScanned: boolean;
      /** The last "Show more" failed; the button retries the same cursor. */
      loadMoreFailed: boolean;
      /** Follows the cursor; resolves with how many rows arrived (0 when none or failed). */
      loadMore: () => Promise<number>;
    };

/**
 * The paged Session list read of one Specification and collection. Each page of the query is one
 * load ({@link loadSessions}); appended pages stay until an invalidation resets the list to its
 * first page.
 */
export function useSpecificationSessionList(
  specId: string,
  collection: SessionCollection,
): SpecificationSessionListState {
  const { sessionAssociationsApi } = useAppServices();
  const query = useInfiniteQuery({
    queryKey: sessionAssociationKeys.list(specId, collection),
    queryFn: ({ pageParam, signal }) =>
      loadSessions(sessionAssociationsApi, specId, collection, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: SessionListLoad) => last.nextCursor,
  });
  const { data, fetchNextPage, refetch } = query;
  const rows = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
  const loadMore = useCallback(async () => {
    const before = data?.pages.length ?? 0;
    const result = await fetchNextPage({ cancelRefetch: false });
    const pages = result.data?.pages ?? [];

    return result.isFetchNextPageError || pages.length === before
      ? 0
      : (pages.at(-1)?.items.length ?? 0);
  }, [data, fetchNextPage]);

  if (!data) {
    if (query.isError) {
      return asApiError(query.error, { operation: sessionAssociationsOperation, method: 'GET' })
        ?.status === 403
        ? { status: 'forbidden' }
        : { status: 'failed', retry: () => void refetch() };
    }

    return { status: 'loading' };
  }

  const last = data.pages.at(-1);

  return {
    status: 'ready',
    rows,
    hasMore: query.hasNextPage,
    loadingMore: query.isFetchingNextPage,
    noneInScanned: !!last && last.items.length === 0 && last.nextCursor !== undefined,
    loadMoreFailed: query.isFetchNextPageError,
    loadMore,
  };
}

import { useCallback, useMemo } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useAppServices } from '../../../app/useAppServices';
import { asApiError } from '../../../api';
import { sessionAssociationKeys } from '../associations/queries';
import { isDefinitiveAssociationRefusal, sessionAssociationsOperation } from '../associations/api';
import { sessionErrorCode } from '../managed/api';
import { loadSessions, type SessionCollection, type SessionListLoad } from './loadSessions';
import type { SessionListItem } from '@nevo/specflow-contracts/sessions';

/** What the Specification Sessions list shows (session-association-ux §3). */
export type SpecificationSessionListState =
  | { status: 'loading' }
  | { status: 'failed'; retry: () => void }
  | { status: 'forbidden' }
  /** Sessions are turned off in the project: not a failed read. */
  | { status: 'disabled' }
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
      /** Follows the cursor once (one press). */
      loadMore: () => Promise<SessionListLoadOutcome>;
    };

/** What one press of "Show more" brought. */
export interface SessionListLoadOutcome {
  /** Rows appended (0 when none arrived or the load failed). */
  arrived: number;
  failed: boolean;
  /** The cursor ended with this load: "Show more" goes away. */
  ended: boolean;
}

/**
 * The paged Session list read of one Specification and collection. Each page of the query is one
 * load ({@link loadSessions}); appended pages stay until an invalidation resets the list to its
 * first page. Once the workspace says Sessions are turned off (`disabled`), nothing is read; a list
 * read refused with `SESSION_DISABLED` says the same. Rows already shown stay through a transient
 * failure, but not through a 403/404: the principal may no longer see them.
 */
export function useSpecificationSessionList(
  specId: string,
  collection: SessionCollection,
  disabled = false,
): SpecificationSessionListState {
  const { sessionAssociationsApi } = useAppServices();
  const query = useInfiniteQuery({
    enabled: !disabled,
    queryKey: sessionAssociationKeys.list(specId, collection),
    queryFn: ({ pageParam, signal }) =>
      loadSessions(sessionAssociationsApi, specId, collection, pageParam, signal),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: SessionListLoad) => last.nextCursor,
  });
  const { data, fetchNextPage, refetch } = query;
  const rows = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
  const loadMore = useCallback(async (): Promise<SessionListLoadOutcome> => {
    const before = data?.pages.length ?? 0;
    const result = await fetchNextPage({ cancelRefetch: false });
    const pages = result.data?.pages ?? [];
    const failed = result.isFetchNextPageError;
    const added = !failed && pages.length > before ? pages.at(-1) : undefined;

    return {
      arrived: added?.items.length ?? 0,
      failed,
      ended: !!added && added.nextCursor === undefined,
    };
  }, [data, fetchNextPage]);

  if (disabled || sessionErrorCode(query.error) === 'SESSION_DISABLED') {
    return { status: 'disabled' };
  }

  // A refetch refused for good drops the rows read before; a transient failure keeps them.
  if (!data || (query.isError && isDefinitiveAssociationRefusal(query.error))) {
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

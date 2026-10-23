import { useQuery } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import type { OperationListItem, OperationList } from '../operationList';
import type { OperationsApi } from '../operationsApi';
import { operationsListQueryOptions } from '../queries';

export interface UseOperationsListOptions {
  /** The operations port (from the app services). */
  readonly api: OperationsApi;
  /** The list route of the feature (`/api/specs/operations`); undefined waits (nothing is read). */
  readonly listUrl: string | undefined;
  /**
   * Called when rows have just completed: they went from running to completed, or first showed up
   * already completed after the first read. The host refreshes what the operation produced (the
   * specification list). `shared` does not know what that is.
   */
  readonly onCompleted?: (rows: readonly OperationListItem[]) => void;
}

export interface OperationsListView {
  readonly list: OperationList | undefined;
  /** First read pending: the panel renders nothing yet. */
  readonly loading: boolean;
  /** The last read failed (the previous rows, if any, stay in `list`). */
  readonly failed: boolean;
  /** The Runtime serves no list: nothing to show, nothing retried. */
  readonly unavailable: boolean;
  readonly refetch: () => void;
}

/**
 * Live view of a feature's operation list: 3 s while something runs, 15 s otherwise, paused in a
 * hidden tab, read again when the tab or window gets back, 3 to 60 s backoff while reads fail with
 * the last rows kept. See {@link operationsListQueryOptions}.
 */
export function useOperationsList(options: UseOperationsListOptions): OperationsListView {
  const { api, listUrl, onCompleted } = options;
  const failures = useRef(0);
  const query = useQuery({
    ...operationsListQueryOptions(api, listUrl ?? '', failures),
    enabled: Boolean(listUrl),
  });

  const seen = useRef<ReadonlyMap<string, string> | undefined>(undefined);
  const onCompletedRef = useRef(onCompleted);
  useEffect(() => {
    onCompletedRef.current = onCompleted;
  }, [onCompleted]);

  const list = query.data?.list;
  useEffect(() => {
    if (!list) return;
    const previous = seen.current;
    seen.current = new Map(list.items.map((item) => [item.operationId, item.status]));
    // The first read only records: the specification list loads on its own with the page.
    if (!previous) return;
    const completed = list.items.filter(
      (item) => item.status === 'completed' && previous.get(item.operationId) !== 'completed',
    );
    if (completed.length) onCompletedRef.current?.(completed);
  }, [list]);

  return {
    list,
    loading: Boolean(listUrl) && query.isPending,
    failed: query.isError,
    unavailable: query.data?.unavailable === true,
    refetch: () => void query.refetch(),
  };
}

import { queryOptions } from '@tanstack/react-query';

import type { OperationsApi } from './operationsApi';
import { isRunningOperation, type OperationList } from './operationList';

export const operationsKeys = {
  all: ['operations'] as const,
  list: (listUrl: string) => [...operationsKeys.all, 'list', listUrl] as const,
};

/** What the list query holds: the last list read, or the fact that this Runtime serves none. */
export interface OperationsListData {
  readonly list?: OperationList;
  readonly etag?: string;
  /** 404/403: the feature serves no list here. Nothing is shown and nothing is retried. */
  readonly unavailable?: boolean;
}

/** Cadence while something runs, while nothing does, and the ceiling of the error backoff. */
export const runningPollMs = 3_000;
export const idlePollMs = 15_000;
export const maxBackoffPollMs = 60_000;

/**
 * When to read the list next. Fast while a row runs (its steps move), slow otherwise, doubling
 * (3 s up to 60 s) while reads keep failing, and never once the Runtime said it has no list. The
 * query layer additionally pauses the interval in a hidden tab and refetches on focus.
 */
export function nextPollInterval(
  data: OperationsListData | undefined,
  consecutiveFailures: number,
): number | false {
  if (data?.unavailable) return false;
  if (consecutiveFailures > 0)
    return Math.min(maxBackoffPollMs, runningPollMs * 2 ** consecutiveFailures);
  return data?.list?.items.some(isRunningOperation) ? runningPollMs : idlePollMs;
}

/**
 * The list read of one feature route. `failures` is the caller's counter of consecutive failed
 * reads (reset by a good one) that drives the backoff.
 */
export function operationsListQueryOptions(
  api: OperationsApi,
  listUrl: string,
  failures: { current: number },
) {
  return queryOptions({
    queryKey: operationsKeys.list(listUrl),
    queryFn: async ({ signal, client }): Promise<OperationsListData> => {
      const previous = client.getQueryData<OperationsListData>(operationsKeys.list(listUrl));
      try {
        const result = await api.list(listUrl, {
          signal,
          ...(previous?.etag ? { etag: previous.etag } : {}),
        });
        failures.current = 0;
        if (result.kind === 'unavailable') return { unavailable: true };
        if (result.kind === 'not-modified') return previous ?? {};
        return { list: result.list, ...(result.etag ? { etag: result.etag } : {}) };
      } catch (error) {
        // A cancelled read is not a failure of the Runtime.
        if (!signal.aborted) failures.current += 1;
        throw error;
      }
    },
    // The list is a live view: every mount and focus reads again.
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    refetchIntervalInBackground: false,
    refetchInterval: (query) => nextPollInterval(query.state.data, failures.current),
  });
}

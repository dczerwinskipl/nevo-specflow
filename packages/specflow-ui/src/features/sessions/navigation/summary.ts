import { getHttpErrorStatus } from '../../../shared/http/httpErrorStatus';
import {
  type SessionSummary,
  type SpecificationWorkspaceData,
  useSpecificationWorkspace,
} from '../../specs/read-model';

export type SessionNavigationEntry = SessionSummary & {
  readonly activityCode: 'active' | 'attention';
};
export type SessionNavigationSummary =
  | {
      readonly state: 'available' | 'partial' | 'stale';
      readonly entries: readonly SessionNavigationEntry[];
      readonly count?: number;
      readonly attention: boolean;
    }
  | { readonly state: 'unknown' | 'loading' | 'unavailable' | 'forbidden' };
/** Sessions owns interpretation of the Workspace snapshot for navigation. */
export function projectSessionNavigation(
  data: SpecificationWorkspaceData | undefined,
  error: unknown,
  fetching = false,
): SessionNavigationSummary {
  const status = getHttpErrorStatus(error);
  if ([401, 403, 404].includes(status ?? 0)) {
    return { state: 'forbidden' };
  }

  if (!data) {
    return { state: error ? 'unavailable' : fetching ? 'loading' : 'unknown' };
  }

  const availability = data.sectionAvailability?.sessions;
  if (availability === 'forbidden') {
    return { state: 'forbidden' };
  }

  if (availability && availability !== 'available') {
    return { state: 'unavailable' };
  }

  const entries = data.sessions
    .filter(
      (item): item is SessionNavigationEntry =>
        item.activityCode === 'active' || item.activityCode === 'attention',
    )
    .sort(
      (a, b) => Number(b.activityCode === 'attention') - Number(a.activityCode === 'attention'),
    );
  const partial = data.sessions.some(
    (item) => !item.activityCode && item.navigationStatus !== 'quiet',
  );

  return {
    state: error ? 'stale' : partial ? 'partial' : 'available',
    entries: entries.slice(0, 3),
    count: !partial && !error ? entries.length : undefined,
    attention: entries.some((item) => item.activityCode === 'attention'),
  };
}

/** Reads the same route-owned Workspace query as the Specification navigation identity. */
export function useSessionNavigationSummary(specId: string | null) {
  const query = useSpecificationWorkspace(specId ?? '');

  return {
    ...projectSessionNavigation(
      specId ? query.data : undefined,
      specId ? query.error : undefined,
      Boolean(specId) && (query.status === 'pending' || query.fetchStatus === 'fetching'),
    ),
    canRetry: Boolean(specId),
    retry: () => (specId ? query.refetch() : Promise.resolve()),
  };
}

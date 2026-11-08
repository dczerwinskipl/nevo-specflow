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
  /** `disabled`: Sessions are turned off in the project, which is not a failed read. */
  | { readonly state: 'unknown' | 'loading' | 'unavailable' | 'forbidden' | 'disabled' };
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
    return sessionsDisabled(data) ? { state: 'disabled' } : { state: 'unavailable' };
  }

  const entries = data.sessions
    .filter(
      (item): item is SessionNavigationEntry =>
        item.activityCode === 'active' || item.activityCode === 'attention',
    )
    .sort(
      (a, b) => Number(b.activityCode === 'attention') - Number(a.activityCode === 'attention'),
    );
  // Interim count rule (session-association-ux §3): exact only when the bounded section holds every
  // Session and each one's status is known; otherwise the partial-activity line says so.
  const partial =
    data.sessionsHasMore === true ||
    data.sessions.some((item) => !item.activityCode && item.navigationStatus !== 'quiet');

  return {
    state: error ? 'stale' : partial ? 'partial' : 'available',
    entries: entries.slice(0, 3),
    count: !partial && !error ? entries.length : undefined,
    attention: entries.some((item) => item.activityCode === 'attention'),
  };
}

/**
 * The workspace's Sessions section is unavailable because Sessions are turned off: the section's
 * `source_unavailable` read together with the `sessions_disabled` reason of `startSession`.
 */
export function sessionsDisabled(data: SpecificationWorkspaceData): boolean {
  return (
    data.sectionAvailability?.sessions === 'unavailable' &&
    data.sectionUnavailableReason?.sessions === 'source_unavailable' &&
    data.startSession?.reason === 'sessions_disabled'
  );
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

import { getHttpErrorStatus } from '../../../shared/http/httpErrorStatus';
import type { SpecificationWorkspaceData } from '../read-model/model';
import { useSpecificationWorkspace } from '../read-model/useSpecificationWorkspace';

export interface SpecificationNavigationMetadata {
  readonly title: string;
  readonly key?: string;
  readonly documentCount: number | undefined;
  readonly hasGit: boolean | undefined;
  /** The last successful snapshot is shown while its refresh failed. */
  readonly stale?: boolean;
}

/**
 * Deterministic navigation read state for the matched Specification.
 * - `idle`: no Specification is matched;
 * - `loading`: the Workspace read has not settled yet (never presented as a failure);
 * - `available`: metadata from the Workspace snapshot (possibly `stale` after a failed refresh);
 * - `failed`: the Workspace request actually failed and there is no snapshot;
 * - `denied`: the Specification is not visible (401/403/404) — no identity is exposed.
 */
export type SpecificationNavigationState =
  | { readonly status: 'idle' | 'loading' | 'failed' | 'denied'; readonly metadata?: undefined }
  | { readonly status: 'available'; readonly metadata: SpecificationNavigationMetadata };

export interface SpecificationNavigationQueryState {
  readonly data: SpecificationWorkspaceData | undefined;
  readonly error: unknown;
  readonly status: 'pending' | 'error' | 'success';
}

export function projectSpecificationNavigation(
  specId: string | null,
  query: SpecificationNavigationQueryState,
): SpecificationNavigationState {
  if (!specId) return { status: 'idle' };
  if ([401, 403, 404].includes(getHttpErrorStatus(query.error) ?? 0)) return { status: 'denied' };
  const data = query.data;
  if (!data) return { status: query.status === 'error' ? 'failed' : 'loading' };
  return {
    status: 'available',
    metadata: {
      title: data.title,
      key: data.key,
      documentCount:
        data.sectionAvailability?.documents === 'available' || !data.sectionAvailability
          ? data.documents.length
          : undefined,
      hasGit: data.hasGit,
      stale: query.status === 'error',
    },
  };
}

/**
 * Navigation metadata is owned by the route's Specification Workspace query: the same
 * query key is fetched when cold (direct link / F5) and reused when already loaded, so a
 * canonical URL always settles to the same navigation regardless of how it was reached.
 */
export function useSpecificationNavigationSource(specId: string | null) {
  const workspace = useSpecificationWorkspace(specId ?? '');
  return {
    ...projectSpecificationNavigation(specId, workspace),
    retry: () => void workspace.refetch(),
  };
}

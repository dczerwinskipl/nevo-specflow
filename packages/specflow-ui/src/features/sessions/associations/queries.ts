import { useQuery, type InfiniteData, type QueryClient } from '@tanstack/react-query';
import type { SessionAssociationRead } from '@nevo/specflow-contracts/sessions';
import { useRouter } from '@tanstack/react-router';
import type { SpecFlowAppServices } from '../../../services';
import { invalidateSpecificationWorkspace } from '../../specs/read-model';
import type { SessionListLoad } from '../list/loadSessions';
import { isDefinitiveAssociationRefusal } from './api';

export const sessionAssociationKeys = {
  all: ['session-associations'] as const,
  read: (sessionId: string) => [...sessionAssociationKeys.all, 'read', sessionId] as const,
  /** Every page set of one Specification's Sessions list (both collections). */
  lists: (specId: string) => [...sessionAssociationKeys.all, 'list', specId] as const,
  list: (specId: string, collection: 'current' | 'archive') =>
    [...sessionAssociationKeys.lists(specId), collection] as const,
};

/**
 * The association of one Session (`GET /api/sessions/:sessionId/association`). `null` reads
 * nothing (no Session route). The Session screen, its Context, the navigator and the delete
 * destination all read this one query. A transiently failed refetch keeps the association already
 * understood; a 403/404 drops it, since the principal may no longer see that Specification and its
 * Tasks.
 */
export function useSessionAssociation(sessionId: string | null): {
  data: SessionAssociationRead | undefined;
  isError: boolean;
} {
  // Services are resolved inside the query function, so a disabled observer (the navigator off a
  // Session route) never needs them.
  const router = useRouter({ warn: false });
  const { data, isError, error } = useQuery({
    queryKey: sessionAssociationKeys.read(sessionId ?? ''),
    queryFn: ({ signal }) =>
      requireServices(router).sessionAssociationsApi.association(sessionId!, signal),
    enabled: sessionId !== null,
  });

  return { data: isError && isDefinitiveAssociationRefusal(error) ? undefined : data, isError };
}

function requireServices(router: ReturnType<typeof useRouter> | undefined): SpecFlowAppServices {
  const services = (
    router?.options.context as { readonly services?: SpecFlowAppServices } | undefined
  )?.services;
  if (!services) {
    throw new Error('useSessionAssociation requires the SpecFlow Router context');
  }

  return services;
}

/**
 * Seeds the association of a Session started here, so its first paint shows what a reload reads.
 * Marked stale at once: the Session screen still reads it, keeping the seed on screen meanwhile.
 */
export function seedSessionAssociation(queryClient: QueryClient, read: SessionAssociationRead) {
  queryClient.setQueryData(sessionAssociationKeys.read(read.sessionId), read);
  void queryClient.invalidateQueries({
    queryKey: sessionAssociationKeys.read(read.sessionId),
    exact: true,
    refetchType: 'none',
  });
}

/**
 * Refresh-on-action (session-association-ux §3): the Specification's Sessions list and the
 * workspace read (whose `revision` does not cover Sessions) after this UI's own Session command.
 * The list resets to its first page (appended pages are dropped); what it shows stays until the
 * first page is read again.
 */
export function invalidateSpecificationSessions(queryClient: QueryClient, specId: string) {
  for (const collection of ['current', 'archive'] as const) {
    queryClient.setQueryData<InfiniteData<SessionListLoad, string | undefined>>(
      sessionAssociationKeys.list(specId, collection),
      (data) =>
        data && data.pages.length > 1
          ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) }
          : data,
    );
  }

  return Promise.all([
    queryClient.invalidateQueries({ queryKey: sessionAssociationKeys.lists(specId) }),
    invalidateSpecificationWorkspace(queryClient, specId),
  ]);
}

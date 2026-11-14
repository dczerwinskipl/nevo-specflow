import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useApplicationCollection } from '../../../app/navigation/ApplicationLocation';
import { currentDocsWorkspace } from '../../docs';
import { useRememberSessionReturn } from '../SessionStateProvider';
import type { ContextSpecification } from './context/sessionContextTypes';

/**
 * The cross-feature navigation Context's rows hand off to (`SessionContext` itself stays
 * router-agnostic): the Specification row opens `/specs/$specId`, the Documents row opens that
 * Specification's Documents with this Session remembered as the way back, so the Documents screen's
 * "Back to the Session" link returns to the same Session (open document or not).
 */
export function useSessionContextNavigation(sessionId: string) {
  const navigate = useNavigate();
  const routeCollection = useApplicationCollection();
  // The association knows the Specification's collection; the route's is only where it was opened.
  const collectionOf = useCallback(
    (specification: Pick<ContextSpecification, 'collection'>) =>
      specification.collection === undefined
        ? routeCollection
        : specification.collection === 'archived'
          ? ('archive' as const)
          : ('current' as const),
    [routeCollection],
  );
  const rememberSessionReturn = useRememberSessionReturn();
  const onOpenSpecification = useCallback(
    (specification: Pick<ContextSpecification, 'id' | 'collection'>) => {
      void navigate({
        to: '/specs/$specId',
        params: { specId: specification.id },
        search: { collection: collectionOf(specification) },
      });
    },
    [navigate, collectionOf],
  );
  const onOpenDocuments = useCallback(
    (specification: Pick<ContextSpecification, 'id' | 'collection'>) => {
      // Before navigating, so the Documents screen already knows where it was opened from.
      rememberSessionReturn(specification.id, sessionId);
      void navigate({
        to: '/specs/$specId/documents',
        params: { specId: specification.id },
        search: { collection: collectionOf(specification) },
      });
    },
    [navigate, collectionOf, rememberSessionReturn, sessionId],
  );

  const onOpenDocumentation = useCallback(
    (sessionTitle?: string) => {
      // The Session's workspace is the Runtime's own checkout; it becomes the tab's current one
      // before the reader resolves `/docs`, and the Session (by its title) is the way back.
      currentDocsWorkspace.enterSession();
      void navigate({
        to: '/docs',
        state: {
          docsReader: { source: 'session', sessionId, ...(sessionTitle ? { sessionTitle } : {}) },
        },
      });
    },
    [navigate, sessionId],
  );

  return { onOpenSpecification, onOpenDocuments, onOpenDocumentation };
}

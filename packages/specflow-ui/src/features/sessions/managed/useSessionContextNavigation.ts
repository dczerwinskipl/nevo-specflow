import { useCallback } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useApplicationCollection } from '../../../app/navigation/ApplicationLocation';
import { useRememberSessionReturn } from '../SessionStateProvider';

/**
 * The cross-feature navigation Context's rows hand off to (`SessionContext` itself stays
 * router-agnostic): the Specification row opens `/specs/$specId`, the Documents row opens that
 * Specification's Documents with this Session remembered as the way back, so the Documents screen's
 * "Back to the Session" link returns to the same Session (open document or not).
 */
export function useSessionContextNavigation(sessionId: string) {
  const navigate = useNavigate();
  const collection = useApplicationCollection();
  const rememberSessionReturn = useRememberSessionReturn();
  const onOpenSpecification = useCallback(
    (specification: { id: string }) => {
      void navigate({
        to: '/specs/$specId',
        params: { specId: specification.id },
        search: { collection },
      });
    },
    [navigate, collection],
  );
  const onOpenDocuments = useCallback(
    (specification: { id: string }) => {
      // Before navigating, so the Documents screen already knows where it was opened from.
      rememberSessionReturn(specification.id, sessionId);
      void navigate({
        to: '/specs/$specId/documents',
        params: { specId: specification.id },
        search: { collection },
      });
    },
    [navigate, collection, rememberSessionReturn, sessionId],
  );

  return { onOpenSpecification, onOpenDocuments };
}

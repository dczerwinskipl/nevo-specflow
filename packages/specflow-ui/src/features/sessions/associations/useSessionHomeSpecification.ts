import type { SessionAssociationRead } from '@nevo/specflow-contracts/sessions';
import { useSessionAssociation } from './queries';

type AvailableSpecification = Extract<
  Extract<SessionAssociationRead['association'], { kind: 'specification' }>['specification'],
  { state: 'available' }
>['value'];

/**
 * The Specification an association makes the Session's home, only when it is `available`:
 * standalone, `forbidden`, `missing`, `unavailable` and a read in flight or failed have none.
 */
export function homeSpecification(
  read: SessionAssociationRead | undefined,
): AvailableSpecification | undefined {
  const association = read?.association;

  return association?.kind === 'specification' && association.specification.state === 'available'
    ? association.specification.value
    : undefined;
}

/** The home Specification of the Session `sessionId` (`null`: no Session route). */
export function useSessionHomeSpecification(sessionId: string | null) {
  return homeSpecification(useSessionAssociation(sessionId).data);
}

import type {
  CreateContextSession,
  CreateContextSessionResult,
} from '@nevo/specflow-contracts/sessions';
import type { SessionCoordinator } from '../../sessions';
import type { AssociationTargets } from '../targets';

export type CreateContextSessionOutcome =
  | { readonly kind: 'created'; readonly value: CreateContextSessionResult }
  | { readonly kind: 'specification_not_found' | 'specification_task_not_found' }
  | { readonly kind: 'source_unavailable' };

/**
 * Starts a Session from a Specification: the Specification and its Tasks are verified through the
 * Engine first (time-of-check only), then the Session and its association are written in one store
 * transaction under the project-scoped create key, fingerprinted over `{input, association}`.
 * Authorization is the caller's: it runs before this operation and never depends on it.
 */
export async function createContextSession(
  dependencies: { coordinator: SessionCoordinator; targets: AssociationTargets },
  actor: string,
  specId: string,
  body: CreateContextSession,
): Promise<CreateContextSessionOutcome> {
  const { taskIds = [], ...input } = body;
  const specification = await dependencies.targets.specification(specId);
  if (specification.state === 'missing') {
    return { kind: 'specification_not_found' };
  }

  if (specification.state === 'unavailable') {
    return { kind: 'source_unavailable' };
  }

  if (taskIds.length) {
    const tasks = await dependencies.targets.tasks(specId, taskIds);
    if (tasks.some((task) => task.state === 'missing')) {
      return { kind: 'specification_task_not_found' };
    }

    if (tasks.some((task) => task.state !== 'available')) {
      return { kind: 'source_unavailable' };
    }
  }

  const association = { specId: specification.value.specId, taskIds };
  const created = await dependencies.coordinator.create(actor, input, {
    ...association,
    origin: 'user',
  });

  return { kind: 'created', value: { sessionId: created.sessionId, association } };
}

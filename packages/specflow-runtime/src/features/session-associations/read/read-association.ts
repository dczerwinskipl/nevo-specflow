import {
  SessionCapabilities,
  type AssociatedFact,
  type SessionAssociationRead,
} from '@nevo/specflow-contracts/sessions';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import type { RequestAuthorization } from '../../auth';
import { sessionScope, type SessionAssociations } from '../../sessions';
import { specScope } from '../../specs';
import type { AssociationTargets, TargetFact } from '../targets';

function fact<T>(target: TargetFact<T>, id: string): AssociatedFact<T> {
  if (target.state === 'available') {
    return { state: 'available', value: target.value };
  }

  return target.state === 'missing' ? { state: 'missing', id } : { state: 'unavailable' };
}

/**
 * The association read for the Session Context and the navigator. `session.view` at the Session's
 * own scope admits the read; Specification and Task facts additionally need `spec.view` at
 * `specScope`, checked before any Engine lookup so `forbidden` never reveals existence.
 */
export async function readSessionAssociation(
  dependencies: {
    associations: SessionAssociations;
    targets: AssociationTargets;
    projectId: string | undefined;
  },
  authz: RequestAuthorization,
  sessionId: string,
): Promise<SessionAssociationRead> {
  authz.requireAccess();
  authz.requireCapabilityInAnyScope({
    resource: SessionCapabilities,
    capability: SessionCapabilities.capabilities.View,
  });
  const identity = await dependencies.associations.identity(sessionId);
  authz.require({
    resource: SessionCapabilities,
    capability: SessionCapabilities.capabilities.View,
    scope: sessionScope(identity, SessionCapabilities.capabilities.View),
  });
  const association = await dependencies.associations.association(sessionId);
  if (!association) {
    return { sessionId, association: { kind: 'standalone' } };
  }

  if (
    !authz.can({
      resource: SpecCapabilities,
      capability: SpecCapabilities.capabilities.View,
      scope: specScope(dependencies.projectId, association.specId),
    })
  ) {
    return {
      sessionId,
      association: { kind: 'specification', specification: { state: 'forbidden' }, tasks: [] },
    };
  }

  const [specification, tasks] = await Promise.all([
    dependencies.targets.specification(association.specId),
    association.taskIds.length
      ? dependencies.targets.tasks(association.specId, association.taskIds)
      : Promise.resolve([]),
  ]);

  return {
    sessionId,
    association: {
      kind: 'specification',
      specification: fact(specification, association.specId),
      tasks: association.taskIds.map((taskId, index) =>
        fact(tasks[index] ?? { state: 'unavailable' }, taskId),
      ),
    },
  };
}

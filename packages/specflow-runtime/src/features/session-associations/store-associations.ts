import { SessionListLimits } from '@nevo/specflow-contracts/sessions';
import {
  SessionError,
  type SessionAssociations,
  type SessionReference,
  type SessionsRuntime,
} from '../sessions';
import type { SessionIdentity, StoredAssociation } from '../sessions';
import type { AssociationTargets } from './targets';

function coordinatorOf(runtime: SessionsRuntime) {
  if (!runtime.coordinator) {
    throw new SessionError('SESSION_DISABLED', 'Managed Sessions are disabled.');
  }

  return runtime.coordinator;
}

/**
 * Project mode: the Session store is the association registry. `resolveMany` costs one
 * `identities` call per 500 IDs plus one Engine binding read for the distinct home Specifications;
 * the home's workspace is never stored, it is resolved at read time.
 */
export function createStoreSessionAssociations(
  runtime: SessionsRuntime,
  targets: Pick<AssociationTargets, 'workspaces'>,
): SessionAssociations {
  async function resolveMany(sessionIds: readonly string[]) {
    const resolved = new Map<string, SessionReference>();
    const coordinator = runtime.coordinator;
    const unique = [...new Set(sessionIds)];
    // Disabled Sessions have no readable store: every reference stays unresolved (hidden).
    if (!coordinator || !unique.length) {
      return resolved;
    }

    const identities: SessionIdentity[] = [];
    for (let start = 0; start < unique.length; start += SessionListLimits.scanBudget) {
      identities.push(
        ...(await coordinator.store.call<SessionIdentity[]>({
          op: 'identities',
          sessionIds: unique.slice(start, start + SessionListLimits.scanBudget),
        })),
      );
    }

    const associated = identities.filter(
      (identity): identity is SessionIdentity & { specId: string } => identity.specId !== undefined,
    );
    const workspaces = await targets.workspaces([
      ...new Set(associated.map((identity) => identity.specId)),
    ]);
    for (const identity of associated) {
      const workspaceId = workspaces.get(identity.specId);
      if (workspaceId !== undefined) {
        resolved.set(identity.sessionId, {
          sessionId: identity.sessionId,
          specId: identity.specId,
          projectId: identity.projectId,
          workspaceId,
        });
      }
    }

    return resolved;
  }

  return {
    async resolve(sessionId) {
      return (await resolveMany([sessionId])).get(sessionId) ?? null;
    },
    resolveMany,
    async identity(sessionId) {
      return coordinatorOf(runtime).store.call<SessionIdentity>({ op: 'identity', sessionId });
    },
    async association(sessionId) {
      const stored = await coordinatorOf(runtime).store.call<StoredAssociation | null>({
        op: 'association',
        sessionId,
      });

      return stored ? { specId: stored.specId, taskIds: stored.taskIds } : null;
    },
  };
}

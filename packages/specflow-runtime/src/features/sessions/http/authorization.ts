import type { FastifyRequest } from 'fastify';
import { SessionCapabilities } from '@nevo/specflow-contracts/sessions';
import type { SessionCoordinator } from '../lifecycle/coordinator';
import type { SessionIdentity } from '../persistence/protocol';
import { sessionScope, type SessionCapabilityId } from '../scope';

/**
 * Write execution: `{projectId}` to create a Session, the Session's store-derived identity to run a
 * Turn in it. Either way the scope never carries `specId` (see `sessionScope`).
 */
export function authorizeSessionWrite(
  request: FastifyRequest,
  target: { projectId: string } | SessionIdentity,
): void {
  request.authz.require({
    resource: SessionCapabilities,
    capability: SessionCapabilities.capabilities.ExecuteWrite,
    scope:
      'sessionId' in target
        ? sessionScope(target, SessionCapabilities.capabilities.ExecuteWrite)
        : { projectId: target.projectId },
  });
}

export function authorizeSession(
  request: FastifyRequest,
  c: SessionCoordinator,
  sessionId: string,
  manage = false,
): Promise<SessionIdentity> {
  return authorizeSessionCapability(
    request,
    c,
    sessionId,
    manage ? SessionCapabilities.capabilities.Manage : SessionCapabilities.capabilities.View,
  );
}

/** The store-derived identity of a Session, including its home Specification. */
function sessionIdentity(c: SessionCoordinator, sessionId: string) {
  return c.store.call<SessionIdentity>({ op: 'identity', sessionId });
}

const authorized = new WeakMap<FastifyRequest, SessionIdentity>();

/** The identity the request's Session check ran against; a handler never looks it up twice. */
export function authorizedIdentity(request: FastifyRequest, sessionId: string): SessionIdentity {
  const identity = authorized.get(request);
  if (identity?.sessionId !== sessionId) {
    throw new Error('Session handler ran without its Session authorization.');
  }

  return identity;
}

/** Any-scope precheck, store-derived identity lookup, then the target-scoped check. */
export async function authorizeSessionCapability(
  request: FastifyRequest,
  c: SessionCoordinator,
  sessionId: string,
  capability: SessionCapabilityId,
): Promise<SessionIdentity> {
  request.authz.requireAccess();
  request.authz.requireCapabilityInAnyScope({ resource: SessionCapabilities, capability });
  const identity = await sessionIdentity(c, sessionId);
  request.authz.require({
    resource: SessionCapabilities,
    capability,
    scope: sessionScope(identity, capability),
  });
  authorized.set(request, identity);

  return identity;
}

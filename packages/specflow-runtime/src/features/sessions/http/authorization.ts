import type { FastifyRequest } from 'fastify';
import { SessionCapabilities } from '@nevo/specflow-contracts/sessions';
import type { SessionCoordinator } from '../lifecycle/coordinator';

export function authorizeSessionWrite(
  request: FastifyRequest,
  scope: { projectId: string; sessionId?: string },
) {
  request.authz.require({
    resource: SessionCapabilities,
    capability: SessionCapabilities.capabilities.ExecuteWrite,
    scope,
  });
}

export async function authorizeSession(
  request: FastifyRequest,
  c: SessionCoordinator,
  sessionId: string,
  manage = false,
) {
  await authorizeSessionCapability(
    request,
    c,
    sessionId,
    manage ? SessionCapabilities.capabilities.Manage : SessionCapabilities.capabilities.View,
  );
}

/** Any-scope precheck, store-derived identity lookup, then the target-scoped check. */
export async function authorizeSessionCapability(
  request: FastifyRequest,
  c: SessionCoordinator,
  sessionId: string,
  capability: (typeof SessionCapabilities.capabilities)[keyof typeof SessionCapabilities.capabilities],
) {
  request.authz.requireAccess();
  request.authz.requireCapabilityInAnyScope({ resource: SessionCapabilities, capability });
  const identity = await c.store.call<{ projectId: string; sessionId: string }>({
    op: 'identity',
    sessionId,
  });
  request.authz.require({ resource: SessionCapabilities, capability, scope: identity });
}

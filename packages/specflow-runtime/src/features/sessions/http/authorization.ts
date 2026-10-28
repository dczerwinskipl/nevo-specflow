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
  request.authz.requireAccess();
  request.authz.requireCapabilityInAnyScope({
    resource: SessionCapabilities,
    capability: manage
      ? SessionCapabilities.capabilities.Manage
      : SessionCapabilities.capabilities.View,
  });
  const identity = await c.store.call<{ projectId: string; sessionId: string }>({
    op: 'identity',
    sessionId,
  });
  request.authz.require({
    resource: SessionCapabilities,
    capability: manage
      ? SessionCapabilities.capabilities.Manage
      : SessionCapabilities.capabilities.View,
    scope: identity,
  });
}

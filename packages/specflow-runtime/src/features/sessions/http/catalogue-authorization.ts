import type { FastifyRequest } from 'fastify';
import type { Scope } from '@nevo/authorization';
import { SessionCapabilities, type ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { SessionError } from '../errors';
import type { SessionIdentity } from '../persistence/protocol';
import { sessionScope } from '../scope';
import { requireStartSession } from '../start-authorization';
import { authorizeSessionIdentity } from './authorization';

/**
 * `GET /api/session-providers` is a starter's read, authorized by the start it is read for (after
 * the caller's own authentication check):
 *
 * - `?specId=S`: the composed create's checks (`spec.start-session` at `specScope`,
 *   `session.create` at `{projectId, specId}`), so whoever may start a Session in S may choose its
 *   agent;
 * - `?sessionId=X`: `session.manage` at the Session's store-derived scope (any-scope precheck
 *   first, so an unknown Session and a refused one both answer 403 to a caller without it);
 * - neither: `session.create` at `{projectId}`, the standalone create's check.
 *
 * Both together are `400 SESSION_INPUT_INVALID`. Answers the scope a `workspace-write` mode is
 * authorized at: the Session's own `execute-write` scope, otherwise `{projectId}` (never
 * Specification-scoped, see `sessionScope`).
 */
export async function authorizeProviderCatalogue(
  request: FastifyRequest,
  projectId: string,
  identity: (sessionId: string) => Promise<SessionIdentity>,
): Promise<Scope> {
  const { specId, sessionId } = request.query as { specId?: string; sessionId?: string };
  if (specId !== undefined && sessionId !== undefined) {
    throw new SessionError(
      'SESSION_INPUT_INVALID',
      'Read the provider catalogue for a Specification or for a Session, not both.',
    );
  }

  if (sessionId !== undefined) {
    const session = await authorizeSessionIdentity(
      request,
      () => identity(sessionId),
      SessionCapabilities.capabilities.Manage,
    );

    return sessionScope(session, SessionCapabilities.capabilities.ExecuteWrite);
  }

  if (specId !== undefined) {
    requireStartSession(request.authz, projectId, specId);
  } else {
    request.authz.require({
      resource: SessionCapabilities,
      capability: SessionCapabilities.capabilities.Create,
      scope: { projectId },
    });
  }

  return { projectId };
}

/** Marks each provider's own `workspace-write` modes with the caller's `execute-write`. */
export function authorizedProviderModes(
  items: ProviderDescriptor[],
  executeWrite: boolean,
): ProviderDescriptor[] {
  return items.map((provider) =>
    provider.providerModes
      ? {
          ...provider,
          providerModes: provider.providerModes.map((mode) => ({
            ...mode,
            authorized: mode.mode !== 'workspace-write' || executeWrite,
          })),
        }
      : provider,
  );
}

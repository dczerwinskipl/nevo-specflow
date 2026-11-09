import type { Scope } from '@nevo/authorization';
import type { CapabilityProjection } from '@nevo/specflow-contracts/authorization';
import { SessionCapabilities } from '@nevo/specflow-contracts/sessions';

/** Store-derived identity; route parameters, bodies, filters and the UI are never a scope source. */
export interface SessionScopeIdentity {
  readonly projectId: string;
  readonly sessionId: string;
  /** The immutable home Specification of an associated Session. */
  readonly specId?: string;
}
/** Every Session capability checked against one Session (creation has its own scope). */
export type SessionCapabilityId = Exclude<
  (typeof SessionCapabilities.capabilities)[keyof typeof SessionCapabilities.capabilities],
  typeof SessionCapabilities.capabilities.Create
>;
type SessionPermissions = CapabilityProjection<typeof SessionCapabilities>;

/**
 * The single authorization scope builder of a Session, used by the Session routes and by the
 * Specification and Task projections alike. An associated Session carries its home `specId` for
 * every capability except `session.execute-write`.
 */
export function sessionScope(
  identity: SessionScopeIdentity,
  capability: SessionCapabilityId,
): Scope {
  if (capability === SessionCapabilities.capabilities.ExecuteWrite) {
    // Never Specification-scoped until a Specification's Session is confined to that
    // Specification's worktree: the provider cwd is the whole verified project workspace, so a
    // Specification-scoped grant must not admit writes that reach every Specification.
    return { projectId: identity.projectId, sessionId: identity.sessionId };
  }

  return identity.specId
    ? { projectId: identity.projectId, specId: identity.specId, sessionId: identity.sessionId }
    : { projectId: identity.projectId, sessionId: identity.sessionId };
}

/** The caller's Session capability projection, each capability resolved at its own scope. */
export function resolveSessionPermissions(
  authz: {
    resolveCapabilities(target: {
      resource: typeof SessionCapabilities;
      scope: Scope;
    }): SessionPermissions;
  },
  identity: SessionScopeIdentity,
): SessionPermissions {
  const resolve = (capability: SessionCapabilityId) =>
    authz.resolveCapabilities({
      resource: SessionCapabilities,
      scope: sessionScope(identity, capability),
    });
  const permissions = resolve(SessionCapabilities.capabilities.View);
  if (!identity.specId) {
    return permissions;
  }

  return {
    ...permissions,
    'execute-write': resolve(SessionCapabilities.capabilities.ExecuteWrite)['execute-write'],
  };
}

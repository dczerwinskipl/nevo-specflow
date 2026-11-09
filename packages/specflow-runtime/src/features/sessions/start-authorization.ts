import { SessionCapabilities } from '@nevo/specflow-contracts/sessions';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import type { RequestAuthorization } from '../auth';
import { specScope } from '../specs';

/**
 * The two checks of starting a Session in a Specification, from one project id: the
 * `spec.start-session` capability at `specScope` and `session.create` at `{projectId, specId}`.
 * The composed create and the catalogue read for it (`GET /api/session-providers?specId=`) require
 * them; the workspace `startSession` action reports them.
 */
function checks(projectId: string | undefined, specId: string) {
  return [
    {
      resource: SpecCapabilities,
      capability: SpecCapabilities.capabilities.StartSession,
      scope: specScope(projectId, specId),
    },
    {
      resource: SessionCapabilities,
      capability: SessionCapabilities.capabilities.Create,
      scope: { ...(projectId !== undefined ? { projectId } : {}), specId },
    },
  ] as const;
}

export function canStartSession(
  authz: RequestAuthorization,
  projectId: string | undefined,
  specId: string,
): boolean {
  const [spec, session] = checks(projectId, specId);

  return authz.can(spec) && authz.can(session);
}

export function requireStartSession(
  authz: RequestAuthorization,
  projectId: string | undefined,
  specId: string,
): void {
  const [spec, session] = checks(projectId, specId);
  authz.require(spec);
  authz.require(session);
}

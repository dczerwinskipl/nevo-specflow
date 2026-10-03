import type { Authorization } from '@nevo/authorization';
import type {
  AuthorizationCapabilitiesResponse,
  AuthorizationResourceQuery,
} from '@nevo/specflow-contracts/authorization';

import type { RuntimeAuthConfig } from '../../authentication/config/model';
import type { AuthStore } from '../../authentication/session/state';
import { resolveAuthorizationAccess } from '../access';

export type ResolveCapabilitiesForSessionResult =
  | { readonly ok: false; readonly error: 'authentication_required' }
  | { readonly ok: true; readonly response: AuthorizationCapabilitiesResponse };

export function resolveCapabilitiesForSession(
  auth: RuntimeAuthConfig,
  store: AuthStore,
  authorization: Authorization,
  sessionId: string | undefined,
  resource: AuthorizationResourceQuery,
): ResolveCapabilitiesForSessionResult {
  const access = resolveAuthorizationAccess(auth, store, sessionId);
  if (access.mode === 'unauthenticated') {
    return { ok: false, error: 'authentication_required' };
  }

  const capabilities =
    access.mode === 'disabled'
      ? authorization.resourceCapabilities(resource.name)
      : authorization.resolveCapabilities({
          subject: access.subject,
          resource,
        }).capabilities;

  return {
    ok: true,
    response: {
      resource,
      capabilities: [...capabilities],
    },
  };
}

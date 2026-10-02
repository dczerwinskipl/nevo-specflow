import {
  createAuthorization,
  type Authorization,
  type Subject,
} from '@nevo/authorization';
import {
  SessionAuthorization,
  SettingsAuthorization,
  SpecAuthorization,
} from '@nevo/specflow-contracts';

import type { RuntimeAuthConfig } from '../auth/config.js';
import { getAuthSession } from '../auth/session-access.js';
import type { InMemoryAuthStore } from '../auth/session-store.js';
import type { RuntimeAuthorizationConfig } from './config.js';
import { SPEC_FLOW_ROLES } from './roles.js';

export const SPEC_FLOW_RESOURCES = [
  SpecAuthorization,
  SessionAuthorization,
  SettingsAuthorization,
] as const;

export type AuthorizationAccess =
  | { readonly mode: 'disabled' }
  | { readonly mode: 'unauthenticated' }
  | { readonly mode: 'subject'; readonly subject: Subject };

export function createSpecFlowAuthorization(
  config: RuntimeAuthorizationConfig,
): Authorization {
  return createAuthorization({
    resources: SPEC_FLOW_RESOURCES,
    roles: SPEC_FLOW_ROLES,
    assignments: config.assignments.map((assignment) => ({
      subject: { kind: 'user', id: assignment.userId },
      role: assignment.role,
      scope: assignment.scope,
    })),
  });
}

export function resolveAuthorizationAccess(
  auth: RuntimeAuthConfig,
  store: InMemoryAuthStore,
  sessionId: string | undefined,
): AuthorizationAccess {
  if (auth.mode === 'none') {
    return auth.localUserId
      ? { mode: 'subject', subject: { kind: 'user', id: auth.localUserId } }
      : { mode: 'disabled' };
  }

  const session = getAuthSession(auth, store, sessionId);
  return session.authenticated
    ? { mode: 'subject', subject: { kind: 'user', id: session.user.id } }
    : { mode: 'unauthenticated' };
}

import type { Subject } from '@nevo/authorization';

import type { RuntimeAuthConfig } from '../auth/config.js';
import { getAuthSession } from '../auth/session-access.js';
import type { InMemoryAuthStore } from '../auth/session-store.js';

export type AuthorizationAccess =
  | { readonly mode: 'disabled' }
  | { readonly mode: 'unauthenticated' }
  | { readonly mode: 'subject'; readonly subject: Subject };

export function resolveAuthorizationAccess(
  auth: RuntimeAuthConfig,
  store: InMemoryAuthStore,
  sessionId: string | undefined,
): AuthorizationAccess {
  if (auth.mode === 'none') {
    return auth.localUserId
      ? {
          mode: 'subject',
          subject: { kind: 'user', id: auth.localUserId },
        }
      : { mode: 'disabled' };
  }

  const session = getAuthSession(auth, store, sessionId);
  return session.authenticated
    ? {
        mode: 'subject',
        subject: { kind: 'user', id: session.user.id },
      }
    : { mode: 'unauthenticated' };
}

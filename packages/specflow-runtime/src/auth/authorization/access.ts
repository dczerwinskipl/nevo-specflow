import type { Subject } from '@nevo/authorization';

import type { RuntimeAuthConfig } from '../authentication/config/model';
import { getAuthSession } from '../authentication/session/access';
import type { AuthStore } from '../authentication/session/state';

export type AuthorizationAccess =
  | { readonly mode: 'disabled' }
  | { readonly mode: 'unauthenticated' }
  | { readonly mode: 'subject'; readonly subject: Subject };

export function resolveAuthorizationAccess(
  auth: RuntimeAuthConfig,
  store: AuthStore,
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

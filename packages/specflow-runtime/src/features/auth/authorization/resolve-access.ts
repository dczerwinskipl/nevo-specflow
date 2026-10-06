import type { Subject } from '@nevo/authorization';

import type { RuntimeAuthenticationConfig } from '../authentication/configuration/model';
import { getAuthSession } from '../authentication/session/get-session';
import type { AuthenticationStore } from '../authentication/store';

export type AuthorizationAccess =
  | { readonly mode: 'disabled' }
  | { readonly mode: 'unauthenticated' }
  | { readonly mode: 'subject'; readonly subject: Subject };

export function resolveAuthorizationAccess(
  authentication: RuntimeAuthenticationConfig,
  store: AuthenticationStore,
  sessionId: string | undefined,
): AuthorizationAccess {
  if (authentication.mode === 'none') {
    return authentication.localUserId
      ? {
          mode: 'subject',
          subject: { kind: 'user', id: authentication.localUserId },
        }
      : { mode: 'disabled' };
  }

  const session = getAuthSession(authentication, store, sessionId);
  return session.authenticated
    ? {
        mode: 'subject',
        subject: { kind: 'user', id: session.user.id },
      }
    : { mode: 'unauthenticated' };
}

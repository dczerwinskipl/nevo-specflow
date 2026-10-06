import type { RuntimeAuthenticationConfig } from '../configuration/model';
import type { AuthSession } from './model';
import { authenticatedSession, unauthenticatedSession } from './model';
import type { AuthenticationStore } from '../store';

export function getAuthSession(
  authentication: RuntimeAuthenticationConfig,
  store: AuthenticationStore,
  sessionId: string | undefined,
): AuthSession {
  const stored = store.getSession(sessionId);
  return stored
    ? authenticatedSession(authentication, stored.userId, stored.authenticatedWith, stored.userName)
    : unauthenticatedSession(authentication);
}

import type { RuntimeAuthConfig } from '../config/model';
import type { AuthSession } from './model';
import { authenticatedSession, unauthenticatedSession } from './model';
import type { AuthStore } from './state';

export function getAuthSession(
  auth: RuntimeAuthConfig,
  store: AuthStore,
  sessionId: string | undefined,
): AuthSession {
  const stored = store.getSession(sessionId);
  return stored
    ? authenticatedSession(auth, stored.userId, stored.authenticatedWith, stored.userName)
    : unauthenticatedSession(auth);
}

export function clearAuthState(
  store: AuthStore,
  sessionId: string | undefined,
  oidcTransactionId: string | undefined,
): void {
  store.deleteSession(sessionId);
  store.deleteOidcTransaction(oidcTransactionId);
}

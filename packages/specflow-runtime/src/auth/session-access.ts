import type { RuntimeAuthConfig } from './config.js';
import type { AuthSession } from './session.js';
import { authenticatedSession, unauthenticatedSession } from './session.js';
import type { InMemoryAuthStore } from './session-store.js';

export function getAuthSession(
  auth: RuntimeAuthConfig,
  store: InMemoryAuthStore,
  sessionId: string | undefined,
): AuthSession {
  const stored = store.getSession(sessionId);
  return stored
    ? authenticatedSession(auth, stored.userId, stored.provider)
    : unauthenticatedSession(auth);
}

export function logoutAuthSession(store: InMemoryAuthStore, sessionId: string | undefined): void {
  store.deleteSession(sessionId);
}

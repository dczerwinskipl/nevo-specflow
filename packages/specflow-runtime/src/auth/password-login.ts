import type { RuntimeAuthConfig } from './config.js';
import type { AuthSession } from './session.js';
import { authenticatePassword } from './password-auth.js';
import { authenticatedSession } from './session.js';
import type { InMemoryAuthStore } from './session-store.js';

export type PasswordLoginResult =
  | { readonly ok: false; readonly error: 'provider_unavailable' | 'invalid_credentials' }
  | {
      readonly ok: true;
      readonly sessionId: string;
      readonly session: AuthSession;
    };

export async function loginWithPassword(
  auth: RuntimeAuthConfig,
  store: InMemoryAuthStore,
  currentSessionId: string | undefined,
  username: string,
  password: string,
): Promise<PasswordLoginResult> {
  if (!auth.providers.password.enabled) {
    return { ok: false, error: 'provider_unavailable' };
  }

  const user = await authenticatePassword(auth, username, password);
  if (!user) {
    return { ok: false, error: 'invalid_credentials' };
  }

  store.deleteSession(currentSessionId);
  const sessionId = store.createSession({ userId: user.id, provider: 'password' });

  return {
    ok: true,
    sessionId,
    session: authenticatedSession(auth, user.id, 'password'),
  };
}

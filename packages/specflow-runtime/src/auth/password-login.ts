import type { RuntimeAuthConfig } from './config.js';
import type { PasswordLoginThrottle } from './login-throttle.js';
import type { AuthSession } from './session.js';
import { authenticatePassword } from './password-auth.js';
import { authenticatedSession } from './session.js';
import type { InMemoryAuthStore } from './session-store.js';

export type PasswordLoginResult =
  | { readonly ok: false; readonly error: 'provider_unavailable' | 'invalid_credentials' }
  | {
      readonly ok: false;
      readonly error: 'rate_limited';
      readonly retryAfterSeconds: number;
    }
  | {
      readonly ok: true;
      readonly sessionId: string;
      readonly session: AuthSession;
    };

export async function loginWithPassword(
  auth: RuntimeAuthConfig,
  store: InMemoryAuthStore,
  throttle: PasswordLoginThrottle,
  source: string,
  currentSessionId: string | undefined,
  username: string,
  password: string,
): Promise<PasswordLoginResult> {
  if (!auth.providers.password.enabled) {
    return { ok: false, error: 'provider_unavailable' };
  }

  const throttleDecision = throttle.consume(username, source);
  if (!throttleDecision.allowed) {
    return {
      ok: false,
      error: 'rate_limited',
      retryAfterSeconds: throttleDecision.retryAfterSeconds,
    };
  }

  const user = await authenticatePassword(auth, username, password);
  if (!user) {
    return { ok: false, error: 'invalid_credentials' };
  }

  throttle.resetAccount(username);
  store.deleteSession(currentSessionId);
  const sessionId = store.createSession({ userId: user.id, provider: 'password' });

  return {
    ok: true,
    sessionId,
    session: authenticatedSession(auth, user.id, 'password'),
  };
}

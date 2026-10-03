import type { RuntimeAuthConfig } from '../config/model';
import type { PasswordAccountThrottle } from './account-throttle';
import type { AuthSession } from '../session/model';
import { authenticatePassword } from './authenticate';
import { authenticatedSession } from '../session/model';
import { AuthStoreCapacityError } from '../session/errors';
import type { AuthStore } from '../session/state';

export type PasswordLoginResult =
  | { readonly ok: false; readonly error: 'invalid_credentials' }
  | {
      readonly ok: false;
      readonly error: 'rate_limited';
      readonly retryAfterSeconds: number;
    }
  | { readonly ok: false; readonly error: 'service_unavailable' }
  | {
      readonly ok: true;
      readonly sessionId: string;
      readonly session: AuthSession;
    };

export async function loginWithPassword(
  auth: RuntimeAuthConfig,
  store: AuthStore,
  accountThrottle: PasswordAccountThrottle,
  currentSessionId: string | undefined,
  username: string,
  password: string,
): Promise<PasswordLoginResult> {
  if (!auth.providers.password.enabled) {
    throw new Error('Password login was invoked while the password provider is disabled.');
  }

  const throttleDecision = accountThrottle.consume(username);
  if (!throttleDecision.allowed) {
    return {
      ok: false,
      error: 'rate_limited',
      retryAfterSeconds: throttleDecision.retryAfterSeconds,
    };
  }

  const user = await authenticatePassword(auth, username, password);
  if (!user) return { ok: false, error: 'invalid_credentials' };

  accountThrottle.reset(username);

  let sessionId: string;
  try {
    sessionId = store.createSession({ userId: user.id, provider: 'password' }, currentSessionId);
  } catch (error) {
    if (error instanceof AuthStoreCapacityError) {
      return { ok: false, error: 'service_unavailable' };
    }
    throw error;
  }

  return {
    ok: true,
    sessionId,
    session: authenticatedSession(auth, user.id, 'password'),
  };
}

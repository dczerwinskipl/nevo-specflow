import type { RuntimeAuthenticationConfig } from '../configuration/model';
import type { PasswordAccountThrottle } from './account-throttle';
import type { AuthSession } from '../session/model';
import { verifyPasswordCredentials } from './verify-credentials';
import { authenticatedSession } from '../session/model';
import { AuthenticationStoreCapacityError } from '../store/capacity-error';
import type { AuthenticationStore } from '../store';

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
  authentication: RuntimeAuthenticationConfig,
  store: AuthenticationStore,
  accountThrottle: PasswordAccountThrottle,
  currentSessionId: string | undefined,
  username: string,
  password: string,
): Promise<PasswordLoginResult> {
  if (!authentication.providers.password.enabled) {
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

  const user = await verifyPasswordCredentials(authentication, username, password);
  if (!user) return { ok: false, error: 'invalid_credentials' };

  accountThrottle.reset(username);

  let sessionId: string;
  try {
    sessionId = store.createSession(
      { userId: user.id, authenticatedWith: { kind: 'password' } },
      currentSessionId,
    );
  } catch (error) {
    if (error instanceof AuthenticationStoreCapacityError) {
      return { ok: false, error: 'service_unavailable' };
    }
    throw error;
  }

  return {
    ok: true,
    sessionId,
    session: authenticatedSession(authentication, user.id, { kind: 'password' }),
  };
}

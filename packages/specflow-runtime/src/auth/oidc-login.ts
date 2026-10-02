import type { RuntimeAuthConfig } from './config.js';
import type { OidcClient } from './oidc.js';
import { normalizeEmail } from './oidc.js';
import type { InMemoryAuthStore } from './session-store.js';

export type OidcStartResult =
  | { readonly ok: false; readonly error: 'provider_unavailable' }
  | {
      readonly ok: true;
      readonly authorizationUrl: URL;
      readonly transactionId: string;
    };

export async function startOidcLogin(
  auth: RuntimeAuthConfig,
  store: InMemoryAuthStore,
  oidc: OidcClient | undefined,
  redirectUri: string,
): Promise<OidcStartResult> {
  if (!auth.providers.oidc.enabled || !oidc) {
    return { ok: false, error: 'provider_unavailable' };
  }

  const started = await oidc.start(redirectUri);
  return {
    ok: true,
    authorizationUrl: started.authorizationUrl,
    transactionId: store.createOidcTransaction(started.transaction),
  };
}

export type OidcCompleteResult =
  | {
      readonly ok: false;
      readonly error:
        | 'provider_unavailable'
        | 'invalid_oidc_transaction'
        | 'oidc_authentication_failed'
        | 'identity_not_allowed';
    }
  | { readonly ok: true; readonly sessionId: string };

export async function completeOidcLogin(
  auth: RuntimeAuthConfig,
  store: InMemoryAuthStore,
  oidc: OidcClient | undefined,
  oidcTransactionId: string | undefined,
  currentSessionId: string | undefined,
  callbackUrl: URL,
): Promise<OidcCompleteResult> {
  if (!auth.providers.oidc.enabled || !oidc) {
    return { ok: false, error: 'provider_unavailable' };
  }

  const transaction = store.consumeOidcTransaction(oidcTransactionId);
  if (!transaction) {
    return { ok: false, error: 'invalid_oidc_transaction' };
  }

  let identity;
  try {
    identity = await oidc.complete(callbackUrl, transaction);
  } catch {
    return { ok: false, error: 'oidc_authentication_failed' };
  }

  const userId = auth.providers.oidc.allowedEmails[normalizeEmail(identity.email)];
  if (!userId) {
    return { ok: false, error: 'identity_not_allowed' };
  }

  store.deleteSession(currentSessionId);
  return {
    ok: true,
    sessionId: store.createSession({
      userId,
      provider: 'oidc',
      providerSubject: identity.subject,
    }),
  };
}

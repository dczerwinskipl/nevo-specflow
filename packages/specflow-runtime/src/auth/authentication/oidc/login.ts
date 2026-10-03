import type { RuntimeOidcEnabledProviderConfig } from '../config/model';
import type { OidcClient } from './client';
import { normalizeEmail } from './client';
import { OidcProviderError } from './errors';
import { AuthStoreCapacityError } from '../session/errors';
import type { AuthStore } from '../session/state';

export type OidcStartResult =
  | {
      readonly ok: false;
      readonly error: 'provider_unavailable';
      readonly providerError: OidcProviderError;
    }
  | { readonly ok: false; readonly error: 'service_unavailable' }
  | {
      readonly ok: true;
      readonly authorizationUrl: URL;
      readonly transactionId: string;
    };

export async function startOidcLogin(
  store: AuthStore,
  oidc: OidcClient,
  currentTransactionId: string | undefined,
  redirectUri: string,
): Promise<OidcStartResult> {
  let started;
  try {
    started = await oidc.start(redirectUri);
  } catch (error) {
    if (error instanceof OidcProviderError && error.kind === 'unavailable') {
      return { ok: false, error: 'provider_unavailable', providerError: error };
    }
    throw error;
  }

  try {
    return {
      ok: true,
      authorizationUrl: started.authorizationUrl,
      transactionId: store.createOidcTransaction(started.transaction, currentTransactionId),
    };
  } catch (error) {
    if (error instanceof AuthStoreCapacityError) {
      return { ok: false, error: 'service_unavailable' };
    }
    throw error;
  }
}

export type OidcCompleteResult =
  | {
      readonly ok: false;
      readonly error: 'invalid_oidc_transaction';
      readonly preserveTransactionCookie: boolean;
    }
  | {
      readonly ok: false;
      readonly error: 'identity_not_allowed' | 'service_unavailable';
    }
  | {
      readonly ok: false;
      readonly error: 'provider_unavailable' | 'oidc_authentication_failed';
      readonly providerError: OidcProviderError;
    }
  | { readonly ok: true; readonly sessionId: string };

export async function completeOidcLogin(
  provider: RuntimeOidcEnabledProviderConfig,
  store: AuthStore,
  oidc: OidcClient,
  oidcTransactionId: string | undefined,
  currentSessionId: string | undefined,
  callbackUrl: URL,
): Promise<OidcCompleteResult> {
  const callbackState = callbackUrl.searchParams.get('state');
  if (!callbackState) {
    return {
      ok: false,
      error: 'invalid_oidc_transaction',
      preserveTransactionCookie: true,
    };
  }

  const consumption = store.consumeOidcTransaction(oidcTransactionId, callbackState);
  if (consumption.status !== 'consumed') {
    return {
      ok: false,
      error: 'invalid_oidc_transaction',
      preserveTransactionCookie: consumption.status === 'state_mismatch',
    };
  }

  let identity;
  try {
    identity = await oidc.complete(callbackUrl, consumption.transaction);
  } catch (error) {
    if (error instanceof OidcProviderError) {
      return error.kind === 'unavailable'
        ? { ok: false, error: 'provider_unavailable', providerError: error }
        : { ok: false, error: 'oidc_authentication_failed', providerError: error };
    }
    throw error;
  }

  const normalizedEmail = normalizeEmail(identity.email);
  if (!Object.hasOwn(provider.allowedEmails, normalizedEmail)) {
    return { ok: false, error: 'identity_not_allowed' };
  }
  const userId = provider.allowedEmails[normalizedEmail];
  if (!userId) return { ok: false, error: 'identity_not_allowed' };

  try {
    return {
      ok: true,
      sessionId: store.createSession({ userId, provider: 'oidc' }, currentSessionId),
    };
  } catch (error) {
    if (error instanceof AuthStoreCapacityError) {
      return { ok: false, error: 'service_unavailable' };
    }
    throw error;
  }
}

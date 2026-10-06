import type { RuntimeOidcEnabledProviderConfig } from '../configuration/model';
import type { OidcClient } from './client';
import { normalizeEmail } from './client';
import { OidcProviderError } from './errors';
import { AuthenticationStoreCapacityError } from '../store/capacity-error';
import type { AuthenticationStore } from '../store';

export type OidcCompleteResult =
  | {
      readonly ok: false;
      readonly error: 'invalid_oidc_transaction';
      readonly preserveTransactionCookie: boolean;
      readonly returnTo?: string;
    }
  | {
      readonly ok: false;
      readonly error: 'identity_not_allowed' | 'service_unavailable';
      readonly returnTo: string;
    }
  | {
      readonly ok: false;
      readonly error: 'provider_unavailable' | 'oidc_authentication_failed';
      readonly providerError: OidcProviderError;
      readonly returnTo: string;
    }
  | { readonly ok: true; readonly sessionId: string; readonly returnTo: string };

export async function completeOidcLogin(
  providerId: string,
  provider: RuntimeOidcEnabledProviderConfig,
  store: AuthenticationStore,
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

  if (consumption.transaction.providerId !== providerId) {
    return {
      ok: false,
      error: 'invalid_oidc_transaction',
      preserveTransactionCookie: false,
      returnTo: consumption.transaction.returnTo,
    };
  }

  let identity;
  try {
    identity = await oidc.complete(callbackUrl, consumption.transaction);
  } catch (error) {
    if (error instanceof OidcProviderError) {
      return error.kind === 'unavailable'
        ? {
            ok: false,
            error: 'provider_unavailable',
            providerError: error,
            returnTo: consumption.transaction.returnTo,
          }
        : {
            ok: false,
            error: 'oidc_authentication_failed',
            providerError: error,
            returnTo: consumption.transaction.returnTo,
          };
    }
    throw error;
  }

  const normalizedEmail = normalizeEmail(identity.email);
  if (!Object.hasOwn(provider.allowedEmails, normalizedEmail)) {
    return {
      ok: false,
      error: 'identity_not_allowed',
      returnTo: consumption.transaction.returnTo,
    };
  }

  const userId = provider.allowedEmails[normalizedEmail];
  if (!userId) {
    return {
      ok: false,
      error: 'identity_not_allowed',
      returnTo: consumption.transaction.returnTo,
    };
  }

  try {
    return {
      ok: true,
      sessionId: store.createSession(
        {
          userId,
          userName: identity.name,
          authenticatedWith: { kind: 'oidc', providerId },
        },
        currentSessionId,
      ),
      returnTo: consumption.transaction.returnTo,
    };
  } catch (error) {
    if (error instanceof AuthenticationStoreCapacityError) {
      return {
        ok: false,
        error: 'service_unavailable',
        returnTo: consumption.transaction.returnTo,
      };
    }
    throw error;
  }
}

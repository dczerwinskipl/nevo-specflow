import type { OidcClient } from './client';
import { OidcProviderError } from './errors';
import { AuthenticationStoreCapacityError } from '../store/capacity-error';
import type { AuthenticationStore } from '../store';

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
  providerId: string,
  returnTo: string,
  store: AuthenticationStore,
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
      transactionId: store.createOidcTransaction(
        { ...started.transaction, providerId, returnTo },
        currentTransactionId,
      ),
    };
  } catch (error) {
    if (error instanceof AuthenticationStoreCapacityError) {
      return { ok: false, error: 'service_unavailable' };
    }
    throw error;
  }
}

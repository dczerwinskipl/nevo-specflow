import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  discovery,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
} from 'openid-client';

import type { RuntimeOidcEnabledProviderConfig } from '../config/model';
import type { OidcProtocolTransaction } from '../session/state';
import { createRetryableOidcDiscovery } from './discovery';
import {
  classifyOidcDiscoveryError,
  classifyOidcGrantError,
  oidcIdentityClaimsError,
} from './errors';

export interface OidcIdentity {
  readonly email: string;
}

export interface OidcStart {
  readonly authorizationUrl: URL;
  readonly transaction: OidcProtocolTransaction;
}

export interface OidcClient {
  start(redirectUri: string): Promise<OidcStart>;
  complete(callbackUrl: URL, transaction: OidcProtocolTransaction): Promise<OidcIdentity>;
}

export function createOidcClient(provider: RuntimeOidcEnabledProviderConfig): OidcClient {
  const getConfiguration = createRetryableOidcDiscovery(() =>
    discovery(new URL(provider.issuer), provider.clientId, provider.clientSecret),
  );

  async function configuration() {
    try {
      return await getConfiguration();
    } catch (error) {
      const providerError = classifyOidcDiscoveryError(error);
      if (providerError) throw providerError;
      throw error;
    }
  }

  return {
    async start(redirectUri) {
      const config = await configuration();
      const codeVerifier = randomPKCECodeVerifier();
      const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);
      const state = randomState();
      const nonce = randomNonce();
      const authorizationUrl = buildAuthorizationUrl(config, {
        redirect_uri: redirectUri,
        scope: 'openid email profile',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        state,
        nonce,
      });

      return {
        authorizationUrl,
        transaction: { state, nonce, codeVerifier },
      };
    },

    async complete(callbackUrl, transaction) {
      const config = await configuration();

      let tokens;
      try {
        tokens = await authorizationCodeGrant(config, callbackUrl, {
          pkceCodeVerifier: transaction.codeVerifier,
          expectedState: transaction.state,
          expectedNonce: transaction.nonce,
          idTokenExpected: true,
        });
      } catch (error) {
        const providerError = classifyOidcGrantError(error);
        if (providerError) throw providerError;
        throw error;
      }

      const claims = tokens.claims();
      const subject = typeof claims?.sub === 'string' ? claims.sub : '';
      const email = typeof claims?.email === 'string' ? normalizeEmail(claims.email) : '';

      if (!subject || !email || claims?.email_verified !== true) {
        throw oidcIdentityClaimsError();
      }

      return { email };
    },
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

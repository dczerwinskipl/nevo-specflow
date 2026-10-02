import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  discovery,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
} from 'openid-client';

import type { RuntimeOidcProviderConfig } from './config.js';
import type { StoredOidcTransaction } from './session-store.js';

export interface OidcIdentity {
  readonly subject: string;
  readonly email: string;
}

export interface OidcStart {
  readonly authorizationUrl: URL;
  readonly transaction: StoredOidcTransaction;
}

export interface OidcClient {
  start(redirectUri: string): Promise<OidcStart>;
  complete(callbackUrl: URL, transaction: StoredOidcTransaction): Promise<OidcIdentity>;
}

export function createOidcClient(provider: RuntimeOidcProviderConfig): OidcClient {
  const issuer = provider.issuer;
  const clientId = provider.clientId;
  const clientSecret = provider.clientSecret;
  if (!provider.enabled || !issuer || !clientId || !clientSecret) {
    throw new Error('OIDC is not fully configured.');
  }

  const getConfiguration = createRetryableOidcDiscovery(() =>
    discovery(new URL(issuer), clientId, clientSecret),
  );

  return {
    async start(redirectUri) {
      const config = await getConfiguration();
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
      const tokens = await authorizationCodeGrant(await getConfiguration(), callbackUrl, {
        pkceCodeVerifier: transaction.codeVerifier,
        expectedState: transaction.state,
        expectedNonce: transaction.nonce,
        idTokenExpected: true,
      });
      const claims = tokens.claims();
      const subject = typeof claims?.sub === 'string' ? claims.sub : '';
      const email = typeof claims?.email === 'string' ? normalizeEmail(claims.email) : '';

      if (!subject || !email || claims?.email_verified !== true) {
        throw new Error('OIDC response did not contain a verified email identity.');
      }

      return { subject, email };
    },
  };
}

export function createRetryableOidcDiscovery<T>(discover: () => Promise<T>): () => Promise<T> {
  let resolved: { readonly value: T } | undefined;
  let pending: Promise<T> | undefined;

  return async () => {
    if (resolved) {
      return resolved.value;
    }
    if (pending) {
      return pending;
    }

    pending = discover()
      .then((value) => {
        resolved = { value };
        return value;
      })
      .finally(() => {
        pending = undefined;
      });

    return pending;
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

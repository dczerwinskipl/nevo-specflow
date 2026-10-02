import {
  authorizationCodeGrant,
  buildAuthorizationUrl,
  calculatePKCECodeChallenge,
  discovery,
  randomNonce,
  randomPKCECodeVerifier,
  randomState,
  type Configuration,
} from 'openid-client';

import type { RuntimeGoogleProviderConfig } from '../config/types.js';
import type { StoredOidcTransaction } from './session-store.js';

const GOOGLE_ISSUER = new URL('https://accounts.google.com');

export interface GoogleOidcIdentity {
  readonly subject: string;
  readonly email: string;
}

export interface GoogleOidcStart {
  readonly authorizationUrl: URL;
  readonly transaction: StoredOidcTransaction;
}

export interface GoogleOidcClient {
  start(redirectUri: string): Promise<GoogleOidcStart>;
  complete(callbackUrl: URL, transaction: StoredOidcTransaction): Promise<GoogleOidcIdentity>;
}

export function createGoogleOidcClient(provider: RuntimeGoogleProviderConfig): GoogleOidcClient {
  const clientId = provider.clientId;
  const clientSecret = provider.clientSecret;
  if (!provider.enabled || !clientId || !clientSecret) {
    throw new Error('Google OIDC is not fully configured.');
  }

  let configuration: Promise<Configuration> | undefined;
  const getConfiguration = (): Promise<Configuration> => {
    configuration ??= discovery(GOOGLE_ISSUER, clientId, clientSecret);
    return configuration;
  };

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
        throw new Error('Google OIDC response did not contain a verified email identity.');
      }

      return { subject, email };
    },
  };
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

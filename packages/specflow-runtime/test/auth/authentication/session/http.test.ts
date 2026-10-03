import { describe, expect, it } from 'vitest';

import { InMemoryAuthStore } from '../../../../src/auth/authentication/session/store';
import { authCookieNames } from '../../../../src/auth/http/cookies';
import { createRuntimeApp } from '../../../../src/server/app';
import { noAuthConfig, passwordConfig } from '../../support/config';

const COOKIE_NAMES = authCookieNames(4318);

describe('authentication session HTTP adapter', () => {
  it('projects trusted local identity without pretending it is authenticated', async () => {
    const app = await createRuntimeApp(noAuthConfig());
    try {
      const response = await app.inject({ method: 'GET', url: '/api/auth/session' });

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.json()).toEqual({
        authenticated: false,
        user: { id: 'demo-user', name: 'Demo User' },
        availableProviders: [],
      });
    } finally {
      await app.close();
    }
  });

  it('clears both session and pending OIDC state on logout', async () => {
    let id = 0;
    const store = new InMemoryAuthStore({ idFactory: () => `id-${String(++id)}` });
    const sessionId = store.createSession({ userId: 'demo-user', provider: 'password' });
    const transactionId = store.createOidcTransaction({
      state: 'state',
      nonce: 'nonce',
      codeVerifier: 'verifier',
    });
    const app = await createRuntimeApp(passwordConfig(), { auth: { store } });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: {
          cookie: `${COOKIE_NAMES.session}=${sessionId}; ${COOKIE_NAMES.oidc}=${transactionId}`,
        },
      });

      expect(response.statusCode).toBe(204);
      expect(store.getSession(sessionId)).toBeNull();
      expect(store.consumeOidcTransaction(transactionId, 'state')).toEqual({ status: 'missing' });
    } finally {
      await app.close();
    }
  });
});

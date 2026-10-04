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
        authenticationRequired: false,
        authenticated: false,
        user: { id: 'demo-user', name: 'Demo User' },
        loginMethods: { password: { enabled: false }, oidc: [] },
      });
    } finally {
      await app.close();
    }
  });

  it('projects OIDC session profile data supplied by the provider', async () => {
    const store = new InMemoryAuthStore({ idFactory: () => 'session-id' });
    const sessionId = store.createSession({
      userId: 'demo-user',
      userName: 'Provider Display Name',
      authenticatedWith: { kind: 'oidc', providerId: 'company' },
    });
    const app = await createRuntimeApp(passwordConfig(), { auth: { store } });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/api/auth/session',
        headers: { cookie: `${COOKIE_NAMES.session}=${sessionId}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        authenticated: true,
        user: { id: 'demo-user', name: 'Provider Display Name' },
        authenticatedWith: { kind: 'oidc', providerId: 'company' },
      });
    } finally {
      await app.close();
    }
  });

  it('clears both session and pending OIDC state on logout', async () => {
    let id = 0;
    const store = new InMemoryAuthStore({ idFactory: () => `id-${String(++id)}` });
    const sessionId = store.createSession({
      userId: 'demo-user',
      authenticatedWith: { kind: 'password' },
    });
    const transactionId = store.createOidcTransaction({
      state: 'state',
      nonce: 'nonce',
      codeVerifier: 'verifier',
      providerId: 'company',
      returnTo: '/',
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

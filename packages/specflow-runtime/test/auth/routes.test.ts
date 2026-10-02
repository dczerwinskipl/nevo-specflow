import { describe, expect, it } from 'vitest';

import type { OidcClient } from '../../src/auth/oidc.js';
import type { StoredOidcTransaction } from '../../src/auth/session-store.js';
import type { RuntimeConfig } from '../../src/config/types.js';
import { createRuntimeApp } from '../../src/server/app.js';

const PASSWORD_HASH =
  '$scrypt$16384$8$1$MDEyMzQ1Njc4OWFiY2RlZg$tjK03tRvEjqCcPwmgtddMkgjlXrk8U_b9rIvfeBMKCc';

function passwordConfig(): RuntimeConfig {
  return {
    server: { host: '127.0.0.1', port: 4318, tls: { enabled: false } },
    auth: {
      mode: 'required',
      users: { 'demo-user': { name: 'Demo User' } },
      providers: {
        password: {
          enabled: true,
          accounts: {
            demo: { userId: 'demo-user', passwordHash: PASSWORD_HASH },
          },
        },
        oidc: { enabled: false, allowedEmails: {} },
      },
    },
  };
}

function oidcConfig(allowedEmails: Readonly<Record<string, string>>): RuntimeConfig {
  return {
    server: {
      host: '127.0.0.1',
      port: 4318,
      publicOrigin: 'https://specflow.example.test:4318',
      tls: { enabled: true, certFile: 'cert.pem', keyFile: 'key.pem' },
    },
    auth: {
      mode: 'required',
      users: { 'demo-user': { name: 'Demo User' } },
      providers: {
        password: { enabled: false, accounts: {} },
        oidc: {
          enabled: true,
          issuer: 'https://issuer.example.test',
          clientId: 'client-id',
          clientSecret: 'client-secret',
          allowedEmails,
        },
      },
    },
  };
}

function cookieValue(setCookie: string | string[] | undefined, name: string): string {
  const values = Array.isArray(setCookie) ? setCookie : [setCookie ?? ''];
  const header = values.find((value) => value.startsWith(`${name}=`));
  const match = header?.match(new RegExp(`^${name}=([^;]+)`));
  if (!match?.[1]) throw new Error(`Missing ${name} cookie in ${JSON.stringify(setCookie)}`);
  return match[1];
}

describe('authentication HTTP API', () => {
  it('returns the session, authenticates by password, and logs out', async () => {
    const app = await createRuntimeApp(passwordConfig());
    try {
      const anonymous = await app.inject({ method: 'GET', url: '/api/auth/session' });
      expect(anonymous.statusCode).toBe(200);
      expect(anonymous.json()).toEqual({
        authenticated: false,
        availableProviders: ['password'],
      });

      const malformed = await app.inject({
        method: 'POST',
        url: '/api/auth/password/login',
        payload: { username: 'demo', password: 123 },
      });
      expect(malformed.statusCode).toBe(400);
      expect(malformed.json()).toMatchObject({ statusCode: 400, error: 'Bad Request' });

      const extraField = await app.inject({
        method: 'POST',
        url: '/api/auth/password/login',
        payload: { username: 'demo', password: 'wrong', unexpected: true },
      });
      expect(extraField.statusCode).toBe(400);

      const invalid = await app.inject({
        method: 'POST',
        url: '/api/auth/password/login',
        payload: { username: 'demo', password: 'wrong' },
      });
      expect(invalid.statusCode).toBe(401);
      expect(invalid.json()).toEqual({ error: 'invalid_credentials' });

      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/password/login',
        payload: { username: 'demo', password: 'correct horse battery staple' },
      });
      expect(login.statusCode).toBe(200);
      expect(login.json()).toEqual({
        authenticated: true,
        user: { id: 'demo-user', name: 'Demo User' },
        provider: 'password',
        availableProviders: ['password'],
      });
      const setCookie = login.headers['set-cookie'];
      expect(String(setCookie)).toContain('HttpOnly');
      expect(String(setCookie)).toContain('SameSite=Lax');
      expect(String(setCookie)).not.toContain('Secure');
      const session = cookieValue(setCookie, 'nevo_session');

      const current = await app.inject({
        method: 'GET',
        url: '/api/auth/session',
        headers: { cookie: `nevo_session=${session}` },
      });
      expect(current.json()).toMatchObject({
        authenticated: true,
        user: { id: 'demo-user' },
        provider: 'password',
      });

      const logout = await app.inject({
        method: 'POST',
        url: '/api/auth/logout',
        headers: { cookie: `nevo_session=${session}` },
      });
      expect(logout.statusCode).toBe(204);

      const afterLogout = await app.inject({
        method: 'GET',
        url: '/api/auth/session',
        headers: { cookie: `nevo_session=${session}` },
      });
      expect(afterLogout.json()).toMatchObject({ authenticated: false });
    } finally {
      await app.close();
    }
  });

  it('validates password login input before the handler runs', async () => {
    const config = passwordConfig();
    const providerDisabledConfig: RuntimeConfig = {
      ...config,
      auth: {
        ...config.auth,
        providers: {
          password: { enabled: false, accounts: {} },
          oidc: { enabled: false, allowedEmails: {} },
        },
      },
    };
    const app = await createRuntimeApp(providerDisabledConfig);
    try {
      const malformed = await app.inject({
        method: 'POST',
        url: '/api/auth/password/login',
        payload: { username: 'demo' },
      });

      expect(malformed.statusCode).toBe(400);
      expect(malformed.json()).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
      });

      const validShape = await app.inject({
        method: 'POST',
        url: '/api/auth/password/login',
        payload: { username: 'demo', password: 'irrelevant' },
      });

      expect(validShape.statusCode).toBe(404);
      expect(validShape.json()).toEqual({ error: 'provider_unavailable' });
    } finally {
      await app.close();
    }
  });

  it('keeps configured local identity explicitly unauthenticated in none mode', async () => {
    const config = passwordConfig();
    const noneConfig: RuntimeConfig = {
      ...config,
      auth: {
        ...config.auth,
        mode: 'none',
        localUserId: 'demo-user',
        providers: {
          password: { enabled: false, accounts: {} },
          oidc: { enabled: false, allowedEmails: {} },
        },
      },
    };
    const app = await createRuntimeApp(noneConfig);
    try {
      const response = await app.inject({ method: 'GET', url: '/api/auth/session' });
      expect(response.json()).toEqual({
        authenticated: false,
        user: { id: 'demo-user', name: 'Demo User' },
        availableProviders: [],
      });
    } finally {
      await app.close();
    }
  });

  it('runs the OIDC redirect/callback flow without retaining provider tokens', async () => {
    const transaction: StoredOidcTransaction = {
      state: 'state',
      nonce: 'nonce',
      codeVerifier: 'verifier',
    };
    const oidc: OidcClient = {
      start(redirectUri) {
        expect(redirectUri).toBe('https://specflow.example.test:4318/api/auth/oidc/callback');
        return Promise.resolve({
          authorizationUrl: new URL('https://issuer.example.test/authorize?state=state'),
          transaction,
        });
      },
      complete(callbackUrl, stored) {
        expect(callbackUrl.toString()).toBe(
          'https://specflow.example.test:4318/api/auth/oidc/callback?code=abc&state=state',
        );
        expect(stored).toEqual(transaction);
        return Promise.resolve({ subject: 'oidc-subject', email: ' Demo@Example.com ' });
      },
    };

    const app = await createRuntimeApp(oidcConfig({ 'demo@example.com': 'demo-user' }), { oidc });
    try {
      const login = await app.inject({ method: 'GET', url: '/api/auth/oidc/login' });
      expect(login.statusCode).toBe(302);
      expect(login.headers.location).toBe('https://issuer.example.test/authorize?state=state');
      expect(String(login.headers['set-cookie'])).toContain('Secure');
      const oidcCookie = cookieValue(login.headers['set-cookie'], 'nevo_oidc');

      const callback = await app.inject({
        method: 'GET',
        url: '/api/auth/oidc/callback?code=abc&state=state',
        headers: { cookie: `nevo_oidc=${oidcCookie}` },
      });
      expect(callback.statusCode).toBe(302);
      expect(callback.headers.location).toBe('https://specflow.example.test:4318/');
      const session = cookieValue(callback.headers['set-cookie'], 'nevo_session');

      const current = await app.inject({
        method: 'GET',
        url: '/api/auth/session',
        headers: { cookie: `nevo_session=${session}` },
      });
      expect(current.json()).toEqual({
        authenticated: true,
        user: { id: 'demo-user', name: 'Demo User' },
        provider: 'oidc',
        availableProviders: ['oidc'],
      });
    } finally {
      await app.close();
    }
  });

  it('rejects a OIDC identity that is not allow-listed', async () => {
    const oidc: OidcClient = {
      start() {
        return Promise.resolve({
          authorizationUrl: new URL('https://issuer.example.test/authorize'),
          transaction: { state: 'state', nonce: 'nonce', codeVerifier: 'verifier' },
        });
      },
      complete() {
        return Promise.resolve({ subject: 'subject', email: 'other@example.com' });
      },
    };
    const app = await createRuntimeApp(oidcConfig({ 'demo@example.com': 'demo-user' }), {
      oidc,
    });
    try {
      const login = await app.inject({ method: 'GET', url: '/api/auth/oidc/login' });
      const oidcCookie = cookieValue(login.headers['set-cookie'], 'nevo_oidc');
      const callback = await app.inject({
        method: 'GET',
        url: '/api/auth/oidc/callback?code=abc&state=state',
        headers: { cookie: `nevo_oidc=${oidcCookie}` },
      });
      expect(callback.statusCode).toBe(403);
      expect(callback.json()).toEqual({ error: 'identity_not_allowed' });
    } finally {
      await app.close();
    }
  });
});

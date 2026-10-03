import { describe, expect, it } from 'vitest';

import type { OidcClient } from '../../../../src/auth/authentication/oidc/client';
import { OidcProviderError } from '../../../../src/auth/authentication/oidc/errors';
import type { StoredOidcTransaction } from '../../../../src/auth/authentication/session/state';
import { authCookieNames } from '../../../../src/auth/http/cookies';
import { createRuntimeApp } from '../../../../src/server/app';
import { oidcConfig, passwordConfig } from '../../support/config';
import { cookieValue } from '../../support/http';

const COOKIE_NAMES = authCookieNames(4318);

describe('OIDC HTTP adapter', () => {
  it('does not register OIDC routes when the provider is disabled', async () => {
    const app = await createRuntimeApp(passwordConfig());
    try {
      const login = await app.inject({ method: 'GET', url: '/api/auth/oidc/login' });
      const callback = await app.inject({
        method: 'GET',
        url: '/api/auth/oidc/callback?code=abc&state=state',
      });

      expect(login.statusCode).toBe(404);
      expect(callback.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('rate-limits OIDC starts by normalized IPv6 /64 before provider work', async () => {
    let startCalls = 0;
    const oidc: OidcClient = {
      start() {
        startCalls += 1;
        return Promise.resolve({
          authorizationUrl: new URL('https://issuer.example.test/authorize'),
          transaction: {
            state: `state-${String(startCalls)}`,
            nonce: 'nonce',
            codeVerifier: 'verifier',
          },
        });
      },
      complete() {
        throw new Error('callback is not part of this test');
      },
    };
    const app = await createRuntimeApp(oidcConfig({ 'demo@example.com': 'demo-user' }), {
      auth: { oidc },
    });

    try {
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        const response = await app.inject({
          method: 'GET',
          url: '/api/auth/oidc/login',
          remoteAddress: `2001:db8:abcd:1234::${attempt.toString(16)}`,
        });
        expect(response.statusCode).toBe(302);
      }

      const limited = await app.inject({
        method: 'GET',
        url: '/api/auth/oidc/login',
        remoteAddress: '2001:db8:abcd:1234::ffff',
      });

      expect(limited.statusCode).toBe(429);
      expect(limited.headers['retry-after']).toBeDefined();
      expect(limited.json()).toEqual({ error: 'rate_limited' });
      expect(startCalls).toBe(10);
    } finally {
      await app.close();
    }
  });

  it('maps provider availability failures without leaking provider details', async () => {
    const oidc: OidcClient = {
      start() {
        return Promise.reject(
          new OidcProviderError(
            'unavailable',
            'discovery failed',
            { category: 'discovery', code: 'OAUTH_TIMEOUT' },
            new Error('socket details'),
          ),
        );
      },
      complete() {
        throw new Error('callback is not part of this test');
      },
    };
    const app = await createRuntimeApp(oidcConfig({ 'demo@example.com': 'demo-user' }), {
      auth: { oidc },
    });

    try {
      const response = await app.inject({ method: 'GET', url: '/api/auth/oidc/login' });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: 'provider_unavailable' });
    } finally {
      await app.close();
    }
  });

  it('runs the redirect/callback flow without retaining provider tokens', async () => {
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
        return Promise.resolve({ email: ' Demo@Example.com ' });
      },
    };

    const app = await createRuntimeApp(oidcConfig({ 'demo@example.com': 'demo-user' }), {
      auth: { oidc },
    });
    try {
      const login = await app.inject({ method: 'GET', url: '/api/auth/oidc/login' });
      expect(login.statusCode).toBe(302);
      const oidcCookie = cookieValue(login.headers['set-cookie'], COOKIE_NAMES.oidc);

      const callback = await app.inject({
        method: 'GET',
        url: '/api/auth/oidc/callback?code=abc&state=state',
        headers: { cookie: `${COOKIE_NAMES.oidc}=${oidcCookie}` },
      });
      expect(callback.statusCode).toBe(302);
      expect(callback.headers.location).toBe('https://specflow.example.test:4318/');
      expect(cookieValue(callback.headers['set-cookie'], COOKIE_NAMES.session)).not.toBe('');
    } finally {
      await app.close();
    }
  });

  it('rejects an identity outside the configured allow-list', async () => {
    const oidc: OidcClient = {
      start: () =>
        Promise.resolve({
          authorizationUrl: new URL('https://issuer.example.test/authorize'),
          transaction: { state: 'state', nonce: 'nonce', codeVerifier: 'verifier' },
        }),
      complete: () => Promise.resolve({ email: 'other@example.com' }),
    };
    const app = await createRuntimeApp(oidcConfig({ 'demo@example.com': 'demo-user' }), {
      auth: { oidc },
    });

    try {
      const login = await app.inject({ method: 'GET', url: '/api/auth/oidc/login' });
      const oidcCookie = cookieValue(login.headers['set-cookie'], COOKIE_NAMES.oidc);
      const callback = await app.inject({
        method: 'GET',
        url: '/api/auth/oidc/callback?code=abc&state=state',
        headers: { cookie: `${COOKIE_NAMES.oidc}=${oidcCookie}` },
      });
      expect(callback.statusCode).toBe(403);
      expect(callback.json()).toEqual({ error: 'identity_not_allowed' });
    } finally {
      await app.close();
    }
  });

  it('maps provider outage during callback to 503 without exposing provider details', async () => {
    const oidc: OidcClient = {
      start: () =>
        Promise.resolve({
          authorizationUrl: new URL('https://issuer.example.test/authorize'),
          transaction: { state: 'state', nonce: 'nonce', codeVerifier: 'verifier' },
        }),
      complete: () =>
        Promise.reject(
          new OidcProviderError(
            'unavailable',
            'token endpoint unavailable',
            {
              category: 'token_endpoint',
              code: 'temporarily_unavailable',
              status: 503,
            },
            new Error('provider response body that must stay private'),
          ),
        ),
    };
    const app = await createRuntimeApp(oidcConfig({ 'demo@example.com': 'demo-user' }), {
      auth: { oidc },
    });

    try {
      const login = await app.inject({ method: 'GET', url: '/api/auth/oidc/login' });
      const oidcCookie = cookieValue(login.headers['set-cookie'], COOKIE_NAMES.oidc);
      const callback = await app.inject({
        method: 'GET',
        url: '/api/auth/oidc/callback?code=abc&state=state',
        headers: { cookie: `${COOKIE_NAMES.oidc}=${oidcCookie}` },
      });

      expect(callback.statusCode).toBe(503);
      expect(callback.json()).toEqual({ error: 'provider_unavailable' });
      expect(JSON.stringify(callback.json())).not.toContain('provider response body');
    } finally {
      await app.close();
    }
  });
  it('preserves pending login state and cookie after a callback with the wrong state', async () => {
    let completeCalls = 0;
    const oidc: OidcClient = {
      start: () =>
        Promise.resolve({
          authorizationUrl: new URL('https://issuer.example.test/authorize?state=expected'),
          transaction: { state: 'expected', nonce: 'nonce', codeVerifier: 'verifier' },
        }),
      complete: () => {
        completeCalls += 1;
        return Promise.resolve({ email: 'demo@example.com' });
      },
    };
    const app = await createRuntimeApp(oidcConfig({ 'demo@example.com': 'demo-user' }), {
      auth: { oidc },
    });

    try {
      const login = await app.inject({ method: 'GET', url: '/api/auth/oidc/login' });
      const oidcCookie = cookieValue(login.headers['set-cookie'], COOKIE_NAMES.oidc);

      const attackerCallback = await app.inject({
        method: 'GET',
        url: '/api/auth/oidc/callback?code=abc&state=wrong',
        headers: { cookie: `${COOKIE_NAMES.oidc}=${oidcCookie}` },
      });
      expect(attackerCallback.statusCode).toBe(400);
      expect(attackerCallback.json()).toEqual({ error: 'invalid_oidc_transaction' });
      expect(String(attackerCallback.headers['set-cookie'] ?? '')).not.toContain(
        `${COOKIE_NAMES.oidc}=;`,
      );
      expect(completeCalls).toBe(0);

      const validCallback = await app.inject({
        method: 'GET',
        url: '/api/auth/oidc/callback?code=abc&state=expected',
        headers: { cookie: `${COOKIE_NAMES.oidc}=${oidcCookie}` },
      });
      expect(validCallback.statusCode).toBe(302);
      expect(completeCalls).toBe(1);
    } finally {
      await app.close();
    }
  });

});

import { describe, expect, it } from 'vitest';

import type { OidcClient } from '../../../../src/auth/authentication/oidc/client';
import { OidcProviderError } from '../../../../src/auth/authentication/oidc/errors';
import { normalizeReturnTo } from '../../../../src/auth/authentication/oidc/http';
import { authCookieNames } from '../../../../src/auth/http/cookies';
import { createRuntimeApp } from '../../../../src/server/app';
import { oidcConfig, passwordConfig } from '../../support/config';
import { cookieValue } from '../../support/http';

const COOKIE_NAMES = authCookieNames(4318);
const START_URL = '/api/auth/oidc/company/start';
const CALLBACK_URL = '/api/auth/oidc/company/callback';

describe('OIDC HTTP adapter', () => {
  it('does not register OIDC routes when no instance is enabled', async () => {
    const app = await createRuntimeApp(passwordConfig());
    try {
      expect((await app.inject({ method: 'POST', url: START_URL, payload: {} })).statusCode).toBe(
        404,
      );
      expect(
        (
          await app.inject({
            method: 'GET',
            url: `${CALLBACK_URL}?code=abc&state=state`,
          })
        ).statusCode,
      ).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('starts through JSON, stores returnTo, and completes through the provider-specific callback', async () => {
    const transaction = { state: 'state', nonce: 'nonce', codeVerifier: 'verifier' };
    const oidc: OidcClient = {
      start(redirectUri) {
        expect(redirectUri).toBe(
          'https://specflow.example.test:4318/api/auth/oidc/company/callback',
        );
        return Promise.resolve({
          authorizationUrl: new URL('https://issuer.example.test/authorize?state=state'),
          transaction,
        });
      },
      complete(callbackUrl, stored) {
        expect(callbackUrl.toString()).toBe(
          'https://specflow.example.test:4318/api/auth/oidc/company/callback?code=abc&state=state',
        );
        expect(stored).toMatchObject(transaction);
        return Promise.resolve({ email: ' Demo@Example.com ' });
      },
    };

    const app = await createRuntimeApp(oidcConfig({ 'demo@example.com': 'demo-user' }), {
      auth: { oidcClients: { company: oidc } },
    });
    try {
      const start = await app.inject({
        method: 'POST',
        url: START_URL,
        payload: { returnTo: '/specs/S1?tab=tasks' },
      });
      expect(start.statusCode).toBe(200);
      expect(start.json()).toEqual({
        authorizationUrl: 'https://issuer.example.test/authorize?state=state',
      });
      const oidcCookie = cookieValue(start.headers['set-cookie'], COOKIE_NAMES.oidc);

      const callback = await app.inject({
        method: 'GET',
        url: `${CALLBACK_URL}?code=abc&state=state`,
        headers: { cookie: `${COOKIE_NAMES.oidc}=${oidcCookie}` },
      });
      expect(callback.statusCode).toBe(302);
      expect(callback.headers.location).toBe(
        'https://specflow.example.test:4318/specs/S1?tab=tasks',
      );
      expect(cookieValue(callback.headers['set-cookie'], COOKIE_NAMES.session)).not.toBe('');
    } finally {
      await app.close();
    }
  });

  it('redirects callback failures back to the login screen without leaking provider details', async () => {
    const oidc: OidcClient = {
      start: () =>
        Promise.resolve({
          authorizationUrl: new URL('https://issuer.example.test/authorize?state=state'),
          transaction: { state: 'state', nonce: 'nonce', codeVerifier: 'verifier' },
        }),
      complete: () => Promise.resolve({ email: 'other@example.com' }),
    };
    const app = await createRuntimeApp(oidcConfig({ 'demo@example.com': 'demo-user' }), {
      auth: { oidcClients: { company: oidc } },
    });

    try {
      const start = await app.inject({
        method: 'POST',
        url: START_URL,
        payload: { returnTo: '/specs' },
      });
      const oidcCookie = cookieValue(start.headers['set-cookie'], COOKIE_NAMES.oidc);
      const callback = await app.inject({
        method: 'GET',
        url: `${CALLBACK_URL}?code=abc&state=state`,
        headers: { cookie: `${COOKIE_NAMES.oidc}=${oidcCookie}` },
      });
      expect(callback.statusCode).toBe(302);
      expect(callback.headers.location).toContain('/login?');
      expect(callback.headers.location).toContain('error=identity_not_allowed');
      expect(callback.headers.location).toContain('returnTo=%2Fspecs');
    } finally {
      await app.close();
    }
  });

  it('maps provider availability failures during start without leaking details', async () => {
    const oidc: OidcClient = {
      start: () =>
        Promise.reject(
          new OidcProviderError(
            'unavailable',
            'discovery failed',
            { category: 'discovery', code: 'OAUTH_TIMEOUT' },
            new Error('socket details'),
          ),
        ),
      complete: () => Promise.reject(new Error('not used')),
    };
    const app = await createRuntimeApp(oidcConfig({ 'demo@example.com': 'demo-user' }), {
      auth: { oidcClients: { company: oidc } },
    });

    try {
      const response = await app.inject({ method: 'POST', url: START_URL, payload: {} });
      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: 'provider_unavailable' });
    } finally {
      await app.close();
    }
  });

  it('rejects unsafe return targets before provider work', async () => {
    expect(normalizeReturnTo('/specs?tab=tasks')).toBe('/specs?tab=tasks');
    expect(normalizeReturnTo('//evil.example/path')).toBeNull();
    expect(normalizeReturnTo('https://evil.example/path')).toBeNull();

    let startCalls = 0;
    const oidc: OidcClient = {
      start: () => {
        startCalls += 1;
        return Promise.reject(new Error('must not run'));
      },
      complete: () => Promise.reject(new Error('not used')),
    };
    const app = await createRuntimeApp(oidcConfig({ 'demo@example.com': 'demo-user' }), {
      auth: { oidcClients: { company: oidc } },
    });

    try {
      const response = await app.inject({
        method: 'POST',
        url: START_URL,
        payload: { returnTo: '//evil.example/path' },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ error: 'invalid_return_to' });
      expect(startCalls).toBe(0);
    } finally {
      await app.close();
    }
  });
});

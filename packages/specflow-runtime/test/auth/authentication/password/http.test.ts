import { describe, expect, it } from 'vitest';

import { InMemoryAuthStore } from '../../../../src/auth/authentication/session/store';
import { createRuntimeApp } from '../../../../src/server/app';
import { noAuthConfig, passwordConfig } from '../../support/config';
import { cookieValue } from '../../support/http';

describe('password authentication HTTP adapter', () => {
  it('lets Fastify validate the request before the handler runs', async () => {
    const app = await createRuntimeApp(passwordConfig());
    try {
      const missingPassword = await app.inject({
        method: 'POST',
        url: '/api/auth/password/login',
        payload: { username: 'demo' },
      });
      expect(missingPassword.statusCode).toBe(400);

      const extraField = await app.inject({
        method: 'POST',
        url: '/api/auth/password/login',
        payload: { username: 'demo', password: 'wrong', unexpected: true },
      });
      expect(extraField.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('maps invalid credentials and successful login to the declared HTTP contract', async () => {
    const app = await createRuntimeApp(passwordConfig());
    try {
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
        payload: {
          username: ' DEMO ',
          password: 'correct horse battery staple',
        },
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
      expect(cookieValue(setCookie, 'nevo_session')).not.toBe('');
    } finally {
      await app.close();
    }
  });

  it('returns 429 with Retry-After when the account throttle rejects the attempt', async () => {
    const app = await createRuntimeApp(passwordConfig(), {
      auth: {
        passwordAccountThrottle: {
          consume: () => ({ allowed: false, retryAfterSeconds: 60 }),
          reset: () => undefined,
        },
      },
    });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/password/login',
        payload: { username: 'demo', password: 'irrelevant' },
      });

      expect(response.statusCode).toBe(429);
      expect(response.headers['retry-after']).toBe('60');
      expect(response.json()).toEqual({ error: 'rate_limited' });
    } finally {
      await app.close();
    }
  });

  it('uses the injected store policy as the cookie TTL source of truth', async () => {
    const store = new InMemoryAuthStore({ sessionTtlMs: 2_000 });
    const app = await createRuntimeApp(passwordConfig(), { auth: { store } });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/password/login',
        payload: {
          username: 'demo',
          password: 'correct horse battery staple',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(String(response.headers['set-cookie'])).toContain('Max-Age=2');
    } finally {
      await app.close();
    }
  });

  it('returns 503 without evicting live sessions when the store is full', async () => {
    const store = new InMemoryAuthStore({ maxSessions: 1 });
    const existing = store.createSession({ userId: 'other-user', provider: 'password' });
    const app = await createRuntimeApp(passwordConfig(), { auth: { store } });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/password/login',
        payload: {
          username: 'demo',
          password: 'correct horse battery staple',
        },
      });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ error: 'service_unavailable' });
      expect(store.getSession(existing)).toEqual({
        userId: 'other-user',
        provider: 'password',
      });
    } finally {
      await app.close();
    }
  });

  it('does not register a password endpoint when the provider is disabled', async () => {
    const app = await createRuntimeApp(noAuthConfig());
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/password/login',
        payload: { username: 'demo', password: 'irrelevant' },
      });
      expect(response.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });
});

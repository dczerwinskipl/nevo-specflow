import cookie from '@fastify/cookie';
import Fastify from 'fastify';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import { describe, expect, it, vi } from 'vitest';

import { InMemoryAuthenticationStore } from '../../../src/features/auth/authentication/store/in-memory-store';
import type { RuntimeAuthorizationConfig } from '../../../src/features/auth/authorization/configuration/model';
import { createRuntimeAuthorization } from '../../../src/features/auth/authorization/create-authorization';
import { requireCapability } from '../../../src/features/auth/authorization/guards';
import { registerAuthorizationRequestContext } from '../../../src/features/auth/authorization/request-context';
import { authCookieNames } from '../../../src/features/auth/authentication/http/cookies';
import { registerRuntimeErrorHandler } from '../../../src/server/error-handler';
import { passwordConfig } from '../support/config';

const COOKIE_NAMES = authCookieNames(4318);

const roles = {
  viewer: [SpecCapabilities.capabilities.View],
  developer: [
    SpecCapabilities.capabilities.View,
    SpecCapabilities.capabilities.Create,
    SpecCapabilities.capabilities.Manage,
  ],
  admin: [
    SpecCapabilities.capabilities.View,
    SpecCapabilities.capabilities.Create,
    SpecCapabilities.capabilities.Manage,
  ],
} as const;

async function protectedApp(
  assignments: RuntimeAuthorizationConfig['assignments'],
  store = new InMemoryAuthenticationStore(),
) {
  const config = passwordConfig();
  const app = Fastify();

  await app.register(cookie);
  registerAuthorizationRequestContext(app, {
    authentication: config.authentication,
    authorization: createRuntimeAuthorization({
      config: { assignments },
      resources: [SpecCapabilities],
      roles,
    }),
    store,
    cookieNames: COOKIE_NAMES,
  });
  registerRuntimeErrorHandler(app);

  app.get(
    '/protected',
    {
      preHandler: requireCapability({
        resource: SpecCapabilities,
        capability: SpecCapabilities.capabilities.Manage,
        scope: { specId: 'S1' },
      }),
    },
    () => ({ ok: true }),
  );

  return { app, store };
}

describe('authorization HTTP foundation', () => {
  it('maps a missing effective subject to 401 before the route handler', async () => {
    const { app } = await protectedApp([{ userId: 'demo-user', role: 'developer', scope: {} }]);

    try {
      const response = await app.inject('/protected');
      expect(response.statusCode).toBe(401);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.json()).toEqual({ error: 'authentication_required' });
    } finally {
      await app.close();
    }
  });

  it('does not resolve an async scope before authentication succeeds', async () => {
    const config = passwordConfig();
    const app = Fastify();
    const scopeResolver = vi.fn(() => Promise.resolve({ specId: 'S1' }));

    await app.register(cookie);
    registerAuthorizationRequestContext(app, {
      authentication: config.authentication,
      authorization: createRuntimeAuthorization({
        config: {
          assignments: [{ userId: 'demo-user', role: 'developer', scope: {} }],
        },
        resources: [SpecCapabilities],
        roles,
      }),
      store: new InMemoryAuthenticationStore(),
      cookieNames: COOKIE_NAMES,
    });
    registerRuntimeErrorHandler(app);

    app.get(
      '/dynamic',
      {
        preHandler: requireCapability({
          resource: SpecCapabilities,
          capability: SpecCapabilities.capabilities.Manage,
          scope: scopeResolver,
        }),
      },
      () => ({ ok: true }),
    );

    try {
      const response = await app.inject('/dynamic');
      expect(response.statusCode).toBe(401);
      expect(scopeResolver).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('maps a missing required capability to 403', async () => {
    const { app, store } = await protectedApp([{ userId: 'demo-user', role: 'viewer', scope: {} }]);
    const session = store.createSession({
      userId: 'demo-user',
      authenticatedWith: { kind: 'password' },
    });

    try {
      const response = await app.inject({
        url: '/protected',
        headers: { cookie: `${COOKIE_NAMES.session}=${session}` },
      });
      expect(response.statusCode).toBe(403);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.json()).toEqual({ error: 'forbidden' });
    } finally {
      await app.close();
    }
  });

  it('allows a global assignment to satisfy a more specific required scope', async () => {
    const { app, store } = await protectedApp([
      { userId: 'demo-user', role: 'developer', scope: {} },
    ]);
    const session = store.createSession({
      userId: 'demo-user',
      authenticatedWith: { kind: 'password' },
    });

    try {
      const response = await app.inject({
        url: '/protected',
        headers: { cookie: `${COOKIE_NAMES.session}=${session}` },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ ok: true });
    } finally {
      await app.close();
    }
  });
});

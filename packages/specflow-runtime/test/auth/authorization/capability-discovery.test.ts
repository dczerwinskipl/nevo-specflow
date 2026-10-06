import type { CapabilityDiscoveryResponse } from '@nevo/specflow-contracts/authorization/capability-discovery';
import { describe, expect, it } from 'vitest';

import { InMemoryAuthenticationStore } from '../../../src/features/auth/authentication/store/in-memory-store';
import { authCookieNames } from '../../../src/features/auth/authentication/http/cookies';
import type { RuntimeConfig } from '../../../src/config/types';
import { createRuntimeApp } from '../../../src/server/app';

function baseConfig(): RuntimeConfig {
  return {
    server: { host: '127.0.0.1', port: 4318, tls: { enabled: false } },
    authentication: {
      mode: 'required',
      users: {
        viewer: { name: 'Viewer' },
        developer: { name: 'Developer' },
        scopedViewer: { name: 'Scoped Viewer' },
      },
      providers: {
        password: { enabled: false, accounts: {} },
        oidc: { instances: {} },
      },
    },
    authorization: {
      assignments: [
        { userId: 'viewer', role: 'viewer', scope: {} },
        { userId: 'developer', role: 'developer', scope: { workspaceId: 'W1' } },
        {
          userId: 'scopedViewer',
          role: 'viewer',
          scope: { specId: 'S1' },
        },
      ],
    },
  };
}

const COOKIE_NAMES = authCookieNames(4318);

describe('authorization HTTP API', () => {
  it('requires a subject when auth is required', async () => {
    const app = await createRuntimeApp(baseConfig());
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/authorization/capabilities',
        payload: { resource: { name: 'spec' } },
      });
      expect(response.statusCode).toBe(401);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.json()).toEqual({ error: 'authentication_required' });
    } finally {
      await app.close();
    }
  });

  it('returns a boolean capability projection for the requested resource and scope', async () => {
    const store = new InMemoryAuthenticationStore({ idFactory: () => 'session-id' });
    const session = store.createSession({
      userId: 'developer',
      authenticatedWith: { kind: 'password' },
    });
    const app = await createRuntimeApp(baseConfig(), { auth: { store } });
    try {
      const spec = await app.inject({
        method: 'POST',
        url: '/api/authorization/capabilities',
        headers: { cookie: `${COOKIE_NAMES.session}=${session}` },
        payload: {
          resource: { name: 'spec', scope: { workspaceId: 'W1', specId: 'S1' } },
        },
      });
      expect(spec.json<CapabilityDiscoveryResponse>()).toEqual({
        resource: { name: 'spec', scope: { workspaceId: 'W1', specId: 'S1' } },
        capabilities: { view: true, create: true, manage: true },
      });

      const sessions = await app.inject({
        method: 'POST',
        url: '/api/authorization/capabilities',
        headers: { cookie: `${COOKIE_NAMES.session}=${session}` },
        payload: {
          resource: { name: 'session', scope: { workspaceId: 'W1', specId: 'S1' } },
        },
      });
      expect(sessions.json<CapabilityDiscoveryResponse>().capabilities).toEqual({
        create: true,
        view: true,
        manage: true,
      });

      const otherWorkspace = await app.inject({
        method: 'POST',
        url: '/api/authorization/capabilities',
        headers: { cookie: `${COOKIE_NAMES.session}=${session}` },
        payload: {
          resource: { name: 'spec', scope: { workspaceId: 'W2', specId: 'S1' } },
        },
      });
      expect(otherWorkspace.json<CapabilityDiscoveryResponse>().capabilities).toEqual({
        view: false,
        create: false,
        manage: false,
      });
    } finally {
      await app.close();
    }
  });

  it('does not let item-scoped access satisfy a broader global query', async () => {
    const store = new InMemoryAuthenticationStore({ idFactory: () => 'scoped-session-id' });
    const session = store.createSession({
      userId: 'scopedViewer',
      authenticatedWith: { kind: 'password' },
    });
    const app = await createRuntimeApp(baseConfig(), { auth: { store } });

    try {
      const item = await app.inject({
        method: 'POST',
        url: '/api/authorization/capabilities',
        headers: { cookie: `${COOKIE_NAMES.session}=${session}` },
        payload: {
          resource: { name: 'spec', scope: { specId: 'S1' } },
        },
      });
      expect(item.json<CapabilityDiscoveryResponse>().capabilities).toEqual({
        view: true,
        create: false,
        manage: false,
      });

      const global = await app.inject({
        method: 'POST',
        url: '/api/authorization/capabilities',
        headers: { cookie: `${COOKIE_NAMES.session}=${session}` },
        payload: { resource: { name: 'spec' } },
      });
      expect(global.json<CapabilityDiscoveryResponse>()).toEqual({
        resource: { name: 'spec', scope: {} },
        capabilities: { view: false, create: false, manage: false },
      });
    } finally {
      await app.close();
    }
  });

  it.each([
    ['empty', ''],
    ['whitespace-only', '   '],
  ])('rejects %s scope values at the HTTP boundary', async (_case, scopeValue) => {
    const store = new InMemoryAuthenticationStore({ idFactory: () => 'scope-value-session-id' });
    const session = store.createSession({
      userId: 'developer',
      authenticatedWith: { kind: 'password' },
    });
    const app = await createRuntimeApp(baseConfig(), { auth: { store } });

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/authorization/capabilities',
        headers: { cookie: `${COOKIE_NAMES.session}=${session}` },
        payload: {
          resource: {
            name: 'spec',
            scope: { specId: scopeValue },
          },
        },
      });

      expect(response.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('rejects unsafe scope dimension names at the HTTP boundary', async () => {
    const store = new InMemoryAuthenticationStore({ idFactory: () => 'scope-session-id' });
    const session = store.createSession({
      userId: 'developer',
      authenticatedWith: { kind: 'password' },
    });
    const app = await createRuntimeApp(baseConfig(), { auth: { store } });
    const prototypeSensitiveKey = ['__', 'proto__'].join('');

    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/authorization/capabilities',
        headers: { cookie: `${COOKIE_NAMES.session}=${session}` },
        payload: {
          resource: {
            name: 'spec',
            scope: Object.fromEntries([[prototypeSensitiveKey, 'value']]),
          },
        },
      });

      expect(response.statusCode).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('uses localUserId as effective subject in none mode', async () => {
    const config = baseConfig();
    const app = await createRuntimeApp({
      ...config,
      authentication: { ...config.authentication, mode: 'none', localUserId: 'viewer' },
    });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/authorization/capabilities',
        payload: { resource: { name: 'spec' } },
      });
      expect(response.json<CapabilityDiscoveryResponse>().capabilities).toEqual({
        view: true,
        create: false,
        manage: false,
      });
    } finally {
      await app.close();
    }
  });

  it('returns all resource capabilities as true when access control is disabled', async () => {
    const config = baseConfig();
    const app = await createRuntimeApp({
      ...config,
      authentication: { ...config.authentication, mode: 'none' },
      authorization: { assignments: [] },
    });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/authorization/capabilities',
        payload: { resource: { name: 'spec', scope: { specId: 'S1' } } },
      });
      expect(response.json<CapabilityDiscoveryResponse>().capabilities).toEqual({
        view: true,
        create: true,
        manage: true,
      });
    } finally {
      await app.close();
    }
  });
});

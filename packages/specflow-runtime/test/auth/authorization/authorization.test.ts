import type { AuthorizationCapabilitiesResponse } from '@nevo/specflow-contracts/authorization';
import { describe, expect, it } from 'vitest';

import { InMemoryAuthStore } from '../../../src/auth/authentication/session/store';
import { authCookieNames } from '../../../src/auth/http/cookies';
import type { RuntimeConfig } from '../../../src/config/types';
import { createRuntimeApp } from '../../../src/server/app';

function baseConfig(): RuntimeConfig {
  return {
    server: { host: '127.0.0.1', port: 4318, tls: { enabled: false } },
    auth: {
      mode: 'required',
      users: {
        viewer: { name: 'Viewer' },
        developer: { name: 'Developer' },
        scopedViewer: { name: 'Scoped Viewer' },
      },
      providers: {
        password: { enabled: false, accounts: {} },
        oidc: { enabled: false, allowedEmails: {} },
      },
    },
    authorization: {
      assignments: [
        { userId: 'viewer', role: 'viewer', scope: { projectId: 'P1' } },
        { userId: 'developer', role: 'developer', scope: { projectId: 'P1' } },
        {
          userId: 'scopedViewer',
          role: 'viewer',
          scope: { projectId: 'P1', specId: 'S1' },
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
        payload: { resource: { name: 'spec', scope: { projectId: 'P1' } } },
      });
      expect(response.statusCode).toBe(401);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.json()).toEqual({ error: 'authentication_required' });
    } finally {
      await app.close();
    }
  });

  it('resolves only capabilities for the requested resource and matching scope', async () => {
    const store = new InMemoryAuthStore({ idFactory: () => 'session-id' });
    const session = store.createSession({ userId: 'developer', provider: 'password' });
    const app = await createRuntimeApp(baseConfig(), { auth: { store } });
    try {
      const spec = await app.inject({
        method: 'POST',
        url: '/api/authorization/capabilities',
        headers: { cookie: `${COOKIE_NAMES.session}=${session}` },
        payload: {
          resource: { name: 'spec', scope: { projectId: 'P1', specId: 'S1' } },
        },
      });
      expect(spec.json<AuthorizationCapabilitiesResponse>().capabilities).toEqual([
        'spec.view',
        'spec.create',
        'spec.manage',
      ]);

      const sessions = await app.inject({
        method: 'POST',
        url: '/api/authorization/capabilities',
        headers: { cookie: `${COOKIE_NAMES.session}=${session}` },
        payload: {
          resource: { name: 'session', scope: { projectId: 'P1', specId: 'S1' } },
        },
      });
      expect(sessions.json<AuthorizationCapabilitiesResponse>().capabilities).toEqual([
        'session.view',
        'session.create',
        'session.manage',
      ]);

      const otherProject = await app.inject({
        method: 'POST',
        url: '/api/authorization/capabilities',
        headers: { cookie: `${COOKIE_NAMES.session}=${session}` },
        payload: {
          resource: { name: 'spec', scope: { projectId: 'P2', specId: 'S1' } },
        },
      });
      expect(otherProject.json<AuthorizationCapabilitiesResponse>().capabilities).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('keeps item-scoped view access without requiring a collection-level list capability', async () => {
    const store = new InMemoryAuthStore({ idFactory: () => 'scoped-session-id' });
    const session = store.createSession({ userId: 'scopedViewer', provider: 'password' });
    const app = await createRuntimeApp(baseConfig(), { auth: { store } });

    try {
      const item = await app.inject({
        method: 'POST',
        url: '/api/authorization/capabilities',
        headers: { cookie: `${COOKIE_NAMES.session}=${session}` },
        payload: {
          resource: { name: 'spec', scope: { projectId: 'P1', specId: 'S1' } },
        },
      });
      expect(item.json<AuthorizationCapabilitiesResponse>().capabilities).toEqual(['spec.view']);

      const project = await app.inject({
        method: 'POST',
        url: '/api/authorization/capabilities',
        headers: { cookie: `${COOKIE_NAMES.session}=${session}` },
        payload: {
          resource: { name: 'spec', scope: { projectId: 'P1' } },
        },
      });
      expect(project.json<AuthorizationCapabilitiesResponse>().capabilities).toEqual([]);
    } finally {
      await app.close();
    }
  });

  it('uses localUserId as effective subject in none mode', async () => {
    const config = baseConfig();
    const app = await createRuntimeApp({
      ...config,
      auth: { ...config.auth, mode: 'none', localUserId: 'viewer' },
    });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/authorization/capabilities',
        payload: { resource: { name: 'spec', scope: { projectId: 'P1' } } },
      });
      expect(response.json<AuthorizationCapabilitiesResponse>().capabilities).toEqual([
        'spec.view',
      ]);
    } finally {
      await app.close();
    }
  });

  it('returns all resource capabilities when access control is disabled', async () => {
    const config = baseConfig();
    const app = await createRuntimeApp({
      ...config,
      auth: { ...config.auth, mode: 'none' },
      authorization: { assignments: [] },
    });
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/authorization/capabilities',
        payload: { resource: { name: 'spec', scope: { projectId: 'P1' } } },
      });
      expect(response.json<AuthorizationCapabilitiesResponse>().capabilities).toEqual([
        'spec.view',
        'spec.create',
        'spec.manage',
      ]);
    } finally {
      await app.close();
    }
  });
});

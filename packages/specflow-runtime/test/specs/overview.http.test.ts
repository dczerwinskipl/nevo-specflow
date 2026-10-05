import { describe, expect, it, vi } from 'vitest';
import { setTimeout as delay } from 'node:timers/promises';
import type { SpecsOverviewProjection } from '@nevo/specflow-contracts/specs-overview';
import { createRuntimeApp } from '../../src/server/app';
import { InMemoryAuthStore } from '../../src/auth/authentication/session/store';
import { authCookieNames } from '../../src/auth/http/cookies';
import { passwordConfig } from '../auth/support/config';
import { cookieValue } from '../auth/support/http';
import { SAMPLE_PROJECT_ID } from '../../src/specs/overview/sample';

vi.mock('node:timers/promises', () => ({ setTimeout: vi.fn(() => Promise.resolve()) }));

describe('Specs overview HTTP integration', () => {
  it('retains trusted-local disabled access semantics', async () => {
    const config = passwordConfig();
    const app = await createRuntimeApp({ ...config, auth: { ...config.auth, mode: 'none' } });
    try {
      const response = await app.inject('/api/specs/overview');
      expect(response.statusCode).toBe(200);
      expect(delay).toHaveBeenLastCalledWith(200);
      expect(response.json<SpecsOverviewProjection>().items).toHaveLength(6);
      expect(response.json<SpecsOverviewProjection>().groups.map((group) => group.id)).toEqual([
        'requires-attention',
        'active',
        'ready',
        'draft',
      ]);
    } finally {
      await app.close();
    }
  });
  it('uses real password login and revokes list access on logout', async () => {
    const config = passwordConfig();
    const app = await createRuntimeApp({
      ...config,
      authorization: {
        assignments: [
          { userId: 'demo-user', role: 'viewer', scope: { projectId: SAMPLE_PROJECT_ID } },
        ],
      },
    });
    try {
      const anonymous = await app.inject('/api/specs/overview');
      expect(anonymous.statusCode).toBe(401);
      expect(anonymous.json()).toEqual({ error: 'authentication_required' });
      const login = await app.inject({
        method: 'POST',
        url: '/api/auth/password/login',
        payload: { username: 'demo', password: 'correct horse battery staple' },
      });
      expect(login.statusCode).toBe(200);
      const name = authCookieNames(config.server.port).session;
      const cookie = `${name}=${cookieValue(login.headers['set-cookie'], name)}`;
      const headers = { cookie };
      const active = await app.inject({ url: '/api/specs/overview?collection=active', headers });
      expect(active.statusCode).toBe(200);
      expect(active.headers['cache-control']).toBe('no-store');
      expect(active.json<SpecsOverviewProjection>()).toMatchObject({
        collection: 'active',
        sample: true,
      });
      expect(active.json<SpecsOverviewProjection>().items).toHaveLength(6);
      const archive = await app.inject({ url: '/api/specs/overview?collection=archive', headers });
      expect(archive.json<SpecsOverviewProjection>().collection).toBe('archive');
      expect(archive.json<SpecsOverviewProjection>().items[0]?.id).toBe('archived-shell');
      await app.inject({ method: 'POST', url: '/api/auth/logout', headers });
      expect((await app.inject({ url: '/api/specs/overview', headers })).statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it('filters by server-owned per-item scope and rejects client-supplied project scopes', async () => {
    const config = passwordConfig();
    const store = new InMemoryAuthStore();
    const session = store.createSession({
      userId: 'demo-user',
      authenticatedWith: { kind: 'password' },
    });
    const app = await createRuntimeApp(
      {
        ...config,
        authorization: {
          assignments: [
            {
              userId: 'demo-user',
              role: 'viewer',
              scope: { projectId: SAMPLE_PROJECT_ID, specId: 'security' },
            },
          ],
        },
      },
      { auth: { store } },
    );
    const headers = { cookie: `${authCookieNames(config.server.port).session}=${session}` };
    try {
      const response = await app.inject({ url: '/api/specs/overview', headers });
      expect(response.json<SpecsOverviewProjection>().items.map((item) => item.id)).toEqual([
        'security',
      ]);
      expect(
        (await app.inject({ url: '/api/specs/overview?projectId=other', headers })).statusCode,
      ).toBe(400);
      expect(
        (await app.inject({ url: '/api/specs/overview?collection=wrong', headers })).statusCode,
      ).toBe(400);
    } finally {
      await app.close();
    }
  });

  it('does not grant an authenticated user without view permission access to sample rows', async () => {
    const config = passwordConfig();
    const store = new InMemoryAuthStore();
    const session = store.createSession({
      userId: 'demo-user',
      authenticatedWith: { kind: 'password' },
    });
    const app = await createRuntimeApp(config, { auth: { store } });
    try {
      const response = await app.inject({
        url: '/api/specs/overview',
        headers: {
          cookie: `${authCookieNames(config.server.port).session}=${session}`,
        },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json<SpecsOverviewProjection>().items).toEqual([]);
    } finally {
      await app.close();
    }
  });
});

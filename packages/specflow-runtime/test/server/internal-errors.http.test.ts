import type { SpecFlowEngine } from '@nevo/specflow-engine';
import type { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { authCookieNames } from '../../src/features/auth/authentication/http/cookies';
import { InMemoryAuthenticationStore } from '../../src/features/auth/authentication/store/in-memory-store';
import { createRuntimeApp } from '../../src/server/app';
import { INTERNAL_ERROR_CODE, registerRuntimeErrorHandler } from '../../src/server/error-handler';
import { passwordConfig } from '../auth/support/config';

const SECRET_PATH = 'C:\Users\secret\proj\.nevo\local\state\engine\operations\create\x.json';
const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

function eacces(): Error {
  return Object.assign(new Error(`EACCES: permission denied, open '${SECRET_PATH}'`), {
    code: 'EACCES',
    errno: -13,
    syscall: 'open',
    path: SECRET_PATH,
  });
}

function expectGeneric(body: string): void {
  expect(JSON.parse(body)).toEqual({ error: INTERNAL_ERROR_CODE, code: INTERNAL_ERROR_CODE });
  for (const leak of ['EACCES', 'secret', 'Users', '.nevo', 'permission denied', 'at ']) {
    expect(body).not.toContain(leak);
  }
}

describe('Runtime error handler', () => {
  it('answers a generic 500 for an untyped error and keeps 4xx errors', async () => {
    const app = Fastify({ logger: false });
    apps.push(app);
    registerRuntimeErrorHandler(app);
    app.get('/boom', () => {
      throw eacces();
    });
    app.get('/bad', () => {
      throw Object.assign(new Error('nope'), { statusCode: 400 });
    });
    await app.ready();

    const boom = await app.inject({ method: 'GET', url: '/boom' });
    expect(boom.statusCode).toBe(500);
    expectGeneric(boom.body);

    const bad = await app.inject({ method: 'GET', url: '/bad' });
    expect(bad.statusCode).toBe(400);
  });
});

describe('untyped Engine failures on the Create routes', () => {
  async function server() {
    // Any access to the Engine fails like a filesystem error would.
    const engine = new Proxy(
      {},
      {
        get() {
          throw eacces();
        },
      },
    ) as unknown as SpecFlowEngine;
    const store = new InMemoryAuthenticationStore();
    const session = store.createSession({
      userId: 'demo-user',
      authenticatedWith: { kind: 'password' },
    });
    const headers = {
      cookie: authCookieNames(passwordConfig().server.port).session + '=' + session,
    };
    const app = await createRuntimeApp(
      {
        ...passwordConfig(),
        authorization: { assignments: [{ userId: 'demo-user', role: 'developer', scope: {} }] },
      },
      { auth: { store }, specs: { engine } },
    );
    apps.push(app);
    await app.ready();
    return { app, headers };
  }

  it.each([
    ['GET', '/api/specs/create-options', undefined],
    ['GET', '/api/specs/create/operations/6f1d2c34-5b6a-4c7d-8e9f-0a1b2c3d4e5f', undefined],
    ['POST', '/api/specs', { title: 'T', goal: 'G' }],
  ] as const)('%s %s masks the cause', async (method, url, payload) => {
    const { app, headers } = await server();
    const response = await app.inject({
      method,
      url,
      headers,
      ...(payload ? { payload } : {}),
    });
    expect(response.statusCode).toBe(500);
    expectGeneric(response.body);
  });
});

import { describe, expect, it } from 'vitest';

import type { RuntimeWebApp } from '../../src/server/web-app';
import { createRuntimeApp } from '../../src/server/app';
import { oidcConfig, passwordConfig } from '../auth/support/config';

function webApp(): RuntimeWebApp {
  return {
    indexHtml: {
      body: Buffer.from('<!doctype html><html><body><div id="root"></div></body></html>'),
      contentType: 'text/html; charset=utf-8',
    },
    assets: new Map([
      [
        '/assets/app.js',
        {
          body: Buffer.from('console.log("specflow")'),
          contentType: 'text/javascript; charset=utf-8',
        },
      ],
    ]),
  };
}

const diagnostic = {
  service: 'Nevo SpecFlow Runtime API',
  status: 'ok',
  message: 'This address serves the Runtime API, not the SpecFlow web UI.',
};

describe('Runtime product web surface', () => {
  it('serves the web app at root and client routes while preserving API routes', async () => {
    const app = await createRuntimeApp(oidcConfig({ 'demo@example.com': 'demo-user' }), {
      webApp: webApp(),
    });

    try {
      const root = await app.inject({ method: 'GET', url: '/' });
      expect(root.statusCode).toBe(200);
      expect(root.headers['content-type']).toMatch(/text\/html/u);
      expect(root.body).toContain('<div id="root"></div>');

      const asset = await app.inject({ method: 'GET', url: '/assets/app.js' });
      expect(asset.statusCode).toBe(200);
      expect(asset.headers['content-type']).toMatch(/text\/javascript/u);
      expect(asset.body).toContain('specflow');

      const clientRoute = await app.inject({ method: 'GET', url: '/login?returnTo=%2F' });
      expect(clientRoute.statusCode).toBe(200);
      expect(clientRoute.body).toContain('<div id="root"></div>');

      const session = await app.inject({ method: 'GET', url: '/api/auth/session' });
      expect(session.statusCode).toBe(200);

      const unknownApi = await app.inject({ method: 'GET', url: '/api/unknown' });
      expect(unknownApi.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('keeps the API diagnostic root when the request already uses the canonical public host', async () => {
    const configured = oidcConfig({ 'demo@example.com': 'demo-user' });
    const app = await createRuntimeApp({
      ...configured,
      server: {
        ...configured.server,
        host: '0.0.0.0',
        publicOrigin: 'https://specflow.example.com:4318',
      },
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/',
        headers: { host: 'specflow.example.com:4318' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(diagnostic);
    } finally {
      await app.close();
    }
  });

  it('redirects API-only root once when reached through a non-canonical address', async () => {
    const configured = oidcConfig({ 'demo@example.com': 'demo-user' });
    const app = await createRuntimeApp({
      ...configured,
      server: {
        ...configured.server,
        host: '0.0.0.0',
        publicOrigin: 'https://specflow.example.com:4318',
      },
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/',
        headers: {
          host: '192.168.1.10:4318',
          'x-forwarded-host': 'specflow.example.com:4318',
          'x-forwarded-proto': 'https',
        },
      });
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('https://specflow.example.com:4318');
    } finally {
      await app.close();
    }
  });

  it('keeps equivalent loopback aliases on the API diagnostic root', async () => {
    const configured = oidcConfig({ 'demo@example.com': 'demo-user' });
    const app = await createRuntimeApp({
      ...configured,
      server: {
        host: '127.0.0.1',
        port: 4318,
        publicOrigin: 'http://localhost:4318',
        tls: { enabled: false },
      },
    });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/',
        headers: { host: '127.0.0.1:4318' },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(diagnostic);
    } finally {
      await app.close();
    }
  });

  it('keeps the API diagnostic root when publicOrigin is absent', async () => {
    const app = await createRuntimeApp(passwordConfig());

    try {
      const response = await app.inject({ method: 'GET', url: '/' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(diagnostic);
    } finally {
      await app.close();
    }
  });
});

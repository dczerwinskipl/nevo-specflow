import { describe, expect, it } from 'vitest';

import type { RuntimeWebApp } from '../../src/server/web-app';
import { createRuntimeApp } from '../../src/server/app';
import { oidcConfig } from '../auth/support/config';

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

describe('Runtime product web surface', () => {
  it('serves the web app at root and preserves API routes on the same origin', async () => {
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

  it('keeps the API-only diagnostic root when no web app is composed', async () => {
    const config = oidcConfig({ 'demo@example.com': 'demo-user' });
    const app = await createRuntimeApp(config);

    try {
      const response = await app.inject({ method: 'GET', url: '/' });
      expect(response.statusCode).toBe(302);
      expect(response.headers.location).toBe('https://specflow.example.test:4318');
    } finally {
      await app.close();
    }
  });
});

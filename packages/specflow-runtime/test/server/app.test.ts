import { brotliDecompressSync, gunzipSync } from 'node:zlib';

import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import type { RuntimeConfig } from '../../src/config/types';
import type { RuntimeWebApp } from '../../src/server/web-app';
import {
  configureRuntimeApp,
  createRuntimeApp,
  RUNTIME_FASTIFY_OPTIONS,
} from '../../src/server/app';
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

  it('compresses only built UI files and caches only content-hashed assets', async () => {
    const script = `console.log(${JSON.stringify('specflow '.repeat(400))});`;
    const html = `<!doctype html><html><body>${'specflow '.repeat(400)}</body></html>`;
    const app = await createRuntimeApp(oidcConfig({ 'demo@example.com': 'demo-user' }), {
      webApp: {
        indexHtml: { body: Buffer.from(html), contentType: 'text/html; charset=utf-8' },
        assets: new Map([
          [
            '/assets/app-a1b2c3d4.js',
            { body: Buffer.from(script), contentType: 'text/javascript; charset=utf-8' },
          ],
          [
            '/assets/legacy.js',
            { body: Buffer.from(script), contentType: 'text/javascript; charset=utf-8' },
          ],
        ]),
      },
    });

    try {
      const brotli = await app.inject({
        method: 'GET',
        url: '/assets/app-a1b2c3d4.js',
        headers: { 'accept-encoding': 'gzip, br' },
      });
      expect(brotli.statusCode).toBe(200);
      expect(brotli.headers['content-encoding']).toBe('br');
      expect(brotli.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(brotli.headers.vary).toContain('Accept-Encoding');
      expect(brotliDecompressSync(brotli.rawPayload).toString()).toBe(script);

      const gzip = await app.inject({
        method: 'GET',
        url: '/assets/app-a1b2c3d4.js',
        headers: { 'accept-encoding': 'br;q=0, gzip' },
      });
      expect(gzip.headers['content-encoding']).toBe('gzip');
      expect(gunzipSync(gzip.rawPayload).toString()).toBe(script);

      const plain = await app.inject({ method: 'GET', url: '/assets/app-a1b2c3d4.js' });
      expect(plain.headers['content-encoding']).toBeUndefined();
      expect(plain.headers.vary).toContain('Accept-Encoding');
      expect(plain.body).toBe(script);

      const unhashed = await app.inject({ method: 'GET', url: '/assets/legacy.js' });
      expect(unhashed.headers['cache-control']).toBe('no-cache');

      const missing = await app.inject({ method: 'GET', url: '/assets/missing.js' });
      expect(missing.statusCode).toBe(404);
      expect(missing.headers['content-type']).toMatch(/application\/json/u);

      const index = await app.inject({
        method: 'GET',
        url: '/docs',
        headers: { 'accept-encoding': 'br' },
      });
      expect(index.headers['cache-control']).toBe('no-cache');
      expect(index.headers['content-encoding']).toBe('br');
      expect(brotliDecompressSync(index.rawPayload).toString()).toBe(html);

      const api = await app.inject({
        method: 'GET',
        url: '/api/runtime/info',
        headers: { 'accept-encoding': 'br' },
      });
      expect(api.statusCode).toBe(200);
      expect(api.headers['content-encoding']).toBeUndefined();
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

  it('keeps the API diagnostic root for canonical HTTP/2 authority without Host', async () => {
    const configured = oidcConfig({ 'demo@example.com': 'demo-user' });
    const config: RuntimeConfig = {
      ...configured,
      server: {
        ...configured.server,
        host: '0.0.0.0',
        publicOrigin: 'https://specflow.example.com:4318',
      },
    };
    const app = Fastify(RUNTIME_FASTIFY_OPTIONS);

    app.addHook('onRequest', (request, _reply, done) => {
      delete request.raw.headers.host;
      request.raw.headers[':authority'] = 'specflow.example.com:4318';
      done();
    });
    await configureRuntimeApp(app, config);

    try {
      const response = await app.inject({ method: 'GET', url: '/' });
      expect(response.statusCode).toBe(200);
      expect(response.headers.location).toBeUndefined();
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

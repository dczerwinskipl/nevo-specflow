import { describe, expect, it } from 'vitest';
import type { RuntimeConfig } from '../config/types';
import { noAuthConfig, passwordConfig } from '../../test/auth/support/config';
import { createRuntimeApp, type RuntimeAppDependencies } from './app';
import { generateOpenApiDocument, openApiRouteGaps } from './openapi';

async function withApp<T>(
  config: RuntimeConfig,
  dependencies: RuntimeAppDependencies,
  run: (app: Awaited<ReturnType<typeof createRuntimeApp>>) => Promise<T>,
): Promise<T> {
  const app = await createRuntimeApp(config, dependencies);
  try {
    return await run(app);
  } finally {
    await app.close();
  }
}

describe('Runtime OpenAPI document', () => {
  it('serves the generated document of the project-mode API surface in trusted local mode', async () => {
    await withApp(noAuthConfig(), {}, async (app) => {
      const generated = await generateOpenApiDocument(app);
      const response = await app.inject('/api/openapi.json');

      expect(response.statusCode).toBe(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers['x-ratelimit-limit']).toBe('300');
      expect(response.json()).toEqual(generated);
      expect(generated.openapi).toBe('3.1.0');

      const paths = generated.paths as Record<string, Record<string, unknown>>;
      expect(Object.keys(paths).every((path) => path.startsWith('/api/'))).toBe(true);
      expect(paths['/api/runtime/info']?.get).toMatchObject({
        responses: { 200: { content: { 'application/json': { schema: { type: 'object' } } } } },
      });
      expect(paths['/api/openapi.json']?.get).toBeDefined();
      expect(paths['/api/openapi.json']?.head).toBeUndefined();
      const documentRead = paths['/api/specs/{specId}/documents/{documentId}']?.get as {
        parameters: readonly { in: string; name: string; required?: boolean }[];
      };
      expect(documentRead.parameters).toContainEqual(
        expect.objectContaining({ in: 'path', name: 'specId', required: true }),
      );
      expect(JSON.stringify(await generateOpenApiDocument(app))).toBe(JSON.stringify(generated));
      expect(openApiRouteGaps(app).every((gap) => gap.url.startsWith('/api/'))).toBe(true);
    });
  });

  it('rejects an unauthenticated request under required authentication like other reads', async () => {
    await withApp(passwordConfig(), {}, async (app) => {
      const document = await app.inject('/api/openapi.json');
      const read = await app.inject('/api/specs/any/documents/overview');

      expect(document.statusCode).toBe(401);
      expect(document.statusCode).toBe(read.statusCode);
      expect(document.json()).toEqual(read.json());
    });
  });

  it('hides demo seams and web application routes', async () => {
    await withApp(noAuthConfig(), { dataMode: 'demo' }, async (app) => {
      app.get('/assets/app.js', () => '');
      const paths = Object.keys((await generateOpenApiDocument(app)).paths as object);

      expect(paths.length).toBeGreaterThan(0);
      expect(paths.some((path) => path.startsWith('/api/demo/'))).toBe(false);
      expect(paths).not.toContain('/');
      expect(paths).not.toContain('/assets/app.js');
    });
  });
});

import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import { RequestErrorResponseSchema } from '@nevo/specflow-contracts/runtime';
import { createRuntimeApp } from '../../src/server/app';
import { generateOpenApiDocument } from '../../src/server/openapi';
import { oidcConfig, passwordConfig } from '../auth/support/config';

type Paths = Record<
  string,
  Record<string, { responses: Record<string, { content?: Record<string, { schema: unknown }> }> }>
>;

const REQUEST_ERROR = { $ref: '#/components/schemas/RequestErrorResponse' };

describe('Runtime request validation', () => {
  it('answers a request that fails its route schema with the documented Fastify error body', async () => {
    const base = passwordConfig();
    const config = { ...base, authentication: { ...base.authentication, mode: 'none' as const } };
    const app = await createRuntimeApp(config, {});
    const demo = await createRuntimeApp(config, { dataMode: 'demo' });
    try {
      const paths = (await generateOpenApiDocument(app)).paths as Paths;
      // One route per validated part: path parameter, query and body.
      for (const [method, path, url, payload] of [
        ['GET', '/api/specs/{specId}/workspace', '/api/specs/not%20an%20id/workspace', undefined],
        ['GET', '/api/specs/overview', '/api/specs/overview?unknown=1', undefined],
        ['POST', '/api/authorization/capabilities', '/api/authorization/capabilities', {}],
      ] as const) {
        const response = await app.inject({ method, url, ...(payload ? { payload } : {}) });

        expect(response.statusCode, url).toBe(400);
        expect(Value.Check(RequestErrorResponseSchema, response.json()), url).toBe(true);
        expect(response.json<{ code: string }>().code, url).toBe('FST_ERR_VALIDATION');
        expect(
          paths[path]![method.toLowerCase()]!.responses[400]?.content?.['application/json']?.schema,
          url,
        ).toEqual(REQUEST_ERROR);
      }

      // The Session error handling answers its own validation failures, also in demo mode where
      // the Session reads document no Session errors.
      const demoPaths = (await generateOpenApiDocument(demo)).paths as Paths;
      expect(demoPaths['/api/sessions/{sessionId}']!.get!.responses[400]).toBeUndefined();
      expect((await demo.inject('/api/sessions/not-a-session')).json()).toMatchObject({
        error: 'session_error',
        code: 'SESSION_INPUT_INVALID',
      });
    } finally {
      await Promise.all([app.close(), demo.close()]);
    }
  });

  it('answers an invalid OIDC start body with a 400 its own response contract describes', async () => {
    const app = await createRuntimeApp(oidcConfig({}), {});
    try {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/oidc/company/start',
        payload: { returnTo: 5 },
      });
      const documented = ((await generateOpenApiDocument(app)).paths as Paths)[
        '/api/auth/oidc/company/start'
      ]!.post!.responses[400]?.content?.['application/json']?.schema as { anyOf?: unknown[] };

      expect(response.statusCode).toBe(400);
      expect(Value.Check(RequestErrorResponseSchema, response.json())).toBe(true);
      expect(response.json<{ code: string }>().code).toBe('FST_ERR_VALIDATION');
      // Only the four fields of the contract, as on any other route.
      expect(Object.keys(response.json()).sort()).toEqual([
        'code',
        'error',
        'message',
        'statusCode',
      ]);
      expect(documented?.anyOf).toContainEqual(REQUEST_ERROR);
      // The route's own refusal keeps its body.
      const own = await app.inject({
        method: 'POST',
        url: '/api/auth/oidc/company/start',
        payload: { returnTo: 'https://elsewhere.example/' },
      });
      expect(own.statusCode).toBe(400);
      expect(own.json()).toEqual({ error: 'invalid_return_to' });
    } finally {
      await app.close();
    }
  });
});

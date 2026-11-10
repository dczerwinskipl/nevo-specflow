import { Value } from 'typebox/value';
import { describe, expect, it } from 'vitest';
import { RequestErrorResponseSchema } from '@nevo/specflow-contracts/runtime';
import { createRuntimeApp } from '../../src/server/app';
import { generateOpenApiDocument } from '../../src/server/openapi';
import { passwordConfig } from '../auth/support/config';

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
});

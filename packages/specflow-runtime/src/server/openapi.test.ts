import Fastify from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { Static } from 'typebox';
import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  AuthSessionResponseSchema,
  PasswordLoginErrorResponseSchema,
  type AuthSessionResponse,
} from '@nevo/specflow-contracts/authentication';
import type { RuntimeConfig } from '../config/types';
import { noAuthConfig, oidcConfig, passwordConfig } from '../../test/auth/support/config';
import { createRuntimeApp, type RuntimeAppDependencies } from './app';
import {
  generateOpenApiDocument,
  openApiRouteGaps,
  registerOpenApi,
  type RuntimeOpenApiDocument,
} from './openapi';
import { contractRef, registerSharedContracts } from './shared-contracts';

interface Operation {
  responses: Record<
    string,
    {
      headers?: Record<string, unknown>;
      content?: Record<string, { schema: Record<string, unknown> }>;
    }
  >;
}

function operation(document: RuntimeOpenApiDocument, path: string, method: string): Operation {
  const operations = (document.paths as Record<string, Record<string, Operation>>)[path];
  const found = operations?.[method];
  if (!found) {
    throw new Error(`No ${method} ${path} in the document.`);
  }

  return found;
}

function jsonSchema(
  document: RuntimeOpenApiDocument,
  path: string,
  method: string,
  status: string,
) {
  return operation(document, path, method).responses[status]?.content?.['application/json']?.schema;
}

/** Every `$ref` value in the document. */
function references(node: unknown, found: string[] = []): string[] {
  if (Array.isArray(node)) {
    node.forEach((item) => references(item, found));
  } else if (typeof node === 'object' && node !== null) {
    for (const [key, value] of Object.entries(node)) {
      if (key === '$ref' && typeof value === 'string') {
        found.push(value);
      } else {
        references(value, found);
      }
    }
  }

  return found;
}

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
      expect(openApiRouteGaps(app)).toEqual([]);
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

  it('emits a shared contract once and references it from every operation answering it', async () => {
    await withApp(passwordConfig(), {}, async (app) => {
      const document = await generateOpenApiDocument(app);
      const components = (document.components as { schemas: Record<string, unknown> }).schemas;
      const shared = { $ref: '#/components/schemas/AuthSessionResponse' };

      expect(jsonSchema(document, '/api/auth/session', 'get', '200')).toEqual(shared);
      expect(jsonSchema(document, '/api/auth/password/login', 'post', '200')).toEqual(shared);
      expect(components.AuthSessionResponse).toMatchObject({ anyOf: [{}, {}] });
      // The component name is the contract's own `$id`, not a positional `def-N`.
      expect(Object.keys(components).sort()).toEqual(Object.keys(app.getSchemas()).sort());
      const refs = references(document.paths);
      for (const name of Object.keys(components)) {
        expect(refs).toContain(`#/components/schemas/${name}`);
      }

      for (const ref of references(document)) {
        expect(components[ref.replace('#/components/schemas/', '')]).toBeDefined();
      }

      // Separate contracts of the same shape (`{ turnId }`) are not merged into one component.
      for (const path of [
        '/api/sessions/{sessionId}/turns',
        '/api/sessions/{sessionId}/turns/{turnId}/cancel',
      ]) {
        expect(jsonSchema(document, path, 'post', '202')).toMatchObject({ required: ['turnId'] });
      }

      // A contract answered by one operation only stays inline.
      expect(jsonSchema(document, '/api/auth/password/login', 'post', '401')).toMatchObject({
        type: 'object',
      });
    });
  });

  it('keeps the static type of a referenced contract and refuses an unregistered one', async () => {
    const schema = contractRef(AuthSessionResponseSchema);
    expectTypeOf<Static<typeof schema>>().toEqualTypeOf<AuthSessionResponse>();
    expect(() => contractRef(PasswordLoginErrorResponseSchema)).toThrow(
      /registered shared contract/,
    );

    const app = Fastify();
    registerSharedContracts(app);
    const typed = app.withTypeProvider<TypeBoxTypeProvider>();
    const session: AuthSessionResponse = {
      authenticationRequired: false,
      authenticated: false,
      loginMethods: { password: { enabled: false }, oidc: [] },
    };
    typed.get('/typed', { schema: { response: { 200: schema } } }, () => session);
    // @ts-expect-error A reply outside the referenced contract does not type-check.
    typed.get('/untyped', { schema: { response: { 200: schema } } }, () => ({ wrong: true }));
    try {
      const response = await app.inject('/typed');

      expect(response.json()).toEqual(session);
    } finally {
      await app.close();
    }
  });

  it('documents replies without a JSON body from documentation-only route metadata', async () => {
    await withApp(passwordConfig(), {}, async (app) => {
      const document = await generateOpenApiDocument(app);

      const logout = operation(document, '/api/auth/logout', 'post').responses;
      expect(Object.keys(logout)).toEqual(['204']);
      expect(Object.keys(logout[204]?.headers ?? {})).toEqual(['Set-Cookie']);
      expect(logout[204]?.content).toBeUndefined();
      const deletion = operation(document, '/api/sessions/{sessionId}', 'delete').responses;
      expect(Object.keys(deletion)).toEqual(['204']);
      expect(deletion[204]?.content).toBeUndefined();
      const sessionEvents = operation(document, '/api/sessions/{sessionId}/events', 'get');
      expect(Object.keys(sessionEvents.responses)).toEqual(['200']);
      expect(sessionEvents.responses[200]?.content).toEqual({
        'text/event-stream': { schema: { type: 'string' } },
      });
      // Merged with the JSON error responses the route serializes from its schema.
      const operationEvents = operation(
        document,
        '/api/specs/create/operations/{operationId}/events',
        'get',
      );
      expect(Object.keys(operationEvents.responses).sort()).toEqual(['200', '401', '403', '429']);
      expect(Object.keys(operationEvents.responses[200]?.content ?? {})).toEqual([
        'text/event-stream',
      ]);

      // The route itself is unchanged: logout still answers 204 without a body.
      const reply = await app.inject({ method: 'POST', url: '/api/auth/logout' });
      expect(reply.statusCode).toBe(204);
      expect(reply.body).toBe('');
    });

    await withApp(oidcConfig({}), {}, async (app) => {
      const callback = operation(
        await generateOpenApiDocument(app),
        '/api/auth/oidc/company/callback',
        'get',
      );

      expect(Object.keys(callback.responses)).toEqual(['302']);
      expect(Object.keys(callback.responses[302]?.headers ?? {})).toEqual([
        'Location',
        'Set-Cookie',
      ]);
      expect(callback.responses[302]?.content).toBeUndefined();
    });
  });

  it('reports routes without documented responses and refuses a response documented twice', async () => {
    const app = Fastify();
    try {
      await registerOpenApi(app);
      app.get('/api/plain/:id', () => '');
      app.get(
        '/api/stream',
        {
          config: {
            openApiResponses: { 200: { description: 'Stream.', mediaType: 'text/event-stream' } },
          },
        },
        () => '',
      );
      expect(() =>
        app.get(
          '/api/twice',
          {
            config: { openApiResponses: { 204: { description: 'No body.' } } },
            schema: { response: { 204: { type: 'null' } } },
          },
          () => '',
        ),
      ).toThrow(/both with a response schema and in openApiResponses/);
      await app.ready();

      expect(openApiRouteGaps(app)).toEqual([{ method: 'GET', url: '/api/plain/{id}' }]);
    } finally {
      await app.close();
    }
  });
});

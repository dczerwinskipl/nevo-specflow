import swagger from '@fastify/swagger';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance, RawServerBase } from 'fastify';
import { Type, type Static } from 'typebox';

export const OPENAPI_DOCUMENT_PATH = '/api/openapi.json';

/** A route that carries no `response` schema, so its responses are undocumented. */
export interface OpenApiRouteGap {
  readonly method: string;
  readonly url: string;
}

export interface RuntimeOpenApiDocument {
  readonly openapi: string;
  readonly [key: string]: unknown;
}

// The document is generated from route schemas; only its stable top-level shape is declared, the
// rest passes through unchanged.
const OpenApiDocumentResponseSchema = Type.Object(
  {
    openapi: Type.Literal('3.1.0'),
    info: Type.Object({ title: Type.String(), version: Type.String() }),
    paths: Type.Record(Type.String(), Type.Unknown()),
  },
  { additionalProperties: true },
);

const routeGaps = new WeakMap<object, OpenApiRouteGap[]>();

/**
 * The document covers the HTTP API only: web application routes and the `/` fallback are not API,
 * and the demo seams under `/api/demo/` are not part of the specification (A-D3).
 */
function isDocumentedRoute(url: string): boolean {
  return url.startsWith('/api/') && !url.startsWith('/api/demo/');
}

/**
 * Registers OpenAPI generation. It MUST run before any route registration, because only routes
 * registered afterwards are captured.
 */
export async function registerOpenApi<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
): Promise<void> {
  const gaps: OpenApiRouteGap[] = [];
  routeGaps.set(app, gaps);
  app.addHook('onRoute', (route) => {
    // Fastify adds HEAD twins of GET routes; the document lists only the declared methods.
    if (!isDocumentedRoute(route.url) || route.method === 'HEAD') {
      return;
    }

    if (!route.schema?.response) {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      for (const method of methods) {
        gaps.push({ method, url: route.url });
      }
    }
  });
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'Nevo SpecFlow Runtime API', version: '0.0.0' },
    },
    transform: ({ schema, url }) => ({
      schema: isDocumentedRoute(url) ? schema : { ...schema, hide: true },
      url,
    }),
  });
}

/**
 * The OpenAPI document of a configured Runtime app. Readies the app (no listener, no network) and
 * generates the document from the registered route schemas.
 */
export async function generateOpenApiDocument<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
): Promise<RuntimeOpenApiDocument> {
  await app.ready();

  return app.swagger() as RuntimeOpenApiDocument;
}

/** Documented routes without a `response` schema, sorted by URL then method. */
export function openApiRouteGaps<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
): readonly OpenApiRouteGap[] {
  const gaps = routeGaps.get(app);
  if (!gaps) {
    throw new Error('OpenAPI generation is not registered on this Runtime app.');
  }

  return [...gaps].sort(
    (left, right) =>
      left.url.localeCompare(right.url, 'en') || left.method.localeCompare(right.method, 'en'),
  );
}

/** Serves the document as any other authenticated Runtime read (A-D1). */
export function registerOpenApiRoute<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
): void {
  app
    .withTypeProvider<TypeBoxTypeProvider>()
    .get(
      OPENAPI_DOCUMENT_PATH,
      { schema: { response: { 200: OpenApiDocumentResponseSchema } } },
      (request, reply) => {
        request.authz.requireAccess();
        reply.header('Cache-Control', 'no-store');

        return app.swagger() as Static<typeof OpenApiDocumentResponseSchema>;
      },
    );
}

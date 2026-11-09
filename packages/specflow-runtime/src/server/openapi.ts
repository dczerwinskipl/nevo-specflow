import swagger from '@fastify/swagger';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance, FastifySchema, RawServerBase } from 'fastify';
import { Type, type Static } from 'typebox';

export const OPENAPI_DOCUMENT_PATH = '/api/openapi.json';

/**
 * Documentation of a response that Runtime does not serialize from a response schema: a reply
 * without a body (`204`, a redirect) or an event stream written to the raw socket. A response schema
 * on such a route would take part in serialization, so the route declares this documentation in
 * its `config` instead and only the OpenAPI document reads it.
 */
export interface OpenApiDocumentedResponse {
  readonly description: string;
  /** Response headers worth documenting: header name to description. */
  readonly headers?: Readonly<Record<string, string>>;
  /** The media type of the body; absent for a response without a body. */
  readonly mediaType?: 'text/event-stream';
}

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * Documentation-only responses by status code. A status code MUST NOT also have a response
     * schema: a JSON body is documented by its schema.
     */
    readonly openApiResponses?: Readonly<Record<number, OpenApiDocumentedResponse>>;
  }
}

/** A route with neither a `response` schema nor `openApiResponses`: its responses are unknown. */
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

/** The OpenAPI path of a Fastify route URL: `:param` becomes `{param}`, as in the document. */
function openApiPath(url: string): string {
  return url.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}

const COMPONENT_NAME = /^[A-Za-z0-9._-]+$/;

/** The `components.schemas` name of a shared schema: its `$id`, which MUST be a component name. */
function componentName(json: { readonly $id?: unknown }): string {
  if (typeof json.$id !== 'string' || !COMPONENT_NAME.test(json.$id)) {
    throw new Error(`A shared schema $id must be an OpenAPI component name: ${String(json.$id)}`);
  }

  return json.$id;
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
    const documented = route.config?.openApiResponses;
    const schemaStatuses = Object.keys(route.schema?.response ?? {});
    for (const status of Object.keys(documented ?? {})) {
      if (schemaStatuses.includes(status)) {
        throw new Error(
          `Route ${route.url} documents status ${status} both with a response schema and in openApiResponses.`,
        );
      }
    }

    // Fastify adds HEAD twins of GET routes; the document lists only the declared methods.
    if (!isDocumentedRoute(route.url) || route.method === 'HEAD') {
      return;
    }

    if (!route.schema?.response && !documented) {
      const methods = Array.isArray(route.method) ? route.method : [route.method];
      for (const method of methods) {
        gaps.push({ method, url: openApiPath(route.url) });
      }
    }
  });
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'Nevo SpecFlow Runtime API', version: '0.0.0' },
    },
    // A shared contract becomes the component named by its `$id` (the default is a positional
    // `def-N`, which changes whenever a contract is added).
    refResolver: { buildLocalReference: componentName },
    transform: ({ schema, url, route }) => ({
      schema: isDocumentedRoute(url)
        ? withDocumentedResponses(schema, route.config?.openApiResponses)
        : { ...schema, hide: true },
      url,
    }),
  });
}

/**
 * The route schema as the document sees it: the documentation-only responses are added in the form
 * `@fastify/swagger` reads (`type: 'null'` for no body, `content` for a media type, `headers`).
 * Only the document uses the result; the route keeps its own schema for serialization.
 */
function withDocumentedResponses(
  // A route without any schema reaches the transform with `undefined`.
  schema: FastifySchema | undefined,
  documented: Readonly<Record<number, OpenApiDocumentedResponse>> | undefined,
): FastifySchema {
  if (!documented) {
    return schema ?? {};
  }

  const responses = Object.fromEntries(
    Object.entries(documented).map(([status, response]) => [
      status,
      {
        description: response.description,
        ...(response.headers
          ? {
              headers: Object.fromEntries(
                Object.entries(response.headers).map(([name, description]) => [
                  name,
                  { type: 'string', description },
                ]),
              ),
            }
          : {}),
        ...(response.mediaType
          ? { content: { [response.mediaType]: { schema: { type: 'string' } } } }
          : { type: 'null' }),
      },
    ]),
  );

  return { ...schema, response: { ...(schema?.response as object | undefined), ...responses } };
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

/** Documented routes without documented responses, sorted by URL then method. */
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

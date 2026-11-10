import swagger from '@fastify/swagger';
import type { FastifyInstance, RawServerBase } from 'fastify';

import { componentName, withIdentifierReferences } from './components';
import { isDocumentedRoute, openApiOperationId, openApiPath } from './operations';
import { assertDocumentedParameters } from './parameters';
import { unserializableRequestError, type BadRequestSchema } from './request-error-guard';
import { securityComponents, type OpenApiOptions } from './security';
import { assertTagAndSummary, OPENAPI_TAGS } from './tags';
import { createRouteTransform } from './transform';

/** A route with neither a `response` schema nor `openApiResponses`: its responses are unknown. */
export interface OpenApiRouteGap {
  readonly method: string;
  readonly url: string;
}

export interface RuntimeOpenApiDocument {
  readonly openapi: string;
  readonly [key: string]: unknown;
}

const routeGaps = new WeakMap<object, OpenApiRouteGap[]>();

/**
 * Registers OpenAPI generation. It MUST run before any route registration, because only routes
 * registered afterwards are captured.
 */
export async function registerOpenApi<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
  options: OpenApiOptions,
): Promise<void> {
  const gaps: OpenApiRouteGap[] = [];
  routeGaps.set(app, gaps);
  const operationIds = new Map<string, string>();
  const badRequestSchemas: BadRequestSchema[] = [];
  // Checked once every route and shared contract is registered, when `route.config` is final
  // (the Session error handling marks its routes in an `onRoute` hook of its own context).
  app.addHook('onReady', (done) => {
    done(unserializableRequestError(badRequestSchemas, (id) => app.getSchema(id)));
  });
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

    // One operation per route, so the route has one `operationId`.
    if (Array.isArray(route.method)) {
      throw new Error(`Documented route ${route.url} must have one method.`);
    }

    assertTagAndSummary({ method: route.method, url: route.url, schema: route.schema });
    assertDocumentedParameters(route);
    const id = openApiOperationId(route.method, route.url);
    const existing = operationIds.get(id);
    if (existing) {
      throw new Error(
        `Routes ${existing} and ${route.method} ${route.url} have the same operationId ${id}.`,
      );
    }

    operationIds.set(id, `${route.method} ${route.url}`);
    const badRequest = (route.schema?.response as Record<string, unknown> | undefined)?.[400];
    if (badRequest !== undefined) {
      badRequestSchemas.push({ route, schema: badRequest });
    }

    if (!route.schema?.response && !documented) {
      gaps.push({ method: route.method, url: openApiPath(route.url) });
    }
  });
  await app.register(swagger, {
    openapi: {
      openapi: '3.1.0',
      info: { title: 'Nevo SpecFlow Runtime API', version: '0.0.0' },
      tags: OPENAPI_TAGS.map((tag) => ({ ...tag })),
      ...securityComponents(options),
    },
    // A shared contract becomes the component named by its `$id` (the default is a positional
    // `def-N`, which changes whenever a contract is added).
    refResolver: { buildLocalReference: componentName },
    transform: createRouteTransform(options),
    // The document is OpenAPI 3.1 (`openapi` above), never Swagger 2.
    transformObject: (documentObject) =>
      withIdentifierReferences(
        (documentObject as Extract<typeof documentObject, { openapiObject: unknown }>)
          .openapiObject,
      ),
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

import type { FastifySchema } from 'fastify';

import { referenceSharedIdentifiers } from '../shared-contracts';
import type { OpenApiDocumentedParameters, OpenApiDocumentedResponse } from './config';
import { isDocumentedRoute, openApiOperationId } from './operations';
import { withDocumentedParameters } from './parameters';
import {
  hasRequestSchema,
  sharedResponses,
  withDocumentedResponses,
  withRequestErrorNote,
  withSharedResponses,
} from './responses';
import { isSecured, operationSecurity, type OpenApiOptions } from './security';

/** What the transform reads of a route. */
interface TransformedRoute {
  readonly method: unknown;
  readonly url: string;
  readonly config?: {
    readonly openApiPublic?: true;
    readonly openApiOwnValidation?: true;
    readonly openApiResponses?: Readonly<Record<number, OpenApiDocumentedResponse>>;
    readonly openApiParameters?: OpenApiDocumentedParameters;
    readonly rateLimit?: unknown;
  };
}

/**
 * The Swagger `transform`: the route schema as the document sees it. Only the document reads the
 * result; the route keeps its own schema for validation and serialization. A route outside the
 * documented API is hidden.
 */
export function createRouteTransform(options: OpenApiOptions) {
  return ({
    schema,
    url,
    route,
  }: {
    readonly schema: FastifySchema;
    readonly url: string;
    readonly route: TransformedRoute;
  }) => {
    if (!isDocumentedRoute(url)) {
      return { schema: { ...schema, hide: true }, url };
    }

    const secured = isSecured(options, route.config);
    const documented = route.config?.openApiResponses;
    const validated = route.config?.openApiOwnValidation !== true && hasRequestSchema(schema);
    // A route without documented responses keeps the generic `200 Default Response` alone.
    const shared =
      schema?.response || documented
        ? sharedResponses(schema, {
            secured,
            // Every route without a limit of its own is under the default limit; `rateLimit: false`
            // would exempt it (no Runtime route is exempt).
            rateLimited: route.config?.rateLimit !== false,
            validated,
          })
        : {};

    return {
      schema: {
        ...withDocumentedParameters(
          withDocumentedResponses(
            withSharedResponses(
              withRequestErrorNote(
                referenceSharedIdentifiers(schema) as FastifySchema | undefined,
                validated,
              ),
              shared,
            ),
            documented,
          ),
          route.config?.openApiParameters,
        ),
        // A documented route has one method (refused otherwise at registration).
        operationId: openApiOperationId(route.method as string, route.url),
        ...operationSecurity(secured),
      },
      url,
    };
  };
}

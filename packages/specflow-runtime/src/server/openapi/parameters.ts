import type { FastifySchema } from 'fastify';

import type { OpenApiDocumentedParameters, OpenApiParameterLocation } from './config';

/** The route schema key `@fastify/swagger` reads the parameters of a location from. */
const PARAMETER_SCHEMA_KEYS = { header: 'headers', query: 'querystring' } as const;

/** Refuses a documentation-only parameter that the route schema also declares for its location. */
export function assertDocumentedParameters(route: {
  readonly url: string;
  readonly schema?: FastifySchema;
  readonly config?: { readonly openApiParameters?: OpenApiDocumentedParameters };
}): void {
  const parameters = route.config?.openApiParameters ?? {};
  for (const [location, named] of Object.entries(parameters)) {
    const own = route.schema?.[PARAMETER_SCHEMA_KEYS[location as OpenApiParameterLocation]] as
      { readonly properties?: Readonly<Record<string, unknown>> } | undefined;
    // Header names are case-insensitive; query parameter names are not.
    const key = (name: string) => (location === 'header' ? name.toLowerCase() : name);
    const declared = new Set(Object.keys(own?.properties ?? {}).map(key));
    for (const name of Object.keys(named ?? {})) {
      if (declared.has(key(name))) {
        throw new Error(
          `Route ${route.url} documents ${location} ${name} both in its schema and in openApiParameters.`,
        );
      }
    }
  }
}

/**
 * The route schema as the document sees it with the documentation-only parameters: each is an
 * optional string property of the location's schema (`headers`, `querystring`), which
 * `@fastify/swagger` lists as a parameter with its description.
 */
export function withDocumentedParameters(
  schema: FastifySchema,
  parameters: OpenApiDocumentedParameters | undefined,
): FastifySchema {
  let documented = schema;
  for (const [location, named] of Object.entries(parameters ?? {}) as [
    OpenApiParameterLocation,
    Readonly<Record<string, string>>,
  ][]) {
    const key = PARAMETER_SCHEMA_KEYS[location];
    const own = (schema[key] ?? { type: 'object' }) as {
      readonly properties?: Readonly<Record<string, unknown>>;
    };
    documented = {
      ...documented,
      [key]: {
        ...own,
        properties: {
          ...own.properties,
          ...Object.fromEntries(
            Object.entries(named).map(([name, description]) => [
              name,
              { type: 'string', description },
            ]),
          ),
        },
      },
    };
  }

  return documented;
}

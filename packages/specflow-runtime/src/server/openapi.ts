import swagger from '@fastify/swagger';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance, FastifySchema, RawServerBase } from 'fastify';
import { Type, type Static, type TSchema } from 'typebox';
import { Value } from 'typebox/value';

import { AuthenticationRequiredErrorResponseSchema } from '@nevo/specflow-contracts/authorization';
import {
  RateLimitedErrorResponseSchema,
  RequestErrorResponseSchema,
} from '@nevo/specflow-contracts/runtime';

import {
  contractRef,
  referenceIdentifiersInComponents,
  referenceSharedIdentifiers,
} from './shared-contracts';

export const OPENAPI_DOCUMENT_PATH = '/api/openapi.json';

/**
 * Documentation of a response that Runtime does not serialize from a response schema: a reply
 * without a body (`204`, a redirect), an event stream written to the raw socket, or a JSON refusal
 * whose serialization a response schema would change. The route declares this documentation in its
 * `config` instead and only the OpenAPI document reads it.
 */
export type OpenApiDocumentedResponse = {
  readonly description: string;
  /** Response headers worth documenting: header name to description. */
  readonly headers?: Readonly<Record<string, string>>;
} & (
  | {
      /** The media type of the body; absent for a response without a body. */
      readonly mediaType?: 'text/event-stream';
      readonly contract?: never;
    }
  | {
      /**
       * A JSON body: a registered shared contract, documented as its component, or several of them
       * (`anyOf` of their components) when the status answers more than one body.
       */
      readonly contract: TSchema | readonly [TSchema, TSchema, ...TSchema[]];
      readonly mediaType?: never;
    }
);

declare module 'fastify' {
  interface FastifyContextConfig {
    /**
     * Documentation-only responses by status code. A status code MUST NOT also have a response
     * schema: a JSON body is documented by its schema.
     */
    readonly openApiResponses?: Readonly<Record<number, OpenApiDocumentedResponse>>;
    /**
     * The route answers without an authenticated principal: it does not use request authorization
     * (login, logout, the authentication state, the Runtime info). Every other documented route
     * requires access, so the document gives it the session cookie requirement under required
     * authentication.
     */
    readonly openApiPublic?: true;
    /**
     * The route's own error handling answers a request that fails its schema validation, not the
     * Runtime error handling (the Session error handling answers `SESSION_INPUT_INVALID`), so the
     * document does not add Fastify's validation `400` to it. Set by that error handling.
     */
    readonly openApiOwnValidation?: true;
    /**
     * Documentation-only request parameters: protocol parameters the handler reads itself (the
     * SSE `Last-Event-ID` header, the OIDC callback query), by location, name and description. A
     * route schema for them would change validation (a value the handler tolerates or refuses in
     * its own way would be refused before it), so only the OpenAPI document reads this. A name
     * MUST NOT also be in the route's own schema for that location.
     */
    readonly openApiParameters?: Readonly<
      Partial<Record<OpenApiParameterLocation, Readonly<Record<string, string>>>>
    >;
  }
}

/** Where a documentation-only parameter is read. */
export type OpenApiParameterLocation = 'header' | 'query';

/** The route schema key `@fastify/swagger` reads the parameters of a location from. */
const PARAMETER_SCHEMA_KEYS = { header: 'headers', query: 'querystring' } as const;

export interface OpenApiOptions {
  /**
   * The name of the session cookie under `authentication.mode: required`; absent in trusted local
   * mode (`none`), where no operation needs a credential.
   */
  readonly sessionCookie: string | undefined;
}

/** The security scheme name of the session cookie in `components.securitySchemes`. */
export const SESSION_COOKIE_SCHEME = 'sessionCookie';

/**
 * The operation groups of the document, in display order. Every documented route declares exactly
 * one of them in its schema `tags`, with a non-empty `summary`; a documented route without them,
 * with another tag or with more than one is refused at registration. The group of an operation is
 * never derived from its URL (the document and Task operations live under `/api/specs/`).
 */
export const OPENAPI_TAGS = [
  {
    name: 'Authentication',
    description: 'Password and OIDC login, logout and the authentication state of the caller.',
  },
  { name: 'Authorization', description: 'The capabilities of the caller on a resource.' },
  {
    name: 'Sessions',
    description:
      'Agent Sessions: create, list, read the conversation and its work, run Turns, manage.',
  },
  {
    name: 'Session Providers',
    description: 'The agent providers and models a Session can be started with.',
  },
  { name: 'Session Telemetry', description: 'Usage, cost and provider limits of a Session.' },
  {
    name: 'Specifications',
    description: 'Overview, creation, workspace view and closing of Specifications.',
  },
  {
    name: 'Documents',
    description: 'Specification documents: tree, reads, writes, commits and document operations.',
  },
  { name: 'Tasks', description: 'Task reads of a Specification: detail, history and resources.' },
  {
    name: 'Operations',
    description: 'Status and progress of long-running operations across features.',
  },
  {
    name: 'Workspaces',
    description: 'Closing a linked worktree and a whole workspace (checkout).',
  },
  { name: 'Runtime', description: 'The Runtime itself: its mode and this OpenAPI document.' },
] as const;

export type OpenApiTag = (typeof OPENAPI_TAGS)[number]['name'];

const TAG_NAMES = new Set<string>(OPENAPI_TAGS.map((tag) => tag.name));

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

/**
 * The `operationId` of a route: the lower-case method followed by each path segment below `/api/`,
 * a path parameter as `By<Name>` (`GET /api/specs/:specId/workspace` is
 * `getSpecsBySpecIdWorkspace`). It depends only on the method and path, never on registration
 * order. The segment encoding is reversible for segments of `[a-z0-9-]`, which covers the one
 * configured segment (the OIDC provider id), so a valid configuration cannot produce two equal ids;
 * two code-defined routes with the same id are refused at registration.
 */
export function openApiOperationId(method: string, url: string): string {
  const words = url
    .replace(/^\/api\//, '')
    .split('/')
    .map((segment) =>
      segment.startsWith(':') ? `By${upperFirst(segment.slice(1))}` : segmentWords(segment),
    );

  return `${method.toLowerCase()}${words.join('')}`;
}

function upperFirst(name: string): string {
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}`;
}

const LOWER_LETTER = /^[a-z]$/;

/**
 * A path segment in PascalCase: a letter that starts the segment or follows a separator (`-`, `.`)
 * is upper-cased and that separator dropped; a separator not followed by a letter becomes `_`
 * (`sso-1` is `Sso_1`, `sso1` is `Sso1`, `a--b` is `A_B`). For `[a-z0-9-]` this is reversible:
 * an upper-case letter after the start is `-` and the letter, `_` is `-`.
 */
function segmentWords(segment: string): string {
  let words = '';
  for (let index = 0; index < segment.length; index += 1) {
    const char = segment.charAt(index);
    if (char === '-' || char === '.') {
      words += LOWER_LETTER.test(segment.charAt(index + 1)) ? '' : '_';
      continue;
    }

    const previous = segment.charAt(index - 1);
    const startsWord = index === 0 || previous === '-' || previous === '.';
    words += startsWord && LOWER_LETTER.test(char) ? char.toUpperCase() : char;
  }

  return words;
}

/**
 * Response descriptions by status code, for responses whose schema has no `description`. Only
 * status codes whose meaning is the same on every Runtime route are listed; any other status keeps
 * the `@fastify/swagger` default.
 */
const STATUS_DESCRIPTIONS: Readonly<Record<string, string>> = {
  200: 'Success.',
  201: 'Created.',
  202: 'Accepted: the operation continues asynchronously.',
  304: 'Not modified: the representation identified by the request `If-None-Match` is current.',
  400: 'The request is invalid.',
  401: 'Not authenticated.',
  403: 'The principal lacks a required capability.',
  404: 'Not found.',
  409: 'Conflicts with the current state of the resource.',
  413: 'The request or the addressed content is too large.',
  415: 'Unsupported media type.',
  422: 'The request is well-formed but cannot be processed.',
  429: 'Too many requests.',
  503: 'Temporarily unavailable.',
};

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
  options: OpenApiOptions,
): Promise<void> {
  const gaps: OpenApiRouteGap[] = [];
  routeGaps.set(app, gaps);
  const operationIds = new Map<string, string>();
  const badRequestSchemas: {
    readonly route: {
      readonly method: unknown;
      readonly url: string;
      readonly config?: { readonly openApiOwnValidation?: true };
    };
    readonly schema: unknown;
  }[] = [];
  // Checked once every route and shared contract is registered, when `route.config` is final
  // (the Session error handling marks its routes in an `onRoute` hook of its own context).
  app.addHook('onReady', (done) => {
    for (const { route, schema } of badRequestSchemas) {
      if (
        route.config?.openApiOwnValidation !== true &&
        !serializesRequestError(schema, (id) => app.getSchema(id))
      ) {
        done(
          new Error(
            `Route ${String(route.method)} ${route.url} has a 400 response schema that cannot ` +
              'serialize the Fastify request error (an enum, const or extra required field); make ' +
              'it a union with RequestErrorResponse.',
          ),
        );

        return;
      }
    }

    done();
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

    const tags = route.schema?.tags;
    if (tags?.length !== 1 || !TAG_NAMES.has(tags[0]!)) {
      throw new Error(
        `Route ${route.method} ${route.url} must declare exactly one of the OpenAPI tags.`,
      );
    }

    if (typeof route.schema?.summary !== 'string' || !/\S/.test(route.schema.summary)) {
      throw new Error(`Route ${route.method} ${route.url} must declare a summary.`);
    }

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
      ...(options.sessionCookie
        ? {
            components: {
              securitySchemes: {
                [SESSION_COOKIE_SCHEME]: {
                  type: 'apiKey',
                  in: 'cookie',
                  name: options.sessionCookie,
                  description:
                    'The Runtime session cookie set by a successful login (password or OIDC).',
                },
              },
            },
          }
        : {}),
    },
    // A shared contract becomes the component named by its `$id` (the default is a positional
    // `def-N`, which changes whenever a contract is added).
    refResolver: { buildLocalReference: componentName },
    transform: ({ schema, url, route }) => {
      if (!isDocumentedRoute(url)) {
        return { schema: { ...schema, hide: true }, url };
      }

      const secured = options.sessionCookie !== undefined && route.config?.openApiPublic !== true;
      const documented = route.config?.openApiResponses;
      const shared: Record<number, object> = {};
      // A route without documented responses keeps the generic `200 Default Response` alone.
      if (schema?.response || documented) {
        if (secured) {
          shared[401] = contractRef(AuthenticationRequiredErrorResponseSchema);
        }

        // Every route without a limit of its own is under the default limit; `rateLimit: false`
        // would exempt it (no Runtime route is exempt).
        if (route.config?.rateLimit !== false) {
          shared[429] = RATE_LIMITED_RESPONSE;
        }

        if (route.config?.openApiOwnValidation !== true && hasRequestSchema(schema)) {
          shared[400] = requestValidationResponse(schema?.body !== undefined);
        }
      }

      return {
        schema: {
          ...withDocumentedParameters(
            withDocumentedResponses(
              withSharedResponses(
                withRequestErrorNote(
                  referenceSharedIdentifiers(schema) as FastifySchema | undefined,
                  route.config?.openApiOwnValidation !== true && hasRequestSchema(schema),
                ),
                shared,
              ),
              documented,
            ),
            route.config?.openApiParameters,
          ),
          // A documented route has one method (refused otherwise at registration).
          operationId: openApiOperationId(route.method as string, route.url),
          ...(secured ? { security: [{ [SESSION_COOKIE_SCHEME]: [] }] } : {}),
        },
        url,
      };
    },
    // Shared contracts reference the identifiers they contain, as route schemas do (documentation
    // only: the registered contracts keep their inline identifiers for validation).
    transformObject: (documentObject) => {
      // The document is OpenAPI 3.1 (`openapi` above), never Swagger 2.
      const document = (
        documentObject as Extract<typeof documentObject, { openapiObject: unknown }>
      ).openapiObject;
      const schemas = document.components?.schemas;

      return schemas
        ? ({
            ...document,
            components: {
              ...document.components,
              schemas: referenceIdentifiersInComponents(schemas),
            },
          } as typeof document)
        : document;
    },
  });
}

/**
 * The route schema as the document sees it with the documentation-only parameters: each is an
 * optional string property of the location's schema (`headers`, `querystring`), which
 * `@fastify/swagger` lists as a parameter with its description.
 */
function withDocumentedParameters(
  schema: FastifySchema,
  parameters:
    Partial<Record<OpenApiParameterLocation, Readonly<Record<string, string>>>> | undefined,
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

/**
 * The default rate limit's refusal (the endpoint policy): its body and the headers the limiter sets.
 * A route with a `429` schema of its own (a stricter route limit) documents it there.
 */
const RATE_LIMITED_RESPONSE = {
  ...contractRef(RateLimitedErrorResponseSchema),
  description: 'Too many requests: the source exceeded the Runtime default rate limit.',
  headers: {
    'Retry-After': { type: 'string', description: 'Seconds until the budget renews.' },
    'x-ratelimit-limit': { type: 'string', description: 'The budget of the time window.' },
    'x-ratelimit-remaining': { type: 'string', description: '`0` on a refusal.' },
    'x-ratelimit-reset': { type: 'string', description: 'Seconds until the window resets.' },
  },
} as const;

/**
 * A failed request validation or JSON parsing of a route with a `400` schema of its own is
 * serialized through that schema: Fastify's error object with `statusCode`, `code`, `error` and
 * `message` (and more fields, such as `validation`).
 */
const REQUEST_ERROR = {
  statusCode: 400,
  code: 'FST_ERR_VALIDATION',
  error: 'Bad Request',
  message: 'body must be object',
} as const;

/**
 * Whether a `400` response schema can serialize Fastify's request error. An object schema
 * (`type: 'object'`) can when it declares `error`, requires no other field of its own and every
 * declared field of the error accepts its value (an `error` enum cannot). A schema of another type
 * (`null`, a string) cannot, and neither can an object without `error` (`{}`): the serializer
 * would write an empty object, a body that no longer says what was refused. A union can when one
 * member is an open object that can (the serializer validates the error object, with its extra
 * fields, against each member). A reference is resolved through the registered shared schemas; an
 * unknown one is left to Fastify.
 */
function serializesRequestError(
  schema: unknown,
  resolve: (id: string) => unknown,
  member = false,
): boolean {
  const node = schema as {
    readonly $ref?: string;
    readonly anyOf?: readonly unknown[];
    readonly type?: unknown;
    readonly properties?: Readonly<Record<string, unknown>>;
    readonly required?: readonly string[];
    readonly additionalProperties?: unknown;
  };
  if (node.$ref !== undefined) {
    const resolved = resolve(node.$ref);

    return resolved === undefined || serializesRequestError(resolved, resolve, member);
  }

  if (node.anyOf) {
    return node.anyOf.some((item) => serializesRequestError(item, resolve, true));
  }

  const fields = REQUEST_ERROR as Readonly<Record<string, unknown>>;

  return (
    node.type === 'object' &&
    node.properties?.error !== undefined &&
    !(member && node.additionalProperties === false) &&
    (node.required ?? []).every((name) => name in fields) &&
    Object.entries(node.properties ?? {}).every(
      ([name, property]) => !(name in fields) || Value.Check(property as TSchema, fields[name]),
    )
  );
}

/**
 * The route schema with its own `400` described as also carrying the request error, when Fastify
 * serializes a failed validation or JSON parsing through it (`validated`) and the route gives
 * the `400` no description of its own.
 */
function withRequestErrorNote(
  schema: FastifySchema | undefined,
  validated: boolean,
): FastifySchema | undefined {
  const response = (schema?.response ?? {}) as Record<string, Record<string, unknown>>;
  const own = response[400];
  if (
    !validated ||
    !own ||
    own.description !== undefined ||
    own['x-response-description'] !== undefined
  ) {
    return schema;
  }

  const description =
    'The request is invalid. A request that fails its schema validation' +
    (schema?.body !== undefined ? ' or JSON parsing' : '') +
    ' is answered in this shape too, with `error` `Bad Request` and `code` ' +
    (schema?.body !== undefined
      ? '`FST_ERR_VALIDATION`, `FST_ERR_CTP_INVALID_JSON_BODY` or `FST_ERR_CTP_EMPTY_JSON_BODY`.'
      : '`FST_ERR_VALIDATION`.');

  return {
    ...schema,
    response: {
      ...response,
      // See `withDocumentedResponses`: a reference carries a plain `description`.
      400: {
        ...own,
        [own.$ref === undefined ? 'x-response-description' : 'description']: description,
      },
    },
  };
}

/** The route validates a part of the request: path, query, headers or body. */
function hasRequestSchema(schema: FastifySchema | undefined): boolean {
  const parts = schema as Record<string, unknown> | undefined;

  return ['params', 'querystring', 'query', 'headers', 'body'].some(
    (part) => parts?.[part] !== undefined,
  );
}

/**
 * The `400` of a request that fails the route schema: the Runtime error handling answers Fastify's
 * own error body. A route with a JSON body also answers it for a malformed or empty body.
 */
function requestValidationResponse(body: boolean) {
  return {
    ...contractRef(RequestErrorResponseSchema),
    description:
      'The request does not match the route schema: the request error with `code` ' +
      (body
        ? '`FST_ERR_VALIDATION`, or `FST_ERR_CTP_INVALID_JSON_BODY` or ' +
          '`FST_ERR_CTP_EMPTY_JSON_BODY` for a malformed or empty JSON body.'
        : '`FST_ERR_VALIDATION`.'),
  };
}

/**
 * The route schema with the responses that shared Runtime mechanisms answer for it, for each status
 * code it does not document itself: `401` of request authorization for an operation that needs a
 * principal, `429` of the default rate limit, `400` of request validation for a route with a
 * request schema whose validation failures reach the Runtime error handling. A `403` is never
 * added: whether a route can refuse a capability is the route's own knowledge, so it documents its
 * `403` in its response schema.
 */
function withSharedResponses(
  schema: FastifySchema | undefined,
  shared: Readonly<Record<number, object>>,
): FastifySchema | undefined {
  const own = (schema?.response ?? {}) as Record<string, unknown>;
  const added = Object.fromEntries(
    Object.entries(shared).filter(([status]) => own[status] === undefined),
  );
  if (Object.keys(added).length === 0) {
    return schema;
  }

  return { ...schema, response: { ...own, ...added } };
}

/**
 * The route schema as the document sees it: the documentation-only responses are added in the form
 * `@fastify/swagger` reads (`type: 'null'` for no body, `content` for a media type, `headers`), and
 * a schema response without a `description` gets the description of its status code. Only the
 * document uses the result; the route keeps its own schema for validation and serialization.
 */
function withDocumentedResponses(
  // A route without any schema reaches the transform with `undefined`.
  schema: FastifySchema | undefined,
  documented: Readonly<Record<number, OpenApiDocumentedResponse>> | undefined,
): FastifySchema {
  if (!schema?.response && !documented) {
    // No documented response: `@fastify/swagger` emits its generic `200 Default Response`.
    return schema ?? {};
  }

  const described = Object.fromEntries(
    Object.entries((schema?.response ?? {}) as Record<string, Record<string, unknown>>).map(
      ([status, response]) => [
        status,
        response.description === undefined &&
        response['x-response-description'] === undefined &&
        STATUS_DESCRIPTIONS[status]
          ? {
              ...response,
              // `@fastify/swagger` reads `x-response-description` of an inline schema and drops it
              // from the body schema, but drops every sibling of a `$ref` before reading it, so a
              // reference carries a plain `description` (which stays out of the component).
              [response.$ref === undefined ? 'x-response-description' : 'description']:
                STATUS_DESCRIPTIONS[status],
            }
          : response,
      ],
    ),
  );
  const responses = Object.fromEntries(
    Object.entries(documented ?? {}).map(([status, response]) => [
      status,
      {
        // A reference carries a plain `description` (see above); an inline `anyOf` would keep a
        // plain one in its body schema too, so it carries `x-response-description`, which
        // `@fastify/swagger` reads and drops.
        [Array.isArray(response.contract) ? 'x-response-description' : 'description']:
          response.description,
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
        ...(Array.isArray(response.contract)
          ? { anyOf: response.contract.map((contract) => contractRef(contract)) }
          : response.contract
            ? contractRef(response.contract as TSchema)
            : response.mediaType
              ? { content: { [response.mediaType]: { schema: { type: 'string' } } } }
              : { type: 'null' }),
      },
    ]),
  );

  return { ...schema, response: { ...described, ...responses } };
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
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    OPENAPI_DOCUMENT_PATH,
    {
      schema: {
        tags: ['Runtime'],
        summary: 'Read this OpenAPI document',
        response: { 200: OpenApiDocumentResponseSchema },
      },
    },
    (request, reply) => {
      request.authz.requireAccess();
      reply.header('Cache-Control', 'no-store');

      return app.swagger() as Static<typeof OpenApiDocumentResponseSchema>;
    },
  );
}

import type { FastifySchema } from 'fastify';
import type { TSchema } from 'typebox';

import { AuthenticationRequiredErrorResponseSchema } from '@nevo/specflow-contracts/authorization';
import {
  RateLimitedErrorResponseSchema,
  RequestErrorResponseSchema,
} from '@nevo/specflow-contracts/runtime';

import { contractRef } from '../shared-contracts';
import type { OpenApiDocumentedResponse } from './config';

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

/** The route validates a part of the request: path, query, headers or body. */
export function hasRequestSchema(schema: FastifySchema | undefined): boolean {
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
 * The responses that shared Runtime mechanisms answer for a route that documents its responses:
 * `401` of request authorization for an operation that needs a principal (`secured`), `429` of the
 * default rate limit, `400` of request validation for a route with a request schema whose
 * validation failures reach the Runtime error handling (`validated`).
 */
export function sharedResponses(
  schema: FastifySchema | undefined,
  options: {
    readonly secured: boolean;
    readonly rateLimited: boolean;
    readonly validated: boolean;
  },
): Readonly<Record<number, object>> {
  const shared: Record<number, object> = {};
  if (options.secured) {
    shared[401] = contractRef(AuthenticationRequiredErrorResponseSchema);
  }

  if (options.rateLimited) {
    shared[429] = RATE_LIMITED_RESPONSE;
  }

  if (options.validated) {
    shared[400] = requestValidationResponse(schema?.body !== undefined);
  }

  return shared;
}

/**
 * The route schema with its own `400` described as also carrying the request error, when Fastify
 * serializes a failed validation or JSON parsing through it (`validated`) and the route gives
 * the `400` no description of its own.
 */
export function withRequestErrorNote(
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

/**
 * The route schema with the shared responses, for each status code it does not document itself. A
 * `403` is never shared: whether a route can refuse a capability is the route's own knowledge, so
 * it documents its `403` in its response schema.
 */
export function withSharedResponses(
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
export function withDocumentedResponses(
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

import type { TSchema } from 'typebox';
import { Value } from 'typebox/value';

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

/** A documented route with a `400` response schema of its own, checked once the app is ready. */
export interface BadRequestSchema {
  readonly route: {
    readonly method: unknown;
    readonly url: string;
    readonly config?: { readonly openApiOwnValidation?: true };
  };
  readonly schema: unknown;
}

/**
 * The first route whose own `400` schema cannot serialize Fastify's request error, as an error; a
 * route of an error handling that answers its own validation failures is exempt.
 */
export function unserializableRequestError(
  schemas: readonly BadRequestSchema[],
  resolve: (id: string) => unknown,
): Error | undefined {
  const found = schemas.find(
    ({ route, schema }) =>
      route.config?.openApiOwnValidation !== true && !serializesRequestError(schema, resolve),
  );

  return found
    ? new Error(
        `Route ${String(found.route.method)} ${found.route.url} has a 400 response schema that ` +
          'cannot serialize the Fastify request error (an enum, const or extra required field); ' +
          'make it a union with RequestErrorResponse.',
      )
    : undefined;
}

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

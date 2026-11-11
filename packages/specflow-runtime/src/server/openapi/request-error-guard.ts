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
 * The first route whose own `400` schema cannot serialize Fastify's request error, as an error
 * naming the rule that failed; a route of an error handling that answers its own validation
 * failures is exempt.
 */
export function unserializableRequestError(
  schemas: readonly BadRequestSchema[],
  resolve: (id: string) => unknown,
): Error | undefined {
  for (const { route, schema } of schemas) {
    const reason =
      route.config?.openApiOwnValidation === true
        ? undefined
        : requestErrorRefusal(schema, resolve, false);
    if (reason !== undefined) {
      return new Error(
        `Route ${String(route.method)} ${route.url} has a 400 response schema that cannot ` +
          `serialize the Fastify request error: ${reason}. Make it a union with ` +
          'RequestErrorResponse.',
      );
    }
  }

  return undefined;
}

interface SchemaNode {
  readonly $ref?: string;
  readonly anyOf?: readonly unknown[];
  readonly oneOf?: readonly unknown[];
  readonly allOf?: readonly unknown[];
  readonly type?: unknown;
  readonly properties?: Readonly<Record<string, unknown>>;
  readonly required?: readonly string[];
  readonly additionalProperties?: unknown;
}

/**
 * Why a `400` response schema cannot serialize Fastify's request error, or `undefined` when it can.
 * An object schema (`type: 'object'`) can when it declares `error`, requires no other field of its
 * own and every declared field of the error accepts its value (an `error` enum cannot). A schema of
 * another type (`null`, a string) cannot, and neither can an object without `error` (`{}`): the
 * serializer would write an empty object, a body that no longer says what was refused. A union
 * (`anyOf`, `oneOf`) can when one member is an open object that can (the serializer validates the
 * error object, with its extra fields, against each member); `allOf` is not supported. A reference
 * is resolved through the registered shared schemas; an unknown one at the top is left to Fastify.
 */
function requestErrorRefusal(
  schema: unknown,
  resolve: (id: string) => unknown,
  member: boolean,
): string | undefined {
  const node = schema as SchemaNode;
  if (node.$ref !== undefined) {
    const resolved = resolve(node.$ref);

    return resolved === undefined ? undefined : requestErrorRefusal(resolved, resolve, member);
  }

  if (node.allOf) {
    return 'an `allOf` composition is not supported';
  }

  const members = node.anyOf ?? node.oneOf;
  if (members) {
    const reasons = members.map((item) => requestErrorRefusal(item, resolve, true));

    return reasons.some((reason) => reason === undefined)
      ? undefined
      : `no member of its union can (${reasons.join('; ')})`;
  }

  if (node.type !== 'object') {
    return 'it is not an object schema';
  }

  if (node.properties?.error === undefined) {
    return 'it declares no `error` field';
  }

  if (member && node.additionalProperties === false) {
    return 'a closed union member cannot match the error object, which has more fields';
  }

  const fields = REQUEST_ERROR as Readonly<Record<string, unknown>>;
  const extra = (node.required ?? []).find((name) => !(name in fields));
  if (extra !== undefined) {
    return `it requires \`${extra}\`, which the request error does not have`;
  }

  for (const [name, property] of Object.entries(node.properties)) {
    if (name in fields) {
      const reason = fieldRefusal(name, property, fields[name], resolve);
      if (reason !== undefined) {
        return reason;
      }
    }
  }

  return undefined;
}

/** Why a declared field of the schema does not accept the request error's value of that field. */
function fieldRefusal(
  name: string,
  property: unknown,
  value: unknown,
  resolve: (id: string) => unknown,
): string | undefined {
  const reference = (property as SchemaNode).$ref;
  const resolved = reference === undefined ? property : resolve(reference);
  if (resolved === undefined) {
    return `its \`${name}\` field references the unknown schema \`${String(reference)}\``;
  }

  let accepted: boolean;
  try {
    accepted = Value.Check(resolved as TSchema, value);
  } catch {
    return `its \`${name}\` field has a nested reference the check cannot resolve`;
  }

  return accepted
    ? undefined
    : `its \`${name}\` field (an enum, const or type) does not accept ${JSON.stringify(value)}`;
}

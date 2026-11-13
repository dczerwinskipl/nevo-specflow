import type { FastifyServerOptions } from 'fastify';
import fastJsonStringify, { type Schema } from 'fast-json-stringify';

type SerializerFactory = NonNullable<
  NonNullable<
    NonNullable<FastifyServerOptions['schemaController']>['compilersFactory']
  >['buildSerializer']
>;

/** The `$id`s a schema references (`{ $ref: 'Id' }` or `'Id#/pointer'`); local `#...` refs excluded. */
function referencedIds(schema: unknown, into: Set<string>): void {
  if (Array.isArray(schema)) {
    for (const item of schema) {
      referencedIds(item, into);
    }

    return;
  }

  if (!schema || typeof schema !== 'object') {
    return;
  }

  for (const [key, value] of Object.entries(schema)) {
    if (key === '$ref' && typeof value === 'string') {
      const id = value.split('#', 1)[0];
      if (id) {
        into.add(id);
      }
    } else {
      referencedIds(value, into);
    }
  }
}

/**
 * The response serializer factory of the Runtime: Fastify's default (`fast-json-stringify`), except
 * that each route and status is compiled with only the shared schemas its response schema references
 * (transitively), not every registered one. The default resolves every shared contract for every
 * route and status, so the startup cost grew with routes times the size of all shared contracts;
 * the serialized output is the same.
 */
export const buildReferencedSchemaSerializer: SerializerFactory = (externalSchemas, options) => {
  const shared = (externalSchemas ?? {}) as Record<string, Schema>;
  const closures = new Map<string, ReadonlySet<string>>();

  /** Every shared `$id` reachable from one shared schema, itself included (memoised per `$id`). */
  function closureOf(id: string): ReadonlySet<string> {
    const known = closures.get(id);
    if (known) {
      return known;
    }

    const reached = new Set<string>();
    const pending = [id];
    while (pending.length) {
      const next = pending.pop()!;
      if (reached.has(next) || !(next in shared)) {
        continue;
      }

      reached.add(next);
      const references = new Set<string>();
      referencedIds(shared[next], references);
      pending.push(...references);
    }

    closures.set(id, reached);

    return reached;
  }

  return ({ schema }) => {
    const direct = new Set<string>();
    referencedIds(schema, direct);
    const own = (schema as { $id?: unknown } | undefined)?.$id;
    const subset: Record<string, Schema> = {};
    for (const id of direct) {
      for (const reached of closureOf(id)) {
        // As the default compiler: a route schema that is itself a shared schema is not external.
        if (reached !== own) {
          subset[reached] = shared[reached]!;
        }
      }
    }

    return fastJsonStringify(schema as Schema, { ...options, schema: subset });
  };
};

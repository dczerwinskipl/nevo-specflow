import Fastify from 'fastify';
import fastJsonStringify from 'fast-json-stringify';
import { describe, expect, it, vi } from 'vitest';

import { buildReferencedSchemaSerializer } from './serializer';

// The real compiler, observed: which external schemas each build receives.
vi.mock('fast-json-stringify', async (importOriginal) => {
  const original = await importOriginal<typeof import('fast-json-stringify')>();

  return { default: vi.fn(original.default) };
});

const inner = {
  $id: 'Inner',
  type: 'object',
  properties: { kept: { type: 'string' } },
  additionalProperties: false,
} as const;
const outer = {
  $id: 'Outer',
  type: 'object',
  properties: { inner: { $ref: 'Inner' } },
} as const;
const body = { inner: { kept: 'yes', dropped: 'no' } };

/** A Fastify app with the factory and the shared schemas, plus one that no route can serialize. */
function appWithSharedSchemas() {
  const app = Fastify({
    schemaController: { compilersFactory: { buildSerializer: buildReferencedSchemaSerializer } },
  });
  app.addSchema(inner);
  app.addSchema(outer);
  // Unrelated and not serializable by itself: a route that does not reference it never sees it.
  app.addSchema({ $id: 'Unrelated', $ref: 'Missing' });

  return app;
}

describe('buildReferencedSchemaSerializer', () => {
  it('serializes through transitively referenced shared schemas and ignores unrelated ones', async () => {
    const app = appWithSharedSchemas();
    app.get('/outer', { schema: { response: { 200: { $ref: 'Outer#' } } } }, () => body);

    expect((await app.inject('/outer')).json()).toEqual({ inner: { kept: 'yes' } });
    await app.close();
  });

  it('follows a reference inside anyOf, the shape of a union with a shared contract', async () => {
    const app = appWithSharedSchemas();
    app.get(
      '/union',
      { schema: { response: { 200: { anyOf: [{ $ref: 'Outer' }, { type: 'null' }] } } } },
      // An anyOf branch is chosen by validating the value, so it must conform to Inner.
      () => ({ inner: { kept: 'yes' } }),
    );

    expect((await app.inject('/union')).json()).toEqual({ inner: { kept: 'yes' } });
    await app.close();
  });

  it('passes only the referenced shared schemas, never the route schema itself', () => {
    // Recursive: the route schema reaches its own `$id`, which the default compiler leaves out too.
    const node = {
      $id: 'Node',
      type: 'object',
      properties: {
        inner: { $ref: 'Inner' },
        children: { type: 'array', items: { $ref: 'Node' } },
      },
    } as const;
    const compile = buildReferencedSchemaSerializer(
      { Inner: inner, Node: node, Unrelated: { $id: 'Unrelated', $ref: 'Missing' } },
      {},
    );
    vi.mocked(fastJsonStringify).mockClear();

    const serialize = compile({ method: 'GET', url: '/tree', httpStatus: '200', schema: node });

    expect(serialize({ ...body, children: [body] })).toBe(
      '{"inner":{"kept":"yes"},"children":[{"inner":{"kept":"yes"}}]}',
    );
    expect(vi.mocked(fastJsonStringify).mock.calls[0]?.[1]?.schema).toEqual({ Inner: inner });
  });
});

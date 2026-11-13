import Fastify from 'fastify';
import { describe, expect, it } from 'vitest';

import { buildReferencedSchemaSerializer } from './serializer';

describe('buildReferencedSchemaSerializer', () => {
  it('serializes through transitively referenced shared schemas and ignores unrelated ones', async () => {
    const app = Fastify({
      schemaController: { compilersFactory: { buildSerializer: buildReferencedSchemaSerializer } },
    });
    app.addSchema({
      $id: 'Inner',
      type: 'object',
      properties: { kept: { type: 'string' } },
      additionalProperties: false,
    });
    app.addSchema({
      $id: 'Outer',
      type: 'object',
      properties: { inner: { $ref: 'Inner' } },
    });
    // Unrelated and not serializable by itself: a route that does not reference it never sees it.
    app.addSchema({ $id: 'Unrelated', $ref: 'Missing' });
    app.get('/outer', { schema: { response: { 200: { $ref: 'Outer#' } } } }, () => ({
      inner: { kept: 'yes', dropped: 'no' },
    }));

    const response = await app.inject('/outer');

    expect(response.json()).toEqual({ inner: { kept: 'yes' } });
    await app.close();
  });
});

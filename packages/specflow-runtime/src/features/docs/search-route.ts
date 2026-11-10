import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import { DocsCapabilities, DocsSearchResultSchema } from '@nevo/specflow-contracts/docs';
import { DocsConfigError, DocsCorpusInvalidError } from '@nevo/specflow-docs';
import type { FastifyPluginCallback } from 'fastify';
import { Type } from 'typebox';

import { requireCapability } from '../auth';
import { contractRef } from '../../server/shared-contracts';
import type { ProjectDocs } from './project-docs';

export const DOCS_UNAVAILABLE_CODE = 'DOCS_UNAVAILABLE';
/** Documents returned without `limit`; the same default as `nevo-specflow docs search`. */
export const DOCS_SEARCH_DEFAULT_LIMIT = 10;
export const DOCS_SEARCH_MAX_LIMIT = 50;
export const DOCS_SEARCH_MAX_QUERY_LENGTH = 500;

/**
 * Wire form of the search query. The Runtime does not coerce query types, so `limit` arrives as
 * digits (1..50) and the switch as `true` or `false`.
 */
const DocsSearchQuerySchema = Type.Object(
  {
    q: Type.String({
      minLength: 1,
      maxLength: DOCS_SEARCH_MAX_QUERY_LENGTH,
      pattern: '\\S',
      description: 'The question, in your own words.',
    }),
    limit: Type.Optional(
      Type.String({
        pattern: '^(?:[1-9]|[1-4][0-9]|50)$',
        description: `Maximum documents, 1 to ${DOCS_SEARCH_MAX_LIMIT} (default ${DOCS_SEARCH_DEFAULT_LIMIT}).`,
      }),
    ),
    includeNonAuthoritative: Type.Optional(
      Type.Union([Type.Literal('true'), Type.Literal('false')], {
        description:
          'Also return documents under the non-authoritative path prefixes (default false).',
      }),
    ),
  },
  { additionalProperties: false },
);

const DocsSearchErrorSchema = Type.Object(
  { error: Type.String(), code: Type.String() },
  { additionalProperties: false },
);

/**
 * `GET /api/docs/search`: ranked document sections of the project's own documentation, with the
 * result contract of `nevo-specflow docs search --json`. Every search runs the bounded read-time
 * refresh. `docs` is `undefined` when the Runtime serves no project documentation (demo data).
 */
export const docsSearchEndpoint: FastifyPluginCallback<{
  readonly docs: ProjectDocs | undefined;
}> = (app, { docs }, done) => {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/api/docs/search',
    {
      preHandler: requireCapability({
        resource: DocsCapabilities,
        capability: DocsCapabilities.capabilities.Search,
        scope: {},
      }),
      schema: {
        querystring: DocsSearchQuerySchema,
        response: {
          200: contractRef(DocsSearchResultSchema),
          401: contractRef(AuthenticationRequiredErrorResponseSchema),
          403: contractRef(AuthorizationForbiddenErrorResponseSchema),
          503: DocsSearchErrorSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const unavailable = () =>
        reply.code(503).send({ error: DOCS_UNAVAILABLE_CODE, code: DOCS_UNAVAILABLE_CODE });
      if (docs === undefined) {
        return unavailable();
      }

      const { q, limit, includeNonAuthoritative } = request.query;
      try {
        return await docs.search({
          query: q.trim(),
          limit: limit === undefined ? DOCS_SEARCH_DEFAULT_LIMIT : Number(limit),
          includeNonAuthoritative: includeNonAuthoritative === 'true',
          refresh: true,
        });
      } catch (error) {
        // The project's documentation is missing or invalid: its state, not a Runtime failure.
        if (error instanceof DocsConfigError || error instanceof DocsCorpusInvalidError) {
          request.log.warn({ err: error }, 'Documentation search is unavailable.');

          return unavailable();
        }

        throw error;
      }
    },
  );
  done();
};

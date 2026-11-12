import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { WorkspaceDocsSearchSchema } from '@nevo/specflow-contracts/docs';
import type { FastifyPluginCallback } from 'fastify';
import { Type } from 'typebox';

import { requireDocsView } from '../access';
import {
  noStore,
  replyWithDocsError,
  replyWithWorkspaceFailure,
  workspaceDocsErrorResponses,
  WorkspaceDocsParamsSchema,
  type WorkspaceDocsEndpointOptions,
} from '../route-support';

/** Documents returned without `limit`; the same default as `nevo-specflow docs search`. */
const DOCS_SEARCH_DEFAULT_LIMIT = 10;
const DOCS_SEARCH_MAX_LIMIT = 50;
const DOCS_SEARCH_MAX_QUERY_LENGTH = 500;

/**
 * Wire form of the search query. The Runtime does not coerce query types, so `limit` arrives as
 * digits (1..50) and the switches as `true` or `false`.
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
        description: `Maximum documents, 1 to ${String(DOCS_SEARCH_MAX_LIMIT)} (default ${String(DOCS_SEARCH_DEFAULT_LIMIT)}).`,
      }),
    ),
    includeNonAuthoritative: Type.Optional(
      Type.Union([Type.Literal('true'), Type.Literal('false')], {
        description:
          'Also return documents under the non-authoritative path prefixes (default false).',
      }),
    ),
    snippets: Type.Optional(
      Type.Union([Type.Literal('true'), Type.Literal('false')], {
        description:
          'Add a query-aware excerpt (`snippet`) to each matching section (default true; `false` omits it).',
      }),
    ),
  },
  { additionalProperties: false },
);

/**
 * `GET /api/workspaces/:workspaceId/docs/search` (ADR 0022 §1): ranked documents of the workspace's
 * documentation with their best sections, in the result of `nevo-specflow docs search --json`,
 * plus how many non-authoritative documents the same query left out and the progress of the
 * Runtime's background refresh of this index. Every search runs the bounded read-time refresh; a
 * larger gap answers lexically at once and starts the background catch-up.
 */
export const docsSearchEndpoint: FastifyPluginCallback<WorkspaceDocsEndpointOptions> = (
  app,
  { operations, projectId },
  done,
) => {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/api/workspaces/:workspaceId/docs/search',
    {
      onRequest: noStore,
      preHandler: requireDocsView(projectId),
      schema: {
        tags: ['Documentation'],
        summary: "Search a workspace's documentation",
        params: WorkspaceDocsParamsSchema,
        querystring: DocsSearchQuerySchema,
        response: { 200: WorkspaceDocsSearchSchema, ...workspaceDocsErrorResponses },
      },
    },
    async (request, reply) => {
      if (operations === undefined) {
        return replyWithDocsError(reply, 'DOCS_UNAVAILABLE');
      }

      const { q, limit, includeNonAuthoritative, snippets } = request.query;
      const read = await operations.search(request.params.workspaceId, {
        query: q.trim(),
        limit: limit === undefined ? DOCS_SEARCH_DEFAULT_LIMIT : Number(limit),
        includeNonAuthoritative: includeNonAuthoritative === 'true',
        snippets: snippets !== 'false',
      });
      if (read.kind !== 'ok') {
        return replyWithWorkspaceFailure(reply, read);
      }

      const { revision, result, indexProgress } = read.value;

      return reply.code(200).send({
        ...result,
        workspaceId: read.workspaceId,
        corpusRevision: revision,
        ...(indexProgress === undefined ? {} : { indexProgress }),
      });
    },
  );
  done();
};

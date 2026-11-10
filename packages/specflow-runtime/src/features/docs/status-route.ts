import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import { DocsCapabilities, DocsStatusSchema } from '@nevo/specflow-contracts/docs';
import { DocsConfigError, DocsCorpusInvalidError } from '@nevo/specflow-docs';
import type { FastifyPluginCallback } from 'fastify';

import { requireCapabilityInAnyScope } from '../auth';
import { contractRef } from '../../server/shared-contracts';
import type { ProjectDocs } from './project-docs';
import {
  DOCS_UNAVAILABLE_CODE,
  DOCS_UNAVAILABLE_MESSAGE,
  DocsUnavailableErrorSchema,
} from './search-route';

/**
 * `GET /api/docs/status`: the semantic search status of the project's documentation, in the contract
 * of `nevo-specflow docs semantic status --json`: the mode a search answers in and why, the
 * configured endpoint (never a key) and one probe of it, the index against the current documents
 * and who is updating it, with the progress of a running full refresh. It reports and never starts
 * a refresh; semantic search that is enabled but unusable is `failed: true` in a `200` answer.
 */
export const docsStatusEndpoint: FastifyPluginCallback<{
  readonly docs: ProjectDocs | undefined;
}> = (app, { docs }, done) => {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/api/docs/status',
    {
      // The same access as the search: any principal holding `docs.search` in any scope.
      preHandler: requireCapabilityInAnyScope({
        resource: DocsCapabilities,
        capability: DocsCapabilities.capabilities.Search,
      }),
      schema: {
        tags: ['Documentation'],
        summary: 'Read the semantic search status of the documentation',
        response: {
          200: contractRef(DocsStatusSchema),
          401: contractRef(AuthenticationRequiredErrorResponseSchema),
          403: contractRef(AuthorizationForbiddenErrorResponseSchema),
          503: DocsUnavailableErrorSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const unavailable = () =>
        reply.code(503).send({ error: DOCS_UNAVAILABLE_MESSAGE, code: DOCS_UNAVAILABLE_CODE });
      if (docs === undefined) {
        return unavailable();
      }

      try {
        return await docs.status();
      } catch (error) {
        if (error instanceof DocsConfigError || error instanceof DocsCorpusInvalidError) {
          request.log.warn({ err: error }, DOCS_UNAVAILABLE_MESSAGE);

          return unavailable();
        }

        throw error;
      }
    },
  );
  done();
};

import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { WorkspaceDocsTreeSchema } from '@nevo/specflow-contracts/docs';
import type { FastifyPluginCallback } from 'fastify';

import { requireDocsView } from '../access';
import {
  noStore,
  replyWithDocsError,
  replyWithWorkspaceFailure,
  workspaceDocsErrorResponses,
  WorkspaceDocsParamsSchema,
  type WorkspaceDocsEndpointOptions,
} from '../route-support';

/**
 * `GET /api/workspaces/:workspaceId/docs` (ADR 0022 §1): the active documents of the workspace's
 * documentation, its root index document, the inactive documents and the skipped ones, from one
 * read of the corpus.
 */
export const docsTreeEndpoint: FastifyPluginCallback<WorkspaceDocsEndpointOptions> = (
  app,
  { operations, projectId },
  done,
) => {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/api/workspaces/:workspaceId/docs',
    {
      onRequest: noStore,
      preHandler: requireDocsView(projectId),
      schema: {
        tags: ['Documentation'],
        summary: "List a workspace's documentation",
        params: WorkspaceDocsParamsSchema,
        response: { 200: WorkspaceDocsTreeSchema, ...workspaceDocsErrorResponses },
      },
    },
    async (request, reply) => {
      if (operations === undefined) {
        return replyWithDocsError(reply, 'DOCS_UNAVAILABLE');
      }

      const read = await operations.tree(request.params.workspaceId);
      if (read.kind !== 'ok') {
        return replyWithWorkspaceFailure(reply, read);
      }

      const tree = read.value;

      return reply.code(200).send({
        workspaceId: read.workspaceId,
        corpusRevision: tree.revision,
        ...(tree.rootIndexDocumentId === undefined
          ? {}
          : { rootIndexDocumentId: tree.rootIndexDocumentId }),
        documents: [...tree.documents],
        inactive: [...tree.inactive],
        skipped: [...tree.skipped],
      });
    },
  );
  done();
};

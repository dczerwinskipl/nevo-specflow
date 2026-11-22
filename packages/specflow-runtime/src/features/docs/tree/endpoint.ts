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
        description:
          "List documentation from this registered, verified workspace's own docs.root and docs.yaml. Requires docs.view at trusted {projectId} before workspace lookup. Returns active, inactive and skipped documents, with corpusRevision: an opaque content/settings digest (not Git HEAD/ETag). All paths are relative to docs.root; no conditional HTTP ETag is supported. Unregistered workspace is 404 DOCS_WORKSPACE_NOT_FOUND, inaccessible/closing checkout 409 DOCS_WORKSPACE_UNAVAILABLE, invalid docs root/settings 503 DOCS_NOT_CONFIGURED or DOCS_UNAVAILABLE. Demo mode without project documentation is 503 DOCS_NOT_SERVED. Cache-Control: no-store.",
        params: WorkspaceDocsParamsSchema,
        response: { 200: WorkspaceDocsTreeSchema, ...workspaceDocsErrorResponses },
      },
    },
    async (request, reply) => {
      if (operations === undefined) {
        return replyWithDocsError(reply, 'DOCS_NOT_SERVED');
      }

      const read = await operations.tree(request.params.workspaceId);
      if (read.kind !== 'ok') {
        return replyWithWorkspaceFailure(reply, read);
      }

      const tree = read.value;

      return reply.code(200).send({
        workspaceId: read.workspaceId,
        corpusRevision: tree.revision,
        docsRoot: read.docsRoot,
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

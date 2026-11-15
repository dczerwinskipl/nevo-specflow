import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  DocsDocumentInactiveErrorSchema,
  DocsDocumentNotFoundErrorSchema,
  DocsDocumentSkippedErrorSchema,
  WorkspaceDocsArticleSchema,
  WorkspaceDocsErrorSchema,
} from '@nevo/specflow-contracts/docs';
import type { FastifyPluginCallback } from 'fastify';
import { Type } from 'typebox';

import { contractRef } from '../../../server/shared-contracts';
import { requireDocsView } from '../access';
import {
  noStore,
  replyWithDocsError,
  replyWithWorkspaceFailure,
  workspaceDocsErrorResponses,
  WorkspaceDocsParamsSchema,
  type WorkspaceDocsEndpointOptions,
} from '../route-support';

const ArticleParamsSchema = Type.Object(
  {
    ...WorkspaceDocsParamsSchema.properties,
    documentId: Type.String({ minLength: 1, maxLength: 500 }),
  },
  { additionalProperties: false },
);

const INACTIVE_MESSAGE = 'The document is deprecated or superseded.';
const NOT_FOUND_MESSAGE = 'The workspace has no document with this id.';
const SKIPPED_MESSAGE =
  'The document is left out of the documentation: its frontmatter is invalid or its id is duplicated.';

/**
 * `GET /api/workspaces/:workspaceId/docs/documents/:documentId` (ADR 0022 §1): the document's
 * metadata and Markdown body from one read of its file, its sections and its related documents'
 * states. A deprecated or superseded document answers `410` with its successor when known; an id
 * of a skipped document `404 DOCS_DOCUMENT_SKIPPED` with the reasons; an unknown id, or a file that
 * changed while it was read, `404 DOCS_DOCUMENT_NOT_FOUND`.
 */
export const docsArticleEndpoint: FastifyPluginCallback<WorkspaceDocsEndpointOptions> = (
  app,
  { operations, projectId },
  done,
) => {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/api/workspaces/:workspaceId/docs/documents/:documentId',
    {
      onRequest: noStore,
      preHandler: requireDocsView(projectId),
      schema: {
        tags: ['Documentation'],
        summary: 'Read a document of a workspace',
        params: ArticleParamsSchema,
        response: {
          200: WorkspaceDocsArticleSchema,
          ...workspaceDocsErrorResponses,
          404: Type.Union([
            contractRef(WorkspaceDocsErrorSchema),
            DocsDocumentNotFoundErrorSchema,
            DocsDocumentSkippedErrorSchema,
          ]),
          410: DocsDocumentInactiveErrorSchema,
        },
      },
    },
    async (request, reply) => {
      if (operations === undefined) {
        return replyWithDocsError(reply, 'DOCS_UNAVAILABLE');
      }

      const { workspaceId, documentId } = request.params;
      const read = await operations.article(workspaceId, documentId);
      if (read.kind !== 'ok') {
        return replyWithWorkspaceFailure(reply, read);
      }

      const { article, skipped } = read.value;
      // Every refusal of a document names the corpus it was decided in (ADR 0022 §4).
      const corpus = { workspaceId: read.workspaceId, corpusRevision: article.revision };
      switch (article.kind) {
        case 'active':
          return reply.code(200).send({
            ...corpus,
            document: {
              ...article.document,
              areas: [...article.document.areas],
              tags: [...article.document.tags],
              related: [...article.document.related],
            },
            body: article.body,
            sections: article.sections.map((section) => ({
              ...section,
              headingPath: [...section.headingPath],
            })),
            skipped: [...skipped],
          });
        case 'inactive':
          return reply.code(410).send({
            error: INACTIVE_MESSAGE,
            ...corpus,
            code: 'DOCS_DOCUMENT_INACTIVE',
            status: article.status,
            ...(article.supersededBy === undefined ? {} : { supersededBy: article.supersededBy }),
          });
        case 'skipped':
          return reply.code(404).send({
            error: SKIPPED_MESSAGE,
            ...corpus,
            code: 'DOCS_DOCUMENT_SKIPPED',
            skipped: [...article.skipped],
          });
        case 'not-found':
          return reply
            .code(404)
            .send({ error: NOT_FOUND_MESSAGE, ...corpus, code: 'DOCS_DOCUMENT_NOT_FOUND' });
      }
    },
  );
  done();
};

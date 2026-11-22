import { Type } from 'typebox';
import type { FastifyPluginCallback } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  DocumentContentSchema,
  DocumentQuerySchema,
  DocumentTreeSchema,
  SpecIdSchema,
  SpecificationDocumentParamsSchema,
} from '@nevo/specflow-contracts/documents';

import { DocumentError } from '@nevo/specflow-engine';

import { matchesEtag, sendNotModified } from '../../../server/etag';
import {
  documentReadErrorResponses,
  documentRoute,
  replyWithDocumentFailure,
  viewGuard,
  type DocumentReadEndpointOptions,
} from './route-support';

export const DocumentTreeParamsSchema = Type.Object(
  { specId: SpecIdSchema },
  { additionalProperties: false },
);

export const documentContentEndpoint: FastifyPluginCallback<DocumentReadEndpointOptions> = (
  app,
  options,
  done,
) => {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();

  typed.get(
    '/api/specs/:specId/document-tree',
    {
      preHandler: viewGuard(options.projectId),
      schema: {
        tags: ['Documents'],
        summary: 'Read the document tree of a Specification',
        description:
          'Read the Engine-owned Specification document tree from its manifest, registered files and bounded unclassified discovery. Requires spec.view. Includes completeness, dangling/missing files, commit state and action availability computed from current policy. Tree ETag changes when document/commit projection changes; If-None-Match may return 304. A read does not invoke Git or attempt a commit. Paths are relative to the Specification folder; unavailable archive or checkout returns typed errors. Cache-Control: no-store.',
        params: DocumentTreeParamsSchema,
        response: { 200: DocumentTreeSchema, 304: Type.Null(), ...documentReadErrorResponses },
      },
    },
    documentRoute(async (request, reply) => {
      const source = options.source;
      if (!source?.readTree) {
        return replyWithDocumentFailure(unavailable(), reply);
      }

      const tree = await source.readTree(request.params.specId);
      const etag = `"${tree.revision}"`;
      reply.header('ETag', etag);
      if (matchesEtag(request.headers['if-none-match'], etag)) {
        return sendNotModified(reply);
      }

      return reply.code(200).send(tree);
    }),
  );

  typed.get(
    '/api/specs/:specId/documents/:documentId',
    {
      preHandler: viewGuard(options.projectId),
      schema: {
        tags: ['Documents'],
        summary: 'Read a document',
        description:
          'Read one registered or unclassified Specification document by id. Requires spec.view. Optional revision requests exactly that version; unavailable revision is 409 DOCUMENT_REVISION_UNAVAILABLE, never a fallback to latest. Text is returned as JSON; image/binary content has metadata only and is read through the raw route. Response ETag covers the revision; If-None-Match may answer 304. Client selection follows the returned id after classifying an unregistered file.',
        params: SpecificationDocumentParamsSchema,
        querystring: DocumentQuerySchema,
        response: { 200: DocumentContentSchema, ...documentReadErrorResponses },
      },
    },
    documentRoute(async (request, reply) => {
      if (!options.source) {
        return replyWithDocumentFailure(unavailable(), reply);
      }

      const { specId, documentId } = request.params;
      const content = await options.source.read(specId, documentId, request.query.revision);
      // An adapter must answer for the document that was asked for; anything else is a defect.
      if (content.id !== documentId) {
        return replyWithDocumentFailure(unavailable(), reply);
      }

      return reply.code(200).send(content);
    }),
  );
  done();
};

/** A route whose source method is absent is an unavailable source, like an unreadable manifest. */
function unavailable(): DocumentError {
  return new DocumentError('SPEC_SOURCE_UNAVAILABLE', 'The document source is unavailable.');
}

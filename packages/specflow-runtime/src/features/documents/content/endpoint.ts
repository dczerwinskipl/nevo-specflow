import { Type } from 'typebox';
import type { FastifyPluginCallback } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  DocumentContentSchema,
  DocumentQuerySchema,
  DocumentTreeSchema,
  IdSchema,
  SpecificationDocumentParamsSchema,
} from '@nevo/specflow-contracts/documents';

import { DocumentError } from '@nevo/specflow-engine';

import { matchesEtag, sendNotModified } from '../../../server/etag';
import type { DocumentReadSource } from './document-read-source';
import {
  documentReadErrorResponses,
  documentRoute,
  replyWithDocumentFailure,
  viewGuard,
} from './route-support';

export const DocumentTreeParamsSchema = Type.Object(
  { specId: IdSchema },
  { additionalProperties: false },
);

export const documentContentEndpoint: FastifyPluginCallback<{ source?: DocumentReadSource }> = (
  app,
  options,
  done,
) => {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();

  typed.get(
    '/api/specs/:specId/document-tree',
    {
      preHandler: viewGuard(),
      schema: {
        params: DocumentTreeParamsSchema,
        response: { 200: DocumentTreeSchema, 304: Type.Null(), ...documentReadErrorResponses },
      },
    },
    documentRoute(async (request, reply) => {
      const source = options.source;
      if (!source?.readTree) return replyWithDocumentFailure(unavailable(), reply);
      const tree = await source.readTree(request.params.specId);
      const etag = `"${tree.revision}"`;
      reply.header('ETag', etag);
      if (matchesEtag(request.headers['if-none-match'], etag)) return sendNotModified(reply);
      return reply.code(200).send(tree);
    }),
  );

  typed.get(
    '/api/specs/:specId/documents/:documentId',
    {
      preHandler: viewGuard(),
      schema: {
        params: SpecificationDocumentParamsSchema,
        querystring: DocumentQuerySchema,
        response: { 200: DocumentContentSchema, ...documentReadErrorResponses },
      },
    },
    documentRoute(async (request, reply) => {
      if (!options.source) return replyWithDocumentFailure(unavailable(), reply);
      const { specId, documentId } = request.params;
      const content = await options.source.read(specId, documentId, request.query.revision);
      // An adapter must answer for the document that was asked for; anything else is a defect.
      if (content.id !== documentId) return replyWithDocumentFailure(unavailable(), reply);
      return reply.code(200).send(content);
    }),
  );
  done();
};

/** A route whose source method is absent is an unavailable source, like an unreadable manifest. */
function unavailable(): DocumentError {
  return new DocumentError('SPEC_SOURCE_UNAVAILABLE', 'The document source is unavailable.');
}

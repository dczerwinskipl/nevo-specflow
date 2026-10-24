import { Type } from 'typebox';
import type { FastifyPluginCallback } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { SpecificationDocumentParamsSchema } from '@nevo/specflow-contracts/documents';
import { DocumentError } from '@nevo/specflow-engine';

import { matchesEtag, sendNotModified } from '../../../server/etag';
import { documentReadErrorResponses, replyWithDocumentFailure, viewGuard } from './endpoint';
import { rawEtag, rawNotModifiedHeaders, rawResponseHeaders } from './raw-headers';
import type { DocumentReadSource } from './document-read-source';

const RawQuerySchema = Type.Object(
  { download: Type.Optional(Type.Union([Type.Literal('0'), Type.Literal('1')])) },
  { additionalProperties: false },
);

/**
 * `GET /api/specs/:specId/documents/:documentId/raw[?download=1]`: the file bytes with the safe
 * headers of the reference. Every check that can refuse happens before the first byte is sent; the
 * stream is destroyed (releasing the file) on a 304, on a client abort and on any error.
 */
export const rawDocumentEndpoint: FastifyPluginCallback<{ source?: DocumentReadSource }> = (
  app,
  options,
  done,
) => {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/api/specs/:specId/documents/:documentId/raw',
    {
      preHandler: viewGuard(),
      schema: {
        params: SpecificationDocumentParamsSchema,
        querystring: RawQuerySchema,
        // The 200 payload is a byte stream: it is sent as is and never serialized.
        response: { 200: Type.Any(), 304: Type.Null(), ...documentReadErrorResponses },
      },
    },
    async (request, reply) => {
      let opened;
      try {
        const source = options.source;
        if (!source?.open) {
          throw new DocumentError('SPEC_SOURCE_UNAVAILABLE', 'The document source is unavailable.');
        }
        opened = await source.open(request.params.specId, request.params.documentId);
      } catch (error) {
        return replyWithDocumentFailure(error, reply);
      }

      if (matchesEtag(request.headers['if-none-match'], rawEtag(opened.metadata.revision))) {
        opened.stream.destroy();
        return sendNotModified(reply.headers(rawNotModifiedHeaders(opened.metadata.revision)));
      }
      // A client that goes away mid-transfer releases the file even if the framework does not.
      reply.raw.once('close', () => {
        if (!opened.stream.destroyed) opened.stream.destroy();
      });
      return reply
        .headers(
          rawResponseHeaders({
            metadata: opened.metadata,
            download: request.query.download === '1',
          }),
        )
        .code(200)
        .send(opened.stream);
    },
  );
  done();
};

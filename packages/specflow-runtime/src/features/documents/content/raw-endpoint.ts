import { Type } from 'typebox';
import type { FastifyPluginCallback } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { SpecificationDocumentParamsSchema } from '@nevo/specflow-contracts/documents';
import { DocumentError } from '@nevo/specflow-engine';

import { matchesEtag, sendNotModified } from '../../../server/etag';
import {
  documentReadErrorResponses,
  documentRoute,
  viewGuard,
  type DocumentReadEndpointOptions,
} from './route-support';
import { rawEtag, rawNotModifiedHeaders, rawResponseHeaders } from './raw-headers';

const RawQuerySchema = Type.Object(
  {
    download: Type.Optional(
      Type.Union([Type.Literal('0'), Type.Literal('1')], {
        description:
          '0 requests safe inline rendering of approved image formats; 1 forces attachment download. Other values are invalid.',
      }),
    ),
  },
  { additionalProperties: false },
);

/**
 * `GET /api/specs/:specId/documents/:documentId/raw[?download=1]`: the file bytes with the safe
 * headers of the reference. Every check that can refuse happens before the first byte is sent; the
 * stream is destroyed (releasing the file) on a 304, on a client abort and on any error.
 */
export const rawDocumentEndpoint: FastifyPluginCallback<DocumentReadEndpointOptions> = (
  app,
  options,
  done,
) => {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/api/specs/:specId/documents/:documentId/raw',
    {
      preHandler: viewGuard(options.projectId),
      config: {
        openApiResponses: {
          200: {
            description:
              'Raw content bytes of the requested document revision. The actual Content-Type depends on the file; unsafe formats are forced to attachment. The bytes are streamed without JSON serialization.',
            mediaType: '*/*',
            headers: {
              'Content-Type': 'Validated MIME type of the document bytes.',
              'Content-Disposition': 'Safe inline/attachment disposition and sanitized filename.',
              'Content-Length': 'Size of the streamed content in bytes.',
              'X-Content-Type-Options': 'nosniff; browser content-type protection.',
              'Content-Security-Policy': 'Sandbox policy for inline content.',
              ETag: 'Strong content revision validator.',
            },
          },
        },
      },
      schema: {
        tags: ['Documents'],
        summary: 'Read the raw content of a document',
        description:
          'Stream raw image or binary/text bytes for a document under spec.view, with validated safe Content-Type, Content-Disposition, Content-Length, X-Content-Type-Options and sandbox CSP. Query download accepts only 0 or 1; default safe inline for approved images, forced attachment for non-image or download=1. The stream is released on 304/abort/error, and all authorization/validation happens before sending bytes. A strong ETag permits If-None-Match/304. SVG has image media type to allow img rendering but sandbox CSP prevents script execution as a page.',
        params: SpecificationDocumentParamsSchema,
        querystring: RawQuerySchema,
        response: { 304: Type.Null(), ...documentReadErrorResponses },
      },
    },
    documentRoute(async (request, reply) => {
      const source = options.source;
      if (!source?.open) {
        throw new DocumentError('SPEC_SOURCE_UNAVAILABLE', 'The document source is unavailable.');
      }

      const opened = await source.open(request.params.specId, request.params.documentId);

      if (matchesEtag(request.headers['if-none-match'], rawEtag(opened.metadata.revision))) {
        opened.stream.destroy();

        return sendNotModified(reply.headers(rawNotModifiedHeaders(opened.metadata.revision)));
      }

      // A client that goes away mid-transfer releases the file even if the framework does not.
      reply.raw.once('close', () => {
        if (!opened.stream.destroyed) {
          opened.stream.destroy();
        }
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
    }),
  );
  done();
};

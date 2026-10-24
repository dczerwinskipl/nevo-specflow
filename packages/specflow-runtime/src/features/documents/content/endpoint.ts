import { Type } from 'typebox';
import type { FastifyPluginCallback, FastifyReply } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  DocumentContentSchema,
  DocumentErrorSchema,
  DocumentQuerySchema,
  DocumentTreeSchema,
  IdSchema,
  SpecificationDocumentParamsSchema,
} from '@nevo/specflow-contracts/documents';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';

import { DocumentError } from '@nevo/specflow-engine';

import { requireCapability } from '../../auth';
import { matchesEtag } from '../../../server/etag';
import { documentFailure } from './error-status';
import type { DocumentContentSource } from './read-document';

export const DocumentTreeParamsSchema = Type.Object(
  { specId: IdSchema },
  { additionalProperties: false },
);

/** Error responses shared by the read routes. 400 is the framework's validation answer. */
export const documentReadErrorResponses = {
  401: AuthenticationRequiredErrorResponseSchema,
  403: AuthorizationForbiddenErrorResponseSchema,
  404: DocumentErrorSchema,
  409: DocumentErrorSchema,
  413: DocumentErrorSchema,
  503: DocumentErrorSchema,
} as const;

/** Answer a read failure with the `{error, code}` body, or rethrow a defect. */
export function replyWithDocumentFailure(error: unknown, reply: FastifyReply): FastifyReply {
  const failure = documentFailure(error);
  if (!failure) throw error;
  reply.header('Cache-Control', 'no-store');
  return reply.code(failure.status).send(failure.body);
}

export function viewGuard() {
  return requireCapability({
    resource: SpecCapabilities,
    capability: SpecCapabilities.capabilities.View,
    scope: (request) => ({ specId: (request.params as { specId: string }).specId }),
  });
}

export const documentContentEndpoint: FastifyPluginCallback<{ source?: DocumentContentSource }> = (
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
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      try {
        const source = options.source;
        if (!source?.readTree) return replyWithDocumentFailure(unavailable(), reply);
        const tree = await source.readTree(request.params.specId);
        const etag = `"${tree.revision}"`;
        reply.header('ETag', etag);
        // A 304 carries no body on the wire (Node drops it); null only satisfies the typed reply.
        if (matchesEtag(request.headers['if-none-match'], etag)) return reply.code(304).send(null);
        return reply.code(200).send(tree);
      } catch (error) {
        return replyWithDocumentFailure(error, reply);
      }
    },
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
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      try {
        if (!options.source) return replyWithDocumentFailure(unavailable(), reply);
        const { specId, documentId } = request.params;
        const content = await options.source.read(specId, documentId, request.query.revision);
        // An adapter must answer for the document that was asked for; anything else is a defect.
        if (content.id !== documentId) return replyWithDocumentFailure(unavailable(), reply);
        return reply.code(200).send(content);
      } catch (error) {
        return replyWithDocumentFailure(error, reply);
      }
    },
  );
  done();
};

/** A route whose source method is absent is an unavailable source, like an unreadable manifest. */
function unavailable(): DocumentError {
  return new DocumentError('SPEC_SOURCE_UNAVAILABLE', 'The document source is unavailable.');
}

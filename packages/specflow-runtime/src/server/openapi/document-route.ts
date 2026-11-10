import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance, RawServerBase } from 'fastify';
import { Type, type Static } from 'typebox';

export const OPENAPI_DOCUMENT_PATH = '/api/openapi.json';

// The document is generated from route schemas; only its stable top-level shape is declared, the
// rest passes through unchanged.
const OpenApiDocumentResponseSchema = Type.Object(
  {
    openapi: Type.Literal('3.1.0'),
    info: Type.Object({ title: Type.String(), version: Type.String() }),
    paths: Type.Record(Type.String(), Type.Unknown()),
  },
  { additionalProperties: true },
);

/** Serves the document as any other authenticated Runtime read (A-D1). */
export function registerOpenApiRoute<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
): void {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    OPENAPI_DOCUMENT_PATH,
    {
      schema: {
        tags: ['Runtime'],
        summary: 'Read this OpenAPI document',
        response: { 200: OpenApiDocumentResponseSchema },
      },
    },
    (request, reply) => {
      request.authz.requireAccess();
      reply.header('Cache-Control', 'no-store');

      return app.swagger() as Static<typeof OpenApiDocumentResponseSchema>;
    },
  );
}

import { createHash } from 'node:crypto';

import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  BatchSaveInputSchema,
  BatchSaveResultSchema,
  CreateDocumentsInputSchema,
  DocumentOperationInputSchema,
  DocumentOperationResultSchema,
  DocumentOperationStatusSchema,
  FlushInputSchema,
  FlushResultSchema,
  FolderInputSchema,
  IdSchema,
  ManualCommitInputSchema,
  ManualCommitResultSchema,
  SaveInputSchema,
  SaveResultSchema,
  SpecificationDocumentParamsSchema,
  UncommittedViewSchema,
} from '@nevo/specflow-contracts/documents';
import { DocumentError } from '@nevo/specflow-engine';
import type { FastifyPluginCallback } from 'fastify';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import { Type } from 'typebox';

import { matchesEtag, sendNotModified } from '../../../server/etag';
import {
  documentRoute,
  documentWriteErrorResponses,
  manageGuard,
  viewGuard,
} from '../content/route-support';
import {
  BATCH_SAVE_BODY_LIMIT_BYTES,
  CREATE_DOCUMENTS_BODY_LIMIT_BYTES,
  MANUAL_COMMIT_BODY_LIMIT_BYTES,
  OPERATION_BODY_LIMIT_BYTES,
  SAVE_BODY_LIMIT_BYTES,
} from './limits';
import type { DocumentWriteSource } from './write-source';

const SpecParamsSchema = Type.Object({ specId: IdSchema }, { additionalProperties: false });

/** The operation id of a path is judged by the Engine: a malformed one does not exist (404). */
const OperationParamsSchema = Type.Object(
  { specId: IdSchema, operationId: Type.String({ minLength: 1, maxLength: 100 }) },
  { additionalProperties: false },
);

/** A body that carries nothing: an absent body and `{}` are the same request. */
const EmptyBodySchema = Type.Object({}, { additionalProperties: false });

/** Opts a route into the `DOCUMENT_TOO_LARGE` answer for a body above its limit (server error handler). */
const OVERSIZED_BODY = { oversizedBodyCode: 'DOCUMENT_TOO_LARGE' } as const;

export interface DocumentWriteRoutesOptions {
  readonly source?: DocumentWriteSource;
}

/** A route whose source is absent is an unavailable source, like an unreadable manifest. */
function unavailable(): DocumentError {
  return new DocumentError('SPEC_SOURCE_UNAVAILABLE', 'The document source is unavailable.');
}

/** Strong validator over the body of a status read: it changes when the operation does. */
function statusEtag(status: unknown): string {
  return '"' + createHash('sha1').update(JSON.stringify(status)).digest('base64url') + '"';
}

/**
 * The document write routes of `docs/reference/api/specification-documents.md`: Manage for every state
 * change, View for the status read, `200` once the content is durable and its commit queued. Rules
 * (revisions, paths, limits in bytes, policy, idempotency by `operationId`) are the Engine's; the
 * routes bound the body, authorize before the body is read, and turn failures into the stable
 * `{error, code, details}` body.
 */
export const documentWriteEndpoint: FastifyPluginCallback<DocumentWriteRoutesOptions> = (
  app,
  options,
  done,
) => {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const need = (): DocumentWriteSource => {
    if (!options.source) {
      throw unavailable();
    }

    return options.source;
  };

  typed.put(
    '/api/specs/:specId/documents/:documentId',
    {
      onRequest: manageGuard(),
      bodyLimit: SAVE_BODY_LIMIT_BYTES,
      config: OVERSIZED_BODY,
      schema: {
        params: SpecificationDocumentParamsSchema,
        body: SaveInputSchema,
        response: { 200: SaveResultSchema, ...documentWriteErrorResponses },
      },
    },
    documentRoute(async (request, reply) => {
      const { specId, documentId } = request.params;

      return reply.code(200).send(await need().save(specId, documentId, request.body));
    }),
  );

  typed.post(
    '/api/specs/:specId/documents/save',
    {
      onRequest: manageGuard(),
      bodyLimit: BATCH_SAVE_BODY_LIMIT_BYTES,
      config: OVERSIZED_BODY,
      schema: {
        params: SpecParamsSchema,
        body: BatchSaveInputSchema,
        response: { 200: BatchSaveResultSchema, ...documentWriteErrorResponses },
      },
    },
    documentRoute(async (request, reply) => {
      return reply.code(200).send(await need().saveAll(request.params.specId, request.body));
    }),
  );

  typed.post(
    '/api/specs/:specId/documents',
    {
      onRequest: manageGuard(),
      bodyLimit: CREATE_DOCUMENTS_BODY_LIMIT_BYTES,
      config: OVERSIZED_BODY,
      schema: {
        params: SpecParamsSchema,
        body: CreateDocumentsInputSchema,
        response: { 200: DocumentOperationResultSchema, ...documentWriteErrorResponses },
      },
    },
    documentRoute(async (request, reply) => {
      return reply.code(200).send(await need().create(request.params.specId, request.body));
    }),
  );

  typed.post(
    '/api/specs/:specId/folders',
    {
      onRequest: manageGuard(),
      bodyLimit: OPERATION_BODY_LIMIT_BYTES,
      config: OVERSIZED_BODY,
      schema: {
        params: SpecParamsSchema,
        body: FolderInputSchema,
        response: { 200: DocumentOperationResultSchema, ...documentWriteErrorResponses },
      },
    },
    documentRoute(async (request, reply) => {
      return reply.code(200).send(await need().createFolder(request.params.specId, request.body));
    }),
  );

  typed.post(
    '/api/specs/:specId/document-operations',
    {
      onRequest: manageGuard(),
      bodyLimit: OPERATION_BODY_LIMIT_BYTES,
      config: OVERSIZED_BODY,
      schema: {
        params: SpecParamsSchema,
        body: DocumentOperationInputSchema,
        response: { 200: DocumentOperationResultSchema, ...documentWriteErrorResponses },
      },
    },
    documentRoute(async (request, reply) => {
      return reply.code(200).send(await need().operate(request.params.specId, request.body));
    }),
  );

  typed.get(
    '/api/specs/:specId/document-operations/:operationId',
    {
      onRequest: viewGuard(),
      schema: {
        params: OperationParamsSchema,
        response: {
          200: DocumentOperationStatusSchema,
          304: Type.Null(),
          ...documentWriteErrorResponses,
        },
      },
    },
    documentRoute(async (request, reply) => {
      const { specId, operationId } = request.params;
      const status = await need().status(specId, operationId);
      const etag = statusEtag(status);
      reply.header('ETag', etag);
      if (matchesEtag(request.headers['if-none-match'], etag)) {
        return sendNotModified(reply);
      }

      return reply.code(200).send(status);
    }),
  );

  typed.get(
    '/api/specs/:specId/uncommitted',
    {
      onRequest: viewGuard(),
      schema: {
        params: SpecParamsSchema,
        response: {
          200: UncommittedViewSchema,
          304: Type.Null(),
          ...documentWriteErrorResponses,
        },
      },
    },
    documentRoute(async (request, reply) => {
      const view = await need().uncommitted(request.params.specId);
      const etag = statusEtag(view);
      reply.header('ETag', etag);
      if (matchesEtag(request.headers['if-none-match'], etag)) {
        return sendNotModified(reply);
      }

      return reply.code(200).send(view);
    }),
  );

  // ADR 0018 decision 8: the ledger paths of the Specification (or of its checkout), committed now with
  // the person's message. Synchronous: the answer comes after the commit; the same operationId replays it.
  typed.post(
    '/api/specs/:specId/commit',
    {
      onRequest: manageGuard(),
      bodyLimit: MANUAL_COMMIT_BODY_LIMIT_BYTES,
      config: OVERSIZED_BODY,
      schema: {
        params: SpecParamsSchema,
        body: ManualCommitInputSchema,
        response: { 200: ManualCommitResultSchema, ...documentWriteErrorResponses },
      },
    },
    documentRoute(async (request, reply) => {
      // Scope `all` takes only the owners the caller may manage (the guard checked the path Specification).
      const canManage = (specId: string): boolean =>
        request.authz.can({
          resource: SpecCapabilities,
          capability: SpecCapabilities.capabilities.Manage,
          scope: { specId },
        });

      return reply
        .code(200)
        .send(await need().commit(request.params.specId, request.body, canManage));
    }),
  );

  for (const action of ['retry', 'abandon'] as const) {
    typed.post(
      `/api/specs/:specId/document-operations/:operationId/${action}`,
      {
        onRequest: manageGuard(),
        bodyLimit: OPERATION_BODY_LIMIT_BYTES,
        config: OVERSIZED_BODY,
        preValidation: (request, _reply, next) => {
          request.body ??= {};
          next();
        },
        schema: {
          params: OperationParamsSchema,
          body: EmptyBodySchema,
          response: { 200: DocumentOperationStatusSchema, ...documentWriteErrorResponses },
        },
      },
      documentRoute(async (request, reply) => {
        const { specId, operationId } = request.params;

        return reply.code(200).send(await need()[action](specId, operationId));
      }),
    );
  }

  typed.post(
    '/api/specs/:specId/document-commits/flush',
    {
      onRequest: manageGuard(),
      bodyLimit: OPERATION_BODY_LIMIT_BYTES,
      config: OVERSIZED_BODY,
      preValidation: (request, _reply, next) => {
        request.body ??= {};
        next();
      },
      schema: {
        params: SpecParamsSchema,
        body: FlushInputSchema,
        response: { 200: FlushResultSchema, ...documentWriteErrorResponses },
      },
    },
    documentRoute(async (request, reply) => {
      return reply.code(200).send(await need().flush(request.params.specId, request.body));
    }),
  );

  done();
};

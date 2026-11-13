import { createHash } from 'node:crypto';

import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginCallback } from 'fastify';
import { Type } from 'typebox';
import {
  CreateDocumentsInputSchema,
  DocumentContentSchema,
  DocumentOperationInputSchema,
  DocumentOperationResultSchema,
  DocumentQuerySchema,
  IdSchema,
  SaveInputSchema,
  SaveResultSchema,
  SpecIdSchema,
  TaskIdSchema,
} from '@nevo/specflow-contracts/documents';
import { TaskDocumentTreeSchema } from '@nevo/specflow-contracts/tasks';
import { DocumentError } from '@nevo/specflow-engine';

import type { ProjectIdSource } from '../../specs';
import { contractRef } from '../../../server/shared-contracts';
import { matchesEtag, sendNotModified } from '../../../server/etag';
import {
  documentReadErrorResponses,
  documentRoute,
  documentWriteErrorResponses,
  manageGuard,
  viewGuard,
} from '../content/route-support';
import {
  CREATE_DOCUMENTS_BODY_LIMIT_BYTES,
  OPERATION_BODY_LIMIT_BYTES,
  SAVE_BODY_LIMIT_BYTES,
} from '../write/limits';
import type { TaskDocumentSource } from './task-document-source';

const TaskParamsSchema = Type.Object(
  { specId: SpecIdSchema, taskId: TaskIdSchema },
  { additionalProperties: false },
);
const TaskDocumentParamsSchema = Type.Object(
  { specId: SpecIdSchema, taskId: TaskIdSchema, documentId: IdSchema },
  { additionalProperties: false },
);

/** Opts a route into the `DOCUMENT_TOO_LARGE` answer for a body above its limit (server error handler). */
const OVERSIZED_BODY = { oversizedBodyCode: 'DOCUMENT_TOO_LARGE' } as const;

export interface TaskDocumentRoutesOptions {
  /** Absent (no Engine, demo): every route answers `SPEC_SOURCE_UNAVAILABLE`. */
  readonly source?: TaskDocumentSource;
  readonly projectId?: ProjectIdSource;
}

/**
 * The documents of a Task (`reference.api.specification-documents`, "Task documents"), mirroring the
 * Specification document routes: View for the reads, Manage for the writes (checked before the body
 * is read), the stable `{error, code, details}` body for every refusal. The commit of a write and its
 * operation status follow the Specification's (`/api/specs/:specId/document-operations/...`).
 */
export const taskDocumentRoutes: FastifyPluginCallback<TaskDocumentRoutesOptions> = (
  app,
  options,
  done,
) => {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const need = (): TaskDocumentSource => {
    if (!options.source) {
      throw new DocumentError('SPEC_SOURCE_UNAVAILABLE', 'The document source is unavailable.');
    }

    return options.source;
  };

  typed.get(
    '/api/specs/:specId/tasks/:taskId/document-tree',
    {
      preHandler: viewGuard(options.projectId),
      schema: {
        tags: ['Documents'],
        summary: 'Read the documents of a Task',
        params: TaskParamsSchema,
        response: { 200: TaskDocumentTreeSchema, 304: Type.Null(), ...documentReadErrorResponses },
      },
    },
    documentRoute(async (request, reply) => {
      const { specId, taskId } = request.params;
      const tree = await need().tree(specId, taskId);
      // Over the whole listing: a file revision changes it, not only the registry.
      const etag = '"' + createHash('sha1').update(JSON.stringify(tree)).digest('base64url') + '"';
      reply.header('ETag', etag);
      if (matchesEtag(request.headers['if-none-match'], etag)) {
        return sendNotModified(reply);
      }

      return reply.code(200).send(tree);
    }),
  );

  typed.get(
    '/api/specs/:specId/tasks/:taskId/documents/:documentId',
    {
      preHandler: viewGuard(options.projectId),
      schema: {
        tags: ['Documents'],
        summary: 'Read a Task document',
        params: TaskDocumentParamsSchema,
        querystring: DocumentQuerySchema,
        response: { 200: DocumentContentSchema, ...documentReadErrorResponses },
      },
    },
    documentRoute(async (request, reply) => {
      const { specId, taskId, documentId } = request.params;
      const content = await need().read(specId, taskId, documentId, request.query.revision);
      // An adapter must answer for the document that was asked for; anything else is a defect.
      if (content.id !== documentId) {
        throw new DocumentError('SPEC_SOURCE_UNAVAILABLE', 'The document source is unavailable.');
      }

      return reply.code(200).send(content);
    }),
  );

  typed.put(
    '/api/specs/:specId/tasks/:taskId/documents/:documentId',
    {
      onRequest: manageGuard(options.projectId),
      bodyLimit: SAVE_BODY_LIMIT_BYTES,
      config: OVERSIZED_BODY,
      schema: {
        tags: ['Documents'],
        summary: 'Write a Task document',
        params: TaskDocumentParamsSchema,
        body: SaveInputSchema,
        response: { 200: SaveResultSchema, ...documentWriteErrorResponses },
      },
    },
    documentRoute(async (request, reply) => {
      const { specId, taskId, documentId } = request.params;

      return reply.code(200).send(await need().save(specId, taskId, documentId, request.body));
    }),
  );

  typed.post(
    '/api/specs/:specId/tasks/:taskId/documents',
    {
      onRequest: manageGuard(options.projectId),
      bodyLimit: CREATE_DOCUMENTS_BODY_LIMIT_BYTES,
      config: OVERSIZED_BODY,
      schema: {
        tags: ['Documents'],
        summary: 'Add a Task document',
        params: TaskParamsSchema,
        body: CreateDocumentsInputSchema,
        response: {
          200: contractRef(DocumentOperationResultSchema),
          ...documentWriteErrorResponses,
        },
      },
    },
    documentRoute(async (request, reply) => {
      const { specId, taskId } = request.params;

      return reply.code(200).send(await need().create(specId, taskId, request.body));
    }),
  );

  typed.post(
    '/api/specs/:specId/tasks/:taskId/document-operations',
    {
      onRequest: manageGuard(options.projectId),
      bodyLimit: OPERATION_BODY_LIMIT_BYTES,
      config: OVERSIZED_BODY,
      schema: {
        tags: ['Documents'],
        summary: 'Start a Task document operation',
        params: TaskParamsSchema,
        body: DocumentOperationInputSchema,
        response: {
          200: contractRef(DocumentOperationResultSchema),
          ...documentWriteErrorResponses,
        },
      },
    },
    documentRoute(async (request, reply) => {
      const { specId, taskId } = request.params;

      return reply.code(200).send(await need().operate(specId, taskId, request.body));
    }),
  );

  done();
};

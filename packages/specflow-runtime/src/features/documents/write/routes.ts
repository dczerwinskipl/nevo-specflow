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
  ManualCommitInputSchema,
  ManualCommitResultSchema,
  SaveInputSchema,
  SaveResultSchema,
  SpecIdSchema,
  SpecificationDocumentParamsSchema,
  UncommittedViewSchema,
} from '@nevo/specflow-contracts/documents';
import { DocumentError } from '@nevo/specflow-engine';
import type { FastifyPluginCallback } from 'fastify';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import { specScope, type ProjectIdSource } from '../../specs';
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
import { contractRef } from '../../../server/shared-contracts';

const SpecParamsSchema = Type.Object({ specId: SpecIdSchema }, { additionalProperties: false });

/** The operation id of a path is judged by the Engine: a malformed one does not exist (404). */
const OperationParamsSchema = Type.Object(
  { specId: SpecIdSchema, operationId: Type.String({ minLength: 1, maxLength: 100 }) },
  { additionalProperties: false },
);

/** A body that carries nothing: an absent body and `{}` are the same request. */
const EmptyBodySchema = Type.Object({}, { additionalProperties: false });

/** Opts a route into the `DOCUMENT_TOO_LARGE` answer for a body above its limit (server error handler). */
const OVERSIZED_BODY = { oversizedBodyCode: 'DOCUMENT_TOO_LARGE' } as const;

export interface DocumentWriteRoutesOptions {
  readonly source?: DocumentWriteSource;
  /** The Runtime's project; see `specScope`. */
  readonly projectId?: ProjectIdSource;
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
      onRequest: manageGuard(options.projectId),
      bodyLimit: SAVE_BODY_LIMIT_BYTES,
      config: OVERSIZED_BODY,
      schema: {
        tags: ['Documents'],
        summary: 'Write a document',
        description:
          'Save a text document with operationId and expectedRevision under spec.manage. One successful 200 means disk write accepted and commit queued, NOT that Git commit finished. Revision conflict writes nothing and leaves draft unchanged. A fresh user action gets a fresh operationId; unchanged request replay retains the same id. Commit status may be pending/committed/failed/uncommitted/not-applicable. Autosave backs off on SPEC_BUSY and retryAfterMs.',
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
      onRequest: manageGuard(options.projectId),
      bodyLimit: BATCH_SAVE_BODY_LIMIT_BYTES,
      config: OVERSIZED_BODY,
      schema: {
        tags: ['Documents'],
        summary: 'Save several documents',
        description:
          'Save 1..25 documents together under spec.manage; check every expectedRevision before any writes. Revision conflict returns details.conflicts and writes none. A successful 200 means all file writes are durable, with one queued commit (or uncommitted in manual mode), not a completed Git commit. Reuse operationId only for identical uncertain retry.',
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
      onRequest: manageGuard(options.projectId),
      bodyLimit: CREATE_DOCUMENTS_BODY_LIMIT_BYTES,
      config: OVERSIZED_BODY,
      schema: {
        tags: ['Documents'],
        summary: 'Add a document',
        description:
          'Create registered documents from current project definitions/templates or caller text under spec.manage. The Engine owns path/type identity, template selection, title derivation and case-collision/size checks. A write result includes revision and commit status. Unknown template/type or path conflict is a typed refusal; action must not write a partial document set.',
        params: SpecParamsSchema,
        body: CreateDocumentsInputSchema,
        response: {
          200: contractRef(DocumentOperationResultSchema),
          ...documentWriteErrorResponses,
        },
      },
    },
    documentRoute(async (request, reply) => {
      return reply.code(200).send(await need().create(request.params.specId, request.body));
    }),
  );

  typed.post(
    '/api/specs/:specId/folders',
    {
      onRequest: manageGuard(options.projectId),
      bodyLimit: OPERATION_BODY_LIMIT_BYTES,
      config: OVERSIZED_BODY,
      schema: {
        tags: ['Documents'],
        summary: 'Add a document folder',
        description:
          'Create one folder in the Specification document tree under spec.manage. Engine validates rooted relative path, case collisions, protected root, folders/files and Windows host path length. Folder revision is a precondition for subsequent moves/renames. Returns structured operation result.',
        params: SpecParamsSchema,
        body: FolderInputSchema,
        response: {
          200: contractRef(DocumentOperationResultSchema),
          ...documentWriteErrorResponses,
        },
      },
    },
    documentRoute(async (request, reply) => {
      return reply.code(200).send(await need().createFolder(request.params.specId, request.body));
    }),
  );

  typed.post(
    '/api/specs/:specId/document-operations',
    {
      onRequest: manageGuard(options.projectId),
      bodyLimit: OPERATION_BODY_LIMIT_BYTES,
      config: OVERSIZED_BODY,
      schema: {
        tags: ['Documents'],
        summary: 'Start a document operation',
        description:
          'Rename, move, delete or classify a registered/unclassified document or folder under spec.manage. OperationId is idempotency key; expectedRevision and path constraints are rechecked. A classified u- document receives a new registered id; clients follow the returned identity. Commit state is independent of whether disk write succeeded.',
        params: SpecParamsSchema,
        body: DocumentOperationInputSchema,
        response: {
          200: contractRef(DocumentOperationResultSchema),
          ...documentWriteErrorResponses,
        },
      },
    },
    documentRoute(async (request, reply) => {
      return reply.code(200).send(await need().operate(request.params.specId, request.body));
    }),
  );

  typed.get(
    '/api/specs/:specId/document-operations/:operationId',
    {
      onRequest: viewGuard(options.projectId),
      schema: {
        tags: ['Documents'],
        summary: 'Read a document operation',
        description:
          'Read status of one document change and its asynchronous commit without mutating or flushing the queue. A strong operation ETag supports If-None-Match/304. Pending, failed, recovery-required, uncommitted, committed and not-applicable carry typed causes and retry/abandon capabilities. Not the same as the generic Specification Create operation status.',
        params: OperationParamsSchema,
        response: {
          200: contractRef(DocumentOperationStatusSchema),
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
      onRequest: viewGuard(options.projectId),
      schema: {
        tags: ['Documents'],
        summary: 'Read the uncommitted document changes',
        description:
          'Read the Engine-owned uncommitted-change ledger and effective document commit policy for this Specification under spec.view. Includes owner/scopes, reasons and safe checkout-relative paths; no absolute machine paths. A missing or empty ledger is not proof that arbitrary Git changes are clean.',
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
      onRequest: manageGuard(options.projectId),
      bodyLimit: MANUAL_COMMIT_BODY_LIMIT_BYTES,
      config: OVERSIZED_BODY,
      schema: {
        tags: ['Documents'],
        summary: 'Commit document changes',
        description:
          'Commit an authorized set of currently uncommitted ledger paths under spec.manage, using operationId and the current ledger revision. Reject stale or non-closed subsets rather than committing unrelated documents/Task/definitions. The message and selected entries must obey server limits. Replay identical operationId without a second Git side effect. A 200 means the Git commit completed.',
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
          scope: specScope(options.projectId?.(), specId),
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
        onRequest: manageGuard(options.projectId),
        bodyLimit: OPERATION_BODY_LIMIT_BYTES,
        config: OVERSIZED_BODY,
        preValidation: (request, _reply, next) => {
          request.body ??= {};
          next();
        },
        schema: {
          tags: ['Documents'],
          summary:
            action === 'retry' ? 'Retry a document operation' : 'Abandon a document operation',
          description:
            action === 'retry'
              ? 'Explicitly retry the failed commit of a previously recorded document operation under spec.manage. Engine rechecks the checkout, current content and Git policy and may still refuse; retry does not rewrite the saved document or silently override newer external edits.'
              : 'Abandon a failed document commit batch, not its already saved file content. Files remain in the worktree and are reported as uncommitted with reason abandoned; a later manual/Git commit or authorized recovery is needed for Close.',
          params: OperationParamsSchema,
          body: EmptyBodySchema,
          response: {
            200: contractRef(DocumentOperationStatusSchema),
            ...documentWriteErrorResponses,
          },
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
      onRequest: manageGuard(options.projectId),
      bodyLimit: OPERATION_BODY_LIMIT_BYTES,
      config: OVERSIZED_BODY,
      preValidation: (request, _reply, next) => {
        request.body ??= {};
        next();
      },
      schema: {
        tags: ['Documents'],
        summary: 'Flush the queued document commits',
        description:
          'Flush pending document commit work for this Specification, under spec.manage. This is a commit-queue operation, not a document save; failed/held operations still need explicit recovery. Serializes with other commit jobs and respects Git protection.',
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

import { Type } from 'typebox';
import type { FastifyInstance, RawServerBase } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  DemoCreateDocumentsInputSchema,
  DemoDocumentErrorSchema,
  DemoDocumentOperationInputSchema,
  DemoDocumentOperationResultSchema,
  DemoFolderInputSchema,
  DemoSaveInputSchema,
  DemoSaveResultSchema,
} from '@nevo/specflow-contracts/demo';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import type { DemoCatalogue } from '../../demo-catalogue';
import {
  DEMO_DOCUMENT_BATCH_BODY_LIMIT,
  DEMO_DOCUMENT_SAVE_BODY_LIMIT,
  DemoId,
  DemoSpecParams,
} from '../../../demo/http';
import type { RequestAuthorization } from '../../auth';
import type { FastifyReply } from 'fastify';
import { replyWithDocumentFailure } from '../content/route-support';
import type { DemoDocuments } from './operations';

const DocumentParams = Type.Object({ specId: DemoId, documentId: DemoId });

/** Every refusal of a demo write is the real `{ error, code, details? }` body. */
const writeErrors = {
  400: Type.Union([
    DemoDocumentErrorSchema,
    Type.Object({
      statusCode: Type.Literal(400),
      error: Type.Literal('Bad Request'),
      message: Type.String(),
    }),
  ]),
  401: AuthenticationRequiredErrorResponseSchema,
  403: AuthorizationForbiddenErrorResponseSchema,
  404: DemoDocumentErrorSchema,
  409: DemoDocumentErrorSchema,
  413: DemoDocumentErrorSchema,
  415: DemoDocumentErrorSchema,
  422: DemoDocumentErrorSchema,
  503: DemoDocumentErrorSchema,
};

/**
 * Runs a write and answers a document failure with the real `{ error, code, details? }` body (every
 * failure status is declared by `writeErrors`); any other error is a defect and propagates.
 */
async function answer<T>(reply: unknown, work: () => Promise<T>): Promise<T | FastifyReply> {
  const typed = reply as FastifyReply;
  typed.header('Cache-Control', 'no-store');
  try {
    return await work();
  } catch (error) {
    return replyWithDocumentFailure(error, typed);
  }
}

/** Every write needs the Manage capability on the Specification in the path. */
function requireManage(authz: RequestAuthorization, specId: string) {
  authz.require({
    resource: SpecCapabilities,
    capability: SpecCapabilities.capabilities.Manage,
    scope: { specId },
  });
}

/**
 * Documents-owned demo write endpoints: the D4 operations the real backend does not serve yet,
 * emulated over the demo directories with the contract's shapes (save, create documents and
 * folders, rename/move/delete/classify). The reads are the real routes over the demo read source.
 */
export function registerDemoDocumentRoutes<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
  documents: DemoDocuments,
  catalogue: DemoCatalogue,
) {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const find = (specId: string) => catalogue.find(specId);

  typed.put(
    '/api/demo/specs/:specId/documents/:documentId',
    {
      bodyLimit: DEMO_DOCUMENT_SAVE_BODY_LIMIT,
      schema: {
        params: DocumentParams,
        body: DemoSaveInputSchema,
        response: { 200: DemoSaveResultSchema, ...writeErrors },
      },
    },
    async (request, reply) =>
      answer(reply, async () => {
        const { specId, documentId } = request.params;
        requireManage(request.authz, specId);
        const subject = request.authz.readContext().subject;
        return documents.save(subject, specId, documentId, request.body, find);
      }),
  );
  typed.post(
    '/api/demo/specs/:specId/documents',
    {
      bodyLimit: DEMO_DOCUMENT_BATCH_BODY_LIMIT,
      schema: {
        params: DemoSpecParams,
        body: DemoCreateDocumentsInputSchema,
        response: { 200: DemoDocumentOperationResultSchema, ...writeErrors },
      },
    },
    async (request, reply) =>
      answer(reply, async () => {
        const { specId } = request.params;
        requireManage(request.authz, specId);
        return documents.create(request.authz.readContext().subject, specId, request.body, find);
      }),
  );
  typed.post(
    '/api/demo/specs/:specId/folders',
    {
      schema: {
        params: DemoSpecParams,
        body: DemoFolderInputSchema,
        response: { 200: DemoDocumentOperationResultSchema, ...writeErrors },
      },
    },
    async (request, reply) =>
      answer(reply, async () => {
        const { specId } = request.params;
        requireManage(request.authz, specId);
        const subject = request.authz.readContext().subject;
        return documents.createFolder(subject, specId, request.body, find);
      }),
  );
  typed.post(
    '/api/demo/specs/:specId/document-operations',
    {
      schema: {
        params: DemoSpecParams,
        body: DemoDocumentOperationInputSchema,
        response: { 200: DemoDocumentOperationResultSchema, ...writeErrors },
      },
    },
    async (request, reply) =>
      answer(reply, async () => {
        const { specId } = request.params;
        requireManage(request.authz, specId);
        return documents.operate(request.authz.readContext().subject, specId, request.body, find);
      }),
  );
}

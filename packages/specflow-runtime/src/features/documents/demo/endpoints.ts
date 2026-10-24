import { Type } from 'typebox';
import type { FastifyInstance, RawServerBase } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  DemoDocumentTreeSchema,
  DemoDocumentOperationInputSchema,
  DemoDocumentOperationResultSchema,
  DemoDocumentsInputSchema,
  DemoDocumentsResultSchema,
  DemoFolderInputSchema,
  DemoFolderResultSchema,
  DemoSaveInputSchema,
  DemoSaveResultSchema,
} from '@nevo/specflow-contracts/demo';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import type { DemoCatalogue } from '../../demo-catalogue';
import {
  DEMO_DOCUMENT_BATCH_BODY_LIMIT,
  DEMO_DOCUMENT_SAVE_BODY_LIMIT,
  DemoId,
  DemoSpecParams,
  demoErrors,
  isDemoOperationError,
} from '../../../demo/http';
import type { DocumentContentSource } from '../content/read-document';
import type { DemoDocuments } from './operations';

const DocumentParams = Type.Object({ specId: DemoId, documentId: DemoId });

/** Documents-owned demo endpoints: import, folders, tree, tree operations and save. */
export function registerDemoDocumentRoutes<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
  documents: DemoDocuments,
  catalogue: DemoCatalogue,
  source: DocumentContentSource,
) {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  typed.post(
    '/api/demo/specs/:specId/documents',
    {
      bodyLimit: DEMO_DOCUMENT_BATCH_BODY_LIMIT,
      onRequest: async (_request, reply) => {
        reply.header('Cache-Control', 'no-store');
      },
      schema: {
        params: DemoSpecParams,
        body: DemoDocumentsInputSchema,
        response: { 200: DemoDocumentsResultSchema, ...demoErrors },
      },
    },
    async (request, reply) => {
      const { specId } = request.params;
      request.authz.require({
        resource: SpecCapabilities,
        capability: SpecCapabilities.capabilities.Manage,
        scope: { specId },
      });
      const record = await catalogue.find(specId);
      if (!record) return reply.code(404).send({ error: 'specification_not_found' });
      try {
        return documents.addTo(request.authz.readContext().subject, specId, request.body, record);
      } catch (error) {
        if (isDemoOperationError(error))
          return reply.code(error.status).send({ error: error.code });
        throw error;
      }
    },
  );
  typed.post(
    '/api/demo/specs/:specId/folders',
    {
      onRequest: async (_request, reply) => {
        reply.header('Cache-Control', 'no-store');
      },
      schema: {
        params: DemoSpecParams,
        body: DemoFolderInputSchema,
        response: { 200: DemoFolderResultSchema, ...demoErrors },
      },
    },
    async (request, reply) => {
      const { specId } = request.params;
      request.authz.require({
        resource: SpecCapabilities,
        capability: SpecCapabilities.capabilities.Manage,
        scope: { specId },
      });
      const record = await catalogue.find(specId);
      if (!record) return reply.code(404).send({ error: 'specification_not_found' });
      try {
        return documents.addFolderTo(
          request.authz.readContext().subject,
          specId,
          request.body,
          record,
        );
      } catch (error) {
        if (isDemoOperationError(error))
          return reply.code(error.status).send({ error: error.code });
        throw error;
      }
    },
  );
  typed.get(
    '/api/demo/specs/:specId/document-tree',
    {
      onRequest: async (_request, reply) => {
        reply.header('Cache-Control', 'no-store');
      },
      schema: { params: DemoSpecParams, response: { 200: DemoDocumentTreeSchema, ...demoErrors } },
    },
    async (request, reply) => {
      const { specId } = request.params;
      request.authz.require({
        resource: SpecCapabilities,
        capability: SpecCapabilities.capabilities.View,
        scope: { specId },
      });
      const record = await catalogue.find(specId);
      if (!record) return reply.code(404).send({ error: 'specification_not_found' });
      try {
        return documents.tree(specId, record);
      } catch (error) {
        if (isDemoOperationError(error))
          return reply.code(error.status).send({ error: error.code });
        throw error;
      }
    },
  );
  typed.post(
    '/api/demo/specs/:specId/document-operations',
    {
      onRequest: async (_request, reply) => {
        reply.header('Cache-Control', 'no-store');
      },
      schema: {
        params: DemoSpecParams,
        body: DemoDocumentOperationInputSchema,
        response: { 200: DemoDocumentOperationResultSchema, ...demoErrors },
      },
    },
    async (request, reply) => {
      const { specId } = request.params;
      request.authz.require({
        resource: SpecCapabilities,
        capability: SpecCapabilities.capabilities.Manage,
        scope: { specId },
      });
      if (!(await catalogue.find(specId)))
        return reply.code(404).send({ error: 'specification_not_found' });
      try {
        return documents.operate(request.authz.readContext().subject, specId, request.body);
      } catch (error) {
        if (isDemoOperationError(error))
          return reply.code(error.status).send({ error: error.code });
        throw error;
      }
    },
  );
  typed.put(
    '/api/demo/specs/:specId/documents/:documentId',
    {
      bodyLimit: DEMO_DOCUMENT_SAVE_BODY_LIMIT,
      onRequest: async (_request, reply) => {
        reply.header('Cache-Control', 'no-store');
      },
      schema: {
        params: DocumentParams,
        body: DemoSaveInputSchema,
        response: { 200: DemoSaveResultSchema, ...demoErrors },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const { specId, documentId } = request.params;
      request.authz.require({
        resource: SpecCapabilities,
        capability: SpecCapabilities.capabilities.Manage,
        scope: { specId },
      });
      const document = await source.read(specId, documentId);
      if (
        document.kind !== 'ok' ||
        document.document.specId !== specId ||
        document.document.id !== documentId
      )
        return reply.code(404).send({ error: 'specification_document_not_found' });
      try {
        return documents.save(specId, document.document, request.body);
      } catch (error) {
        if (isDemoOperationError(error))
          return reply.code(error.status).send({ error: error.code });
        throw error;
      }
    },
  );
}

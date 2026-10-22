import { Type } from 'typebox';
import type { FastifyInstance, RawServerBase } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  DemoSessionInputSchema,
  DemoSessionResultSchema,
  DemoSessionDetailSchema,
} from '@nevo/specflow-contracts/demo';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import { SessionCapabilities } from '@nevo/specflow-contracts/sessions';
import type { DemoCatalogue, DemoSpecification } from '../../demo-catalogue';
import { DemoId, DemoSpecParams, demoErrors, isDemoOperationError } from '../../../demo/http';
import type { DemoState } from '../../../demo/state';
import type { SessionReferenceOwner } from '../reference-owner';
import type { DemoSessions } from './operations';

const SessionParams = Type.Object({ specId: DemoId, sessionId: DemoId });

/**
 * Sessions-owned demo endpoints. `documentPaths` is the narrow, injected view of the documents a
 * session context snapshot lists (owned by the documents module).
 */
export function registerDemoSessionRoutes<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
  deps: {
    state: DemoState;
    sessions: DemoSessions;
    catalogue: DemoCatalogue;
    references: SessionReferenceOwner;
    documentPaths: (specId: string, record: DemoSpecification) => string[];
  },
) {
  const { state, sessions, catalogue, references, documentPaths } = deps;
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  typed.post(
    '/api/demo/specs/:specId/sessions',
    {
      onRequest: async (_request, reply) => {
        reply.header('Cache-Control', 'no-store');
      },
      schema: {
        params: DemoSpecParams,
        body: DemoSessionInputSchema,
        response: { 200: DemoSessionResultSchema, ...demoErrors },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const specId = request.params.specId;
      request.authz.require({
        resource: SpecCapabilities,
        capability: SpecCapabilities.capabilities.View,
        scope: { specId },
      });
      request.authz.require({
        resource: SessionCapabilities,
        capability: SessionCapabilities.capabilities.Create,
        scope: { specId },
      });
      const record = await catalogue.find(specId);
      if (!record) return reply.code(404).send({ error: 'specification_not_found' });
      const created = state.specifications.get(specId);
      try {
        return sessions.allocate(
          request.authz.readContext().subject,
          specId,
          {
            title: record.title,
            archetype: created?.archetype ?? 'Existing demonstration specification',
            documents: documentPaths(specId, record),
          },
          request.body,
        );
      } catch (error) {
        if (isDemoOperationError(error))
          return reply.code(error.status).send({ error: error.code });
        throw error;
      }
    },
  );
  typed.get(
    '/api/demo/specs/:specId/sessions/:sessionId',
    {
      onRequest: async (_request, reply) => {
        reply.header('Cache-Control', 'no-store');
      },
      schema: { params: SessionParams, response: { 200: DemoSessionDetailSchema, ...demoErrors } },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const { specId, sessionId } = request.params;
      request.authz.require({
        resource: SpecCapabilities,
        capability: SpecCapabilities.capabilities.View,
        scope: { specId },
      });
      const owner = await references.resolve(sessionId);
      if (owner?.specId !== specId) return reply.code(404).send({ error: 'session_not_found' });
      request.authz.require({
        resource: SessionCapabilities,
        capability: SessionCapabilities.capabilities.View,
        scope: owner,
      });
      const detail = await sessions.detail(
        sessionId,
        specId,
        (id) => catalogue.find(id),
        (record) => documentPaths(specId, record),
      );
      if (!detail) return reply.code(404).send({ error: 'demo_session_detail_unavailable' });
      return detail;
    },
  );
}

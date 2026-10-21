import { Type } from 'typebox';
import type { FastifyInstance, RawServerBase } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  DemoCatalogueSchema,
  DemoCreateInputSchema,
  DemoCreateOptionsSchema,
  DemoOperationStatusSchema,
  DemoCreateResultSchema,
} from '@nevo/specflow-contracts/demo';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import { SessionCapabilities } from '@nevo/specflow-contracts/sessions';
import type { DemoCatalogue } from '../../demo-catalogue';
import {
  DEMO_DOCUMENT_BATCH_BODY_LIMIT,
  DemoId,
  demoCreateErrors as createErrors,
  demoErrors as errors,
  isDemoOperationError,
} from '../../../demo/http';
import type { DemoState } from '../../../demo/state';
import { DemoTargetError, parseScenarios, type DemoScenario } from './create-options';
import type { DemoSpecs } from './operations';

const OperationParams = Type.Object({ operationId: Type.String({ minLength: 1, maxLength: 100 }) });
/** Specs-owned demo endpoints: create options, atomic create, operation inspection, catalogue. */
export function registerDemoSpecRoutes<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
  state: DemoState,
  specs: DemoSpecs,
  catalogue: DemoCatalogue,
) {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  /**
   * Demo scenario seam: header `x-demo-scenario` or query `demoScenario` (comma-separated names).
   * Exists only in the demo Runtime and only when explicitly enabled; otherwise ignored silently.
   */
  const scenarios = (request: {
    headers: Record<string, unknown>;
    query: unknown;
  }): DemoScenario[] | undefined => {
    if (!state.scenarioSeam) return [];
    const header = request.headers['x-demo-scenario'];
    const query = (request.query as { demoScenario?: unknown } | undefined)?.demoScenario;
    const raw = [header, query].find((value): value is string => typeof value === 'string');
    return parseScenarios(raw);
  };
  const invalidScenario = {
    error: 'Nieznany scenariusz demo.',
    code: 'DEMO_INVALID_SCENARIO' as const,
  };
  typed.get(
    '/api/demo/specs/create-options',
    {
      onRequest: async (_request, reply) => {
        reply.header('Cache-Control', 'no-store');
      },
      schema: {
        querystring: Type.Object(
          { demoScenario: Type.Optional(Type.String({ maxLength: 200 })) },
          { additionalProperties: false },
        ),
        response: { 200: DemoCreateOptionsSchema, ...createErrors },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      request.authz.require({
        resource: SpecCapabilities,
        capability: SpecCapabilities.capabilities.Create,
        scope: { projectId: state.catalogue.project.id },
      });
      const active = scenarios(request);
      if (!active) return reply.code(400).send(invalidScenario);
      if (active.includes('options-forbidden')) return reply.code(403).send({ error: 'forbidden' });
      if (active.includes('options-error'))
        return reply.code(503).send({ error: 'demo_create_options_unavailable' });
      return specs.createOptions(active);
    },
  );
  typed.get(
    '/api/demo/specifications/operations/:operationId',
    {
      onRequest: async (_request, reply) => {
        reply.header('Cache-Control', 'no-store');
      },
      schema: {
        params: OperationParams,
        response: { 200: DemoOperationStatusSchema, ...createErrors },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      request.authz.require({
        resource: SpecCapabilities,
        capability: SpecCapabilities.capabilities.Create,
        scope: { projectId: state.catalogue.project.id },
      });
      const active = scenarios(request);
      if (!active) return reply.code(400).send(invalidScenario);
      return specs.operationStatus(
        request.authz.readContext().subject,
        request.params.operationId,
        active,
      );
    },
  );
  typed.get(
    '/api/demo/specification-creation',
    {
      onRequest: async (_request, reply) => {
        reply.header('Cache-Control', 'no-store');
      },
      schema: {
        querystring: Type.Object(
          { specId: Type.Optional(DemoId) },
          { additionalProperties: false },
        ),
        response: { 200: DemoCatalogueSchema, ...errors },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const create = {
        resource: SpecCapabilities,
        capability: SpecCapabilities.capabilities.Create,
        scope: { projectId: state.catalogue.project.id },
      };
      if (!request.authz.can(create))
        request.authz.requireCapabilityInAnyScope({
          resource: SessionCapabilities,
          capability: SessionCapabilities.capabilities.Create,
        });
      const specId = request.query.specId;
      if (!specId) return state.catalogue;
      request.authz.require({
        resource: SpecCapabilities,
        capability: SpecCapabilities.capabilities.View,
        scope: { specId },
      });
      if (!(await catalogue.find(specId)))
        return reply.code(404).send({ error: 'specification_not_found' });
      return {
        ...state.catalogue,
        currentLocation: state.locations.get(specId) ?? state.catalogue.currentLocation,
      };
    },
  );
  typed.post(
    '/api/demo/specifications',
    {
      bodyLimit: DEMO_DOCUMENT_BATCH_BODY_LIMIT,
      onRequest: async (_request, reply) => {
        reply.header('Cache-Control', 'no-store');
      },
      schema: {
        body: DemoCreateInputSchema,
        // 201 like the real Engine (a replayed completed operation answers 201 again).
        response: { 201: DemoCreateResultSchema, ...createErrors },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      request.authz.require({
        resource: SpecCapabilities,
        capability: SpecCapabilities.capabilities.Create,
        scope: { projectId: state.catalogue.project.id },
      });
      const active = scenarios(request);
      if (!active) return reply.code(400).send(invalidScenario);
      try {
        const outcome = specs.createWithOutcome(
          request.authz.readContext().subject,
          request.body,
          active,
        );
        if (outcome.fresh && active.includes('network-uncertain')) {
          // Committed, but the response never arrives: the client must replay with the same operationId.
          reply.hijack();
          const socket = request.raw.socket as { destroy?: () => void } | undefined;
          if (typeof socket?.destroy === 'function') socket.destroy();
          else reply.raw.destroy();
          return;
        }
        return reply.code(201).send(outcome.result);
      } catch (error) {
        if (error instanceof DemoTargetError)
          return error.code === 'forbidden'
            ? reply.code(403).send({ error: 'forbidden' })
            : reply.code(error.status).send({ error: error.message, code: error.code });
        if (isDemoOperationError(error))
          return reply.code(error.status).send({ error: error.code });
        throw error;
      }
    },
  );
}

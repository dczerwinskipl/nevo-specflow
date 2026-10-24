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
import {
  CREATE_RESPOND_ASYNC_PREFERENCE,
  CreateOperationAcceptedSchema,
  SpecCapabilities,
} from '@nevo/specflow-contracts/specs';
import { OperationListResponseSchema } from '@nevo/specflow-contracts/operations';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
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
import { DemoTargetError } from './create-target';
import { parseScenarios, type DemoScenario } from './scenarios';
import type { DemoSpecs } from './operations';
import {
  matchesEtag,
  OPERATION_LIST_QUERY_INVALID_CODE,
  OperationListQueryStringSchema,
  operationListEtag,
  parseOperationListQuery,
  registerOperationEventsRoute,
  type OperationEventsStreamOptions,
  type OperationProgressRegistry,
} from '../../operations';
import { buildDemoOperationList } from './operation-list';
import { canViewSpec } from '../overview/filter-authorized-specs';
import { startCreateProgress } from '../create/progress';
import { prefersRespondAsync } from '../create/respond-async';

export interface DemoProgress {
  readonly registry: OperationProgressRegistry;
  readonly stream?: OperationEventsStreamOptions;
}

const DEMO_STEP_DELAY_MS = 150;
const delay = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

const DemoOperationListErrorSchema = Type.Object(
  { error: Type.String(), code: Type.Optional(Type.String()) },
  { additionalProperties: false },
);
const OperationParams = Type.Object({ operationId: Type.String({ minLength: 1, maxLength: 100 }) });
/** Specs-owned demo endpoints: create options, atomic create, operation inspection, catalogue. */
export function registerDemoSpecRoutes<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
  state: DemoState,
  specs: DemoSpecs,
  catalogue: DemoCatalogue,
  progress?: DemoProgress,
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
    error: 'DEMO_INVALID_SCENARIO',
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
  // Same contract as `GET /api/specs/operations` (OperationListResponse), over the demo state.
  typed.get(
    '/api/demo/specifications/operations',
    {
      onRequest: async (_request, reply) => {
        reply.header('Cache-Control', 'no-store');
      },
      schema: {
        querystring: Type.Object(
          {
            ...OperationListQueryStringSchema.properties,
            demoScenario: Type.Optional(Type.String({ maxLength: 200 })),
          },
          { additionalProperties: false },
        ),
        response: {
          200: OperationListResponseSchema,
          400: DemoOperationListErrorSchema,
          401: AuthenticationRequiredErrorResponseSchema,
          403: AuthorizationForbiddenErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      request.authz.requireCapabilityInAnyScope({
        resource: SpecCapabilities,
        capability: SpecCapabilities.capabilities.View,
      });
      const active = scenarios(request);
      const query = parseOperationListQuery(request.query);
      if (!active) return reply.code(400).send(invalidScenario);
      // The same 400 body as the real list route (shared parser and code).
      if (!query) {
        return reply.code(400).send({
          error: OPERATION_LIST_QUERY_INVALID_CODE,
          code: OPERATION_LIST_QUERY_INVALID_CODE,
        });
      }
      if (active.includes('forbidden')) return reply.code(403).send({ error: 'forbidden' });
      const { authz } = request;
      const list = buildDemoOperationList({
        records: specs.operationRecords(authz.readContext().subject),
        live: progress?.registry.list() ?? [],
        scenarios: active,
        now: new Date(),
        // Same admission rule as the real route: a known spec needs View, one without needs Create.
        admit: (row) =>
          row.subject?.specId
            ? canViewSpec(authz, row.subject.specId)
            : authz.can({
                resource: SpecCapabilities,
                capability: SpecCapabilities.capabilities.Create,
                scope: { projectId: state.catalogue.project.id },
              }),
        ...(query.statuses ? { statuses: query.statuses } : {}),
        limit: query.limit,
      });
      const etag = operationListEtag(list);
      reply.header('ETag', etag);
      if (matchesEtag(request.headers['if-none-match'], etag)) {
        return reply.code(304 as unknown as 200).send(undefined as never);
      }
      return list;
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
  if (progress) {
    // Same shared mechanism as the real Runtime, owned by the demo Create feature.
    registerOperationEventsRoute(app, {
      path: '/api/demo/specifications/operations/:operationId/events',
      kind: 'specification-create',
      authorize: (request) =>
        request.authz.require({
          resource: SpecCapabilities,
          capability: SpecCapabilities.capabilities.Create,
          scope: { projectId: state.catalogue.project.id },
        }),
      registry: progress.registry,
      ...(progress.stream ? { stream: progress.stream } : {}),
    });
  }
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
        response: {
          201: DemoCreateResultSchema,
          202: CreateOperationAcceptedSchema,
          ...createErrors,
        },
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
      const targetKind = request.body.target?.kind === 'new-worktree' ? 'new-worktree' : 'existing';
      // Same generic stream as the real Runtime (`GET /api/demo/specifications/operations/:id/events`).
      const reporter = progress
        ? startCreateProgress(
            progress.registry,
            request.body.operationId,
            targetKind,
            specs.createOptions(active).commits !== undefined,
          )
        : undefined;
      try {
        const outcome = specs.createWithOutcome(
          request.authz.readContext().subject,
          request.body,
          active,
        );
        const publish = async () => {
          if (!reporter || !outcome.fresh) return;
          // Paced only when the scenario seam is on and asks for it; otherwise the steps are
          // published at once (a late subscriber replays them from the snapshot).
          const commits = specs.createOptions(active).commits !== undefined;
          for (const stage of [
            'reserved',
            'git-provisioned',
            'manifest-writing',
            ...(commits ? (['commit-writing'] as const) : []),
            'registry-writing',
          ] as const) {
            reporter.onStage({ stage, target: targetKind });
            if (active.includes('slow-create')) await delay(DEMO_STEP_DELAY_MS);
          }
          const { documentIds: _documentIds, ...created } = outcome.result;
          reporter.complete(created);
        };
        if (outcome.fresh && prefersRespondAsync(request.headers.prefer)) {
          // Same contract as the real Runtime: 202 now, the work (progress) continues detached.
          // The demo state is committed already, so its inspection shows the outcome at once.
          void publish().catch(() => reporter?.fail(undefined));
          return reply
            .code(202)
            .header('Location', `/api/demo/specifications/operations/${outcome.result.operationId}`)
            .header('Preference-Applied', CREATE_RESPOND_ASYNC_PREFERENCE)
            .send({
              operationId: outcome.result.operationId,
              kind: 'specification-create',
              status: 'in-progress',
            });
        }
        await publish();
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
        reporter?.fail(
          error instanceof DemoTargetError
            ? error.code
            : isDemoOperationError(error)
              ? error.code
              : undefined,
        );
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

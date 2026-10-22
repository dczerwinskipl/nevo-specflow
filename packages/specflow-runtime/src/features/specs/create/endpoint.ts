import {
  CreateOperationError,
  GitCapabilityError,
  ProjectControlLockError,
  ProjectHomeError,
  SpecificationError,
  WorkspaceRegistryError,
  createSpecificationFromRequest,
  inspectCreateOptions,
  inspectPublicCreateOperation,
  projectCreatedSpecification,
  type CreateSpecificationRequest,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginCallback } from 'fastify';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import {
  CreateOperationInspectionSchema,
  CreateOperationParamsSchema,
  CreateOptionsSchema,
  CreateSpecErrorSchema,
  CreateSpecRequestSchema,
  CreatedSpecSchema,
  SpecCapabilities,
} from '@nevo/specflow-contracts/specs';

import { requireCapability } from '../../auth';
import {
  registerOperationEventsRoute,
  type OperationEventsStreamOptions,
  type OperationProgressRegistry,
} from '../../operations';
import { statusForCreateError, type CreateErrorCode } from './error-status';
import { startCreateProgress, type CreateProgress } from './progress';

export interface SpecsCreateEndpointOptions {
  readonly engine?: SpecFlowEngine;
  /** Optional live progress (SSE) for operations that carry a client `operationId`. */
  readonly progress?: OperationProgressRegistry;
  readonly stream?: OperationEventsStreamOptions;
}

/**
 * Authorized Runtime transport only. Project-level create is needed because
 * an uncreated Spec has no specId yet. The workspace selector never grants
 * access. Demo/unconfigured Runtime remains read-only and fails closed.
 */
export const specsCreateEndpoint: FastifyPluginCallback<SpecsCreateEndpointOptions> = (
  app,
  options,
  done,
) => {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/api/specs/create-options',
    {
      preHandler: requireCapability({
        resource: SpecCapabilities,
        capability: SpecCapabilities.capabilities.Create,
        scope: {},
      }),
      schema: {
        response: {
          200: CreateOptionsSchema,
          400: CreateSpecErrorSchema,
          401: AuthenticationRequiredErrorResponseSchema,
          403: AuthorizationForbiddenErrorResponseSchema,
          409: CreateSpecErrorSchema,
          422: CreateSpecErrorSchema,
          503: CreateSpecErrorSchema,
        },
      },
    },
    async (_request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const engine = options.engine;
      if (!engine) {
        return reply.code(503).send({
          error: 'ENGINE_UNAVAILABLE',
          code: 'ENGINE_UNAVAILABLE',
        });
      }
      try {
        const options = await inspectCreateOptions(engine);
        return reply.code(200).send({
          ...options,
          workspaces: [...options.workspaces],
          baseRefs: [...options.baseRefs],
        });
      } catch (error) {
        const code = errorCode(error);
        if (!code) throw error;
        return reply.code(statusForCreateError(code)).send({ error: code, code });
      }
    },
  );

  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/api/specs/create/operations/:operationId',
    {
      preHandler: requireCapability({
        resource: SpecCapabilities,
        capability: SpecCapabilities.capabilities.Create,
        scope: {},
      }),
      schema: {
        params: CreateOperationParamsSchema,
        response: {
          200: CreateOperationInspectionSchema,
          400: CreateSpecErrorSchema,
          401: AuthenticationRequiredErrorResponseSchema,
          403: AuthorizationForbiddenErrorResponseSchema,
          404: CreateSpecErrorSchema,
          409: CreateSpecErrorSchema,
          422: CreateSpecErrorSchema,
          503: CreateSpecErrorSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const engine = options.engine;
      if (!engine)
        return reply.code(503).send({
          code: 'ENGINE_UNAVAILABLE',
          error: 'ENGINE_UNAVAILABLE',
        });
      try {
        const result = await inspectPublicCreateOperation(engine, request.params.operationId);
        if (!result)
          return reply.code(404).send({
            code: 'CREATE_NOT_FOUND',
            error: 'CREATE_NOT_FOUND',
          });
        return reply.code(200).send(result);
      } catch (error) {
        const code = errorCode(error);
        if (!code) throw error;
        return reply.code(statusForCreateError(code)).send({ code, error: code });
      }
    },
  );

  // Live progress of the same operation: authorized exactly like the inspection endpoint above.
  if (options.progress) {
    registerOperationEventsRoute(app, {
      path: '/api/specs/create/operations/:operationId/events',
      kind: 'specification-create',
      authorize: requireCapability({
        resource: SpecCapabilities,
        capability: SpecCapabilities.capabilities.Create,
        scope: {},
      }),
      registry: options.progress,
      ...(options.stream ? { stream: options.stream } : {}),
    });
  }

  app.withTypeProvider<TypeBoxTypeProvider>().post(
    '/api/specs',
    {
      preHandler: requireCapability({
        resource: SpecCapabilities,
        capability: SpecCapabilities.capabilities.Create,
        scope: {},
      }),
      schema: {
        body: CreateSpecRequestSchema,
        response: {
          201: CreatedSpecSchema,
          400: CreateSpecErrorSchema,
          401: AuthenticationRequiredErrorResponseSchema,
          403: AuthorizationForbiddenErrorResponseSchema,
          409: CreateSpecErrorSchema,
          422: CreateSpecErrorSchema,
          503: CreateSpecErrorSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const engine = options.engine;
      if (!engine) {
        return reply.code(503).send({
          error: 'ENGINE_UNAVAILABLE',
          code: 'ENGINE_UNAVAILABLE',
        });
      }

      // Best-effort progress for the generic operation stream; never affects the outcome.
      let progress: CreateProgress | undefined;
      try {
        const body = request.body;
        if (options.progress && body.operationId) {
          progress = startCreateProgress(
            options.progress,
            body.operationId,
            body.target?.kind === 'new-worktree' ? 'new-worktree' : 'existing',
          );
        }
        // Resolve default from the verified Project Home (not the HTTP server
        // process cwd or a user-provided, unverified root).
        const target = await resolveCreateTarget(engine, body.target);
        const result = await createSpecificationFromRequest(
          engine,
          {
            operationId: body.operationId,
            title: body.title,
            goal: body.goal,
            ...(body.slug !== undefined ? { slug: body.slug } : {}),
            target,
          },
          progress ? { onStage: (observation) => progress?.onStage(observation) } : {},
        );
        const created = projectCreatedSpecification(result);
        progress?.complete(created);
        return reply.code(201).send(created);
      } catch (error) {
        const code = errorCode(error);
        progress?.fail(code);
        if (!code) throw error;

        const status = statusForCreateError(code);
        return reply.code(status).send({ error: code, code });
      }
    },
  );
  done();
};

async function resolveCreateTarget(
  engine: SpecFlowEngine,
  target:
    | { readonly kind: 'existing'; readonly workspaceId: string }
    | {
        readonly kind: 'new-worktree';
        readonly baseRef?: string;
        readonly branch?: string;
        readonly integrationTargetWorkspaceId?: string;
      }
    | undefined,
): Promise<CreateSpecificationRequest['target']> {
  switch (target?.kind) {
    case undefined:
      return { kind: 'existing', workspaceId: (await engine.readRegistry()).primaryWorkspaceId };
    case 'existing':
      return { kind: 'existing', workspaceId: target.workspaceId };
    case 'new-worktree':
      return {
        kind: 'new-worktree',
        ...(target.baseRef !== undefined ? { baseRef: target.baseRef } : {}),
        ...(target.branch !== undefined ? { branch: target.branch } : {}),
        ...(target.integrationTargetWorkspaceId !== undefined
          ? { integrationTargetWorkspaceId: target.integrationTargetWorkspaceId }
          : {}),
      };
    default: {
      const exhaustive: never = target;
      return exhaustive;
    }
  }
}

function errorCode(error: unknown): CreateErrorCode | undefined {
  // Only Engine's public, typed failures are safe transport errors. A Node
  // filesystem error such as EACCES is not a client validation failure and
  // must never be misreported as HTTP 422.
  if (
    error instanceof CreateOperationError ||
    error instanceof ProjectControlLockError ||
    error instanceof GitCapabilityError ||
    error instanceof SpecificationError ||
    error instanceof WorkspaceRegistryError ||
    error instanceof ProjectHomeError
  ) {
    return error.code;
  }
  return undefined;
}

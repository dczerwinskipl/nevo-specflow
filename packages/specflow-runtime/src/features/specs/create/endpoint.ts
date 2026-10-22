import { randomUUID } from 'node:crypto';

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
  readRegistrySnapshot,
  willCommitCreatedScaffold,
  type CreateSpecificationRequest,
  type CreateStageObservation,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginCallback } from 'fastify';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import {
  CREATE_RESPOND_ASYNC_PREFERENCE,
  CreateOperationAcceptedSchema,
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
import { prefersRespondAsync } from './respond-async';

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
        const { commits, ...options } = await inspectCreateOptions(engine);
        return reply.code(200).send({
          ...options,
          workspaces: [...options.workspaces],
          baseRefs: [...options.baseRefs],
          // Present exactly when Git is enabled (the Engine then commits the scaffold).
          ...(commits
            ? {
                commits: {
                  protectedBranches: [...commits.protectedBranches],
                  ...(commits.allowedBranches
                    ? { allowedBranches: [...commits.allowedBranches] }
                    : {}),
                },
              }
            : {}),
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
        // The journal has no failed state: a run that failed after reservation leaves it non-terminal.
        // This Runtime still knows the failure for a short time and reports its stable code.
        const failure =
          result.status === 'in-progress'
            ? options.progress?.peek(request.params.operationId, 'specification-create')
            : undefined;
        if (failure?.status === 'failed' && failure.code !== undefined) {
          return reply.code(200).send({
            operationId: request.params.operationId,
            kind: 'specification-create',
            status: 'failed',
            code: failure.code,
          });
        }
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
          202: CreateOperationAcceptedSchema,
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
      reply.header('Cache-Control', 'no-store').header('Vary', 'Prefer');
      const engine = options.engine;
      if (!engine) {
        return reply.code(503).send({
          error: 'ENGINE_UNAVAILABLE',
          code: 'ENGINE_UNAVAILABLE',
        });
      }

      const body = request.body;
      const respondAsync = prefersRespondAsync(request.headers.prefer);
      // Async mode needs an id to answer with a Location; the client may have chosen its own.
      const operationId = body.operationId ?? (respondAsync ? randomUUID() : undefined);

      // Best-effort progress for the operation stream; never affects the outcome.
      let progress: CreateProgress | undefined;
      try {
        if (options.progress && operationId) {
          progress = startCreateProgress(
            options.progress,
            operationId,
            body.target?.kind === 'new-worktree' ? 'new-worktree' : 'existing',
            await willCommitCreatedScaffold(engine),
          );
        }

        // The work is NOT bound to this request: Node does not cancel a handler when the client
        // disconnects and the Engine takes no request signal, so the journal always runs to its
        // outcome. The promise below is the single owner of that outcome (progress included).
        let accept: () => void = () => undefined;
        const accepted = new Promise<'accepted'>((resolve) => {
          accept = () => resolve('accepted');
        });
        const finished = (async () => {
          try {
            // Resolve default from the verified Project Home (not the HTTP server
            // process cwd or a user-provided, unverified root).
            const target = await resolveCreateTarget(engine, body.target);
            const result = await createSpecificationFromRequest(
              engine,
              {
                operationId,
                title: body.title,
                goal: body.goal,
                ...(body.slug !== undefined ? { slug: body.slug } : {}),
                target,
              },
              {
                onStage: (observation) => {
                  progress?.onStage(observation);
                  if (respondAsync && isAcceptedObservation(observation)) accept();
                },
              },
            );
            const created = projectCreatedSpecification(result);
            progress?.complete(created);
            return created;
          } catch (error) {
            progress?.fail(errorCode(error));
            throw error;
          }
        })();

        if (respondAsync && operationId) {
          // A failure after acceptance is reported by progress/inspection, never lost unhandled.
          finished.catch((error: unknown) => {
            if (!errorCode(error)) request.log.error({ err: error }, 'Detached Create failed');
          });
          const first = await Promise.race([finished, accepted]);
          if (first === 'accepted') {
            return reply
              .code(202)
              .header('Location', operationPath(operationId))
              .header('Preference-Applied', CREATE_RESPOND_ASYNC_PREFERENCE)
              .send({ operationId, kind: 'specification-create', status: 'in-progress' });
          }
          return reply.code(201).send(first);
        }
        return reply.code(201).send(await finished);
      } catch (error) {
        const code = errorCode(error);
        if (!code) throw error;

        const status = statusForCreateError(code);
        return reply.code(status).send({ error: code, code });
      }
    },
  );
  done();
};

const operationPath = (operationId: string) => `/api/specs/create/operations/${operationId}`;

/**
 * When a respond-async request is answered 202: the operation has been validated and is past its
 * reservation (a fresh run has left `reserved`, so Git availability and the reserved plan were
 * checked), or it is a retry of work that is still running. A finished or broken journal is
 * answered with its real outcome instead.
 */
function isAcceptedObservation(observation: CreateStageObservation): boolean {
  if (observation.stage === 'completed' || observation.stage === 'recovery-required') return false;
  return observation.replayed === true || observation.stage !== 'reserved';
}

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
      return {
        kind: 'existing',
        workspaceId: (await readRegistrySnapshot(engine)).primaryWorkspaceId,
      };
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

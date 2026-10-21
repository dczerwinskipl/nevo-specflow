import { randomUUID } from 'node:crypto';

import {
  CloseOperationError,
  GitCapabilityError,
  ProjectControlLockError,
  ProjectHomeError,
  SpecificationError,
  WorkspaceRegistryError,
  closeSpecificationOperation,
  closeWorktreeOperation,
  inspectPublicCloseOperation,
  planPublicCloseOperation,
  reconcileArchivedConflictScratchOperation,
  type PublicClosePreview,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';
import {
  CloseErrorSchema,
  CloseOperationParamsSchema,
  ClosePreviewQuerySchema,
  ClosePreviewSchema,
  CloseResultSchema,
  CloseSpecParamsSchema,
  CloseScratchReconciliationRequestSchema,
  CloseSpecificationRequestSchema,
  CloseWorktreeRequestSchema,
  ProjectGitCapabilities,
  SpecCapabilities,
} from '@nevo/specflow-contracts/specs';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginCallback, FastifyRequest } from 'fastify';

import { requireCapability } from '../../auth';

export interface SpecsCloseEndpointOptions {
  readonly engine?: SpecFlowEngine;
}

type CloseKind = 'worktree-close' | 'specification-close';

function projectIntegrationAllowed(request: FastifyRequest, engine: SpecFlowEngine): void {
  request.authz.require({
    resource: ProjectGitCapabilities,
    capability: ProjectGitCapabilities.capabilities.Integrate,
    scope: { projectId: engine.context.project.projectId },
  });
}

async function authorizedPlan(
  request: FastifyRequest,
  engine: SpecFlowEngine,
  kind: CloseKind,
  specId: string,
  operationId: string,
  integrateToTargetBranch?: boolean,
): Promise<PublicClosePreview> {
  // Spec-scoped authentication precedes every operation-id/immutable-journal read.
  // Integration authority follows the Engine's immutable retry plan, not a
  // caller-supplied selector that could turn off whole-branch checks.
  const plan = await planPublicCloseOperation(
    engine,
    kind === 'worktree-close'
      ? { kind, operationId, specId }
      : {
          kind,
          operationId,
          specId,
          ...(integrateToTargetBranch === undefined ? {} : { integrateToTargetBranch }),
        },
  );
  if (plan.integrationRequired) projectIntegrationAllowed(request, engine);
  return plan;
}

type SafeCode =
  | CloseOperationError['code']
  | GitCapabilityError['code']
  | ProjectControlLockError['code']
  | ProjectHomeError['code']
  | SpecificationError['code']
  | WorkspaceRegistryError['code'];

function safeCode(error: unknown): SafeCode | undefined {
  if (
    error instanceof CloseOperationError ||
    error instanceof GitCapabilityError ||
    error instanceof ProjectControlLockError ||
    error instanceof ProjectHomeError ||
    error instanceof SpecificationError ||
    error instanceof WorkspaceRegistryError
  )
    return error.code;
  return undefined;
}

function statusForCloseError(code: SafeCode): 400 | 404 | 409 | 422 | 503 {
  switch (code) {
    case 'CLOSE_INVALID':
      return 400;
    case 'SPEC_VALIDATION_ERROR':
      return 400;
    case 'CLOSE_CONFLICT':
    case 'REGISTRY_CONFLICT':
    case 'SPEC_CONFLICT':
    case 'BRANCH_ALREADY_EXISTS':
    case 'BRANCH_ALREADY_CHECKED_OUT':
    case 'WORKTREE_PATH_CONFLICT':
      return 409;
    case 'CLOSE_PREFLIGHT':
    case 'GIT_DISABLED':
    case 'BASE_REF_NOT_FOUND':
    case 'GIT_BASE_CONFIG_MISSING':
      return 422;
    case 'SPEC_NOT_FOUND':
      return 404;
    case 'CLOSE_UNAVAILABLE':
    case 'CLOSE_RECOVERY_REQUIRED':
    case 'CLOSE_JOURNAL_CORRUPT':
    case 'PROJECT_HOME_NOT_FOUND':
    case 'PROJECT_HOME_AMBIGUOUS':
    case 'PROJECT_HOME_INVALID':
    case 'PROJECT_HOME_MISMATCH':
    case 'CONTROL_LOCK_BUSY':
    case 'CONTROL_LOCK_CORRUPT':
    case 'CONTROL_LOCK_OWNERSHIP_LOST':
    case 'CONTROL_LOCK_INVALID_HOME':
    case 'REGISTRY_NOT_FOUND':
    case 'REGISTRY_RECOVERY_REQUIRED':
    case 'REGISTRY_CORRUPT':
    case 'REGISTRY_UNSUPPORTED_VERSION':
    case 'REGISTRY_PROJECT_MISMATCH':
    case 'REGISTRY_WORKSPACE_UNAVAILABLE':
    case 'REGISTRY_WORKSPACE_MISMATCH':
    case 'GIT_POLICY_INVALID':
    case 'GIT_UNAVAILABLE':
    case 'NOT_GIT_REPOSITORY':
    case 'GIT_OPERATION_UNCERTAIN':
    case 'GIT_OPERATION_FAILED':
    case 'WORKTREE_MEMBERSHIP_MISMATCH':
    case 'SPEC_SOURCE_INVALID':
      return 503;
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

const errors = {
  400: CloseErrorSchema,
  401: AuthenticationRequiredErrorResponseSchema,
  403: AuthorizationForbiddenErrorResponseSchema,
  404: CloseErrorSchema,
  409: CloseErrorSchema,
  422: CloseErrorSchema,
  503: CloseErrorSchema,
} as const;

export const specsCloseEndpoint: FastifyPluginCallback<SpecsCloseEndpointOptions> = (
  app,
  options,
  done,
) => {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const authWorktree = requireCapability({
    resource: SpecCapabilities,
    capability: SpecCapabilities.capabilities.CloseWorktree,
    scope: (request) => ({ specId: (request.params as { specId: string }).specId }),
  });
  const authSpec = requireCapability({
    resource: SpecCapabilities,
    capability: SpecCapabilities.capabilities.CloseSpecification,
    scope: (request) => ({ specId: (request.params as { specId: string }).specId }),
  });

  for (const kind of ['worktree-close', 'specification-close'] as const) {
    const url =
      kind === 'worktree-close' ? '/api/specs/:specId/worktree/close' : '/api/specs/:specId/close';
    const preHandler = kind === 'worktree-close' ? authWorktree : authSpec;
    typed.post(
      url,
      {
        preHandler,
        schema: {
          params: CloseSpecParamsSchema,
          body:
            kind === 'worktree-close'
              ? CloseWorktreeRequestSchema
              : CloseSpecificationRequestSchema,
          response: { 200: CloseResultSchema, 202: CloseResultSchema, ...errors },
        },
      },
      async (request, reply) => {
        reply.header('Cache-Control', 'no-store');
        const engine = options.engine;
        if (!engine)
          return reply.code(503).send({ code: 'ENGINE_UNAVAILABLE', error: 'ENGINE_UNAVAILABLE' });
        try {
          const { specId } = request.params;
          const body = request.body as { operationId: string; integrateToTargetBranch?: boolean };
          await authorizedPlan(
            request,
            engine,
            kind,
            specId,
            body.operationId,
            body.integrateToTargetBranch,
          );
          const result =
            kind === 'worktree-close'
              ? await closeWorktreeOperation(engine, { specId, operationId: body.operationId })
              : await closeSpecificationOperation(engine, {
                  specId,
                  operationId: body.operationId,
                  ...(body.integrateToTargetBranch === undefined
                    ? {}
                    : { integrateToTargetBranch: body.integrateToTargetBranch }),
                });
          return reply.code(result.status === 'completed' ? 200 : 202).send(result);
        } catch (error) {
          const code = safeCode(error);
          if (!code) throw error;
          return reply.code(statusForCloseError(code)).send({ code, error: code });
        }
      },
    );

    typed.get(
      url + '/preview',
      {
        preHandler,
        schema: {
          params: CloseSpecParamsSchema,
          querystring: ClosePreviewQuerySchema,
          response: { 200: ClosePreviewSchema, ...errors },
        },
      },
      async (request, reply) => {
        reply.header('Cache-Control', 'no-store');
        if (!options.engine)
          return reply.code(503).send({ code: 'ENGINE_UNAVAILABLE', error: 'ENGINE_UNAVAILABLE' });
        try {
          const engine = options.engine;
          const { specId } = request.params;
          const operationId = randomUUID();
          const plan = await authorizedPlan(
            request,
            engine,
            kind,
            specId,
            operationId,
            request.query.integrateToTargetBranch,
          );
          return reply.code(200).send(plan);
        } catch (error) {
          const code = safeCode(error);
          if (!code) throw error;
          return reply.code(statusForCloseError(code)).send({ code, error: code });
        }
      },
    );
  }

  typed.get(
    '/api/specs/:specId/close/operations/:operationId',
    {
      preHandler: authSpec,
      schema: {
        params: CloseOperationParamsSchema,
        response: { 200: CloseResultSchema, ...errors },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      if (!options.engine)
        return reply.code(503).send({ code: 'ENGINE_UNAVAILABLE', error: 'ENGINE_UNAVAILABLE' });
      const { specId, operationId } = request.params;
      const existing = await inspectPublicCloseOperation(options.engine, operationId);
      if (existing?.specId !== specId || existing.kind !== 'specification-close') {
        return reply.code(404).send({ code: 'CLOSE_NOT_FOUND', error: 'CLOSE_NOT_FOUND' });
      }
      if (existing.integrationRequired) projectIntegrationAllowed(request, options.engine);
      return reply.code(200).send(existing);
    },
  );

  typed.post(
    '/api/specs/:specId/close/operations/:operationId/reconcile-scratch',
    {
      preHandler: authSpec,
      schema: {
        params: CloseOperationParamsSchema,
        body: CloseScratchReconciliationRequestSchema,
        response: { 200: CloseResultSchema, ...errors },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const engine = options.engine;
      if (!engine)
        return reply.code(503).send({ code: 'ENGINE_UNAVAILABLE', error: 'ENGINE_UNAVAILABLE' });
      const { specId, operationId } = request.params;
      try {
        // Project-wide Git grant is required BEFORE journal inspection.
        projectIntegrationAllowed(request, engine);
        const existing = await inspectPublicCloseOperation(engine, operationId);
        if (existing?.specId !== specId || existing.kind !== 'specification-close')
          return reply.code(404).send({ code: 'CLOSE_NOT_FOUND', error: 'CLOSE_NOT_FOUND' });
        const settled = await reconcileArchivedConflictScratchOperation(
          engine,
          operationId,
          request.body.confirmedNoActiveGitProcess,
        );
        return reply.code(200).send(settled);
      } catch (error) {
        const code = safeCode(error);
        if (!code) throw error;
        return reply.code(statusForCloseError(code)).send({ code, error: code });
      }
    },
  );

  typed.get(
    '/api/specs/:specId/worktree/close/operations/:operationId',
    {
      preHandler: authWorktree,
      schema: {
        params: CloseOperationParamsSchema,
        response: { 200: CloseResultSchema, ...errors },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      if (!options.engine)
        return reply.code(503).send({ code: 'ENGINE_UNAVAILABLE', error: 'ENGINE_UNAVAILABLE' });
      const { specId, operationId } = request.params;
      projectIntegrationAllowed(request, options.engine);
      const existing = await inspectPublicCloseOperation(options.engine, operationId);
      if (existing?.specId !== specId || existing.kind !== 'worktree-close') {
        return reply.code(404).send({ code: 'CLOSE_NOT_FOUND', error: 'CLOSE_NOT_FOUND' });
      }
      return reply.code(200).send(existing);
    },
  );

  done();
};

import { randomUUID } from 'node:crypto';

import {
  CloseOperationError,
  DocumentError,
  GitCapabilityError,
  ProjectControlLockError,
  ProjectHomeError,
  SpecificationError,
  WorkspaceRegistryError,
  closeSpecificationOperation,
  closeWorktreeOperation,
  closeWorkspaceOperation,
  inspectPublicWorkspaceCloseOperation,
  planPublicWorkspaceCloseOperation,
  inspectPublicCloseOperation,
  planPublicCloseOperation,
  previewPublicCloseOperation,
  reconcileArchivedConflictScratchOperation,
  type CloseRepositoryBlocker,
  type PlanPublicCloseOptions,
  readRegistrySnapshot,
  type PublicClosePlan,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';
import {
  CloseErrorSchema,
  CloseOccupancySchema,
  CloseOperationParamsSchema,
  CloseWorktreePreviewQuerySchema,
  CloseSpecificationPreviewQuerySchema,
  ClosePreviewSchema,
  CloseResultSchema,
  CloseSpecParamsSchema,
  CloseScratchReconciliationRequestSchema,
  CloseSpecificationRequestSchema,
  CloseWorktreeRequestSchema,
  CloseWorkspaceParamsSchema,
  CloseWorkspaceOperationParamsSchema,
  CloseWorkspacePreviewSchema,
  CloseWorkspaceResultSchema,
  ProjectGitCapabilities,
  SpecCapabilities,
  type RepositoryBlocker,
} from '@nevo/specflow-contracts/specs';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import type { DocumentErrorDetails } from '@nevo/specflow-contracts/documents';
import type { ExitBlocker } from '@nevo/specflow-contracts/workflow';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginCallback, FastifyRequest } from 'fastify';

import { requireCapability } from '../../auth';
import { specScope } from '../scope';
import { documentFailure } from '../../documents';
import { contractRef } from '../../../server/shared-contracts';
import {
  assertNoRunningTurns,
  sessionTurnBlocker,
  specificationOccupancy,
  whileReleased,
  WorkspaceBusyError,
  type ReleaseWorkspace,
  type RunningSessions,
} from './release-workspace';

export type { ReleaseWorkspace, RunningSessions } from './release-workspace';
export { WorkspaceBusyError } from './release-workspace';

export interface SpecsCloseEndpointOptions {
  readonly engine?: SpecFlowEngine;
  readonly releaseWorkspace?: ReleaseWorkspace;
  /** The Sessions whose Turn runs in a workspace now: a preview refuses while there are any. */
  readonly runningSessions?: RunningSessions;
}

/** `CLOSE_BLOCKED` for agent Session Turns working in the checkout Close would remove. */
function busyRefusal(error: unknown) {
  return error instanceof WorkspaceBusyError
    ? {
        code: 'CLOSE_BLOCKED' as const,
        error: 'CLOSE_BLOCKED' as const,
        blockers: [sessionTurnBlocker(error.sessionIds)],
      }
    : undefined;
}

type CloseKind = 'worktree-close' | 'specification-close';

function projectIntegrationAllowed(request: FastifyRequest, engine: SpecFlowEngine): void {
  request.authz.require({
    resource: ProjectGitCapabilities,
    capability: ProjectGitCapabilities.capabilities.Integrate,
    scope: { projectId: engine.context.project.projectId },
  });
}

/** Strong project-wide grant, independent of ordinary Git integration permission. */
function projectWorkspaceCloseAllowed(request: FastifyRequest, engine: SpecFlowEngine): void {
  request.authz.require({
    resource: ProjectGitCapabilities,
    capability: ProjectGitCapabilities.capabilities.CloseWorkspace,
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
  finishAfterExternalMerge?: boolean,
  options: PlanPublicCloseOptions = {},
): Promise<PublicClosePlan> {
  // Spec-scoped authentication precedes every operation-id/immutable-journal read.
  // Integration authority follows the Engine's immutable retry plan, not a
  // caller-supplied selector that could turn off whole-branch checks.
  const plan = await planPublicCloseOperation(
    engine,
    kind === 'worktree-close'
      ? {
          kind,
          operationId,
          specId,
          ...(finishAfterExternalMerge === undefined ? {} : { finishAfterExternalMerge }),
        }
      : // Specification Close never accepts finishAfterExternalMerge (owner decision 2026-11-20);
        // the schema already rejects a body that sends it, so it is never forwarded here.
        {
          kind,
          operationId,
          specId,
          ...(integrateToTargetBranch === undefined ? {} : { integrateToTargetBranch }),
        },
    options,
  );
  if (plan.integrationRequired) {
    projectIntegrationAllowed(request, engine);
  }

  return plan;
}

/**
 * A Close admission that the document commit queue refuses (`DOCUMENT_COMMITS_PENDING` with its
 * `details.cause`): the stable `{error, code, details}` body of the documents contract, 409.
 */
function documentRefusal(error: unknown) {
  if (!(error instanceof DocumentError)) {
    return undefined;
  }

  const failure = documentFailure(error);
  if (!failure) {
    return undefined;
  }

  // Statuses outside the declared Close responses are served as the schemaless JSON they are.
  return failure as unknown as {
    status: 409;
    body: { error: string; code: string; details?: DocumentErrorDetails };
  };
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
  ) {
    return error.code;
  }

  return undefined;
}

/** `CLOSE_BLOCKED`: the grouped blockers of the Specification workflow, for a list with links. */
function blockersOf(error: unknown): { blockers?: ExitBlocker[] } {
  return error instanceof CloseOperationError && error.blockers.length > 0
    ? { blockers: error.blockers as ExitBlocker[] }
    : {};
}

/** A mutable contract copy of one Engine repository blocker. */
function repositoryBlocker(blocker: CloseRepositoryBlocker): RepositoryBlocker {
  switch (blocker.kind) {
    case 'uncommitted-changes': {
      const { attempts, ...rest } = blocker;

      return {
        ...rest,
        paths: blocker.paths.map((entry) => ({ ...entry })),
        ...(attempts !== undefined
          ? { attempts: attempts.map((attempt) => ({ ...attempt, paths: [...attempt.paths] })) }
          : {}),
      };
    }

    case 'integration-target-missing':
      return {
        kind: blocker.kind,
        sourceCheckout: blocker.sourceCheckout,
        candidates: blocker.candidates.map((candidate) =>
          candidate.remote !== undefined
            ? { branch: candidate.branch, facts: [...candidate.facts], remote: candidate.remote }
            : { branch: candidate.branch, facts: [...candidate.facts] },
        ),
        otherBranches: [...blocker.otherBranches],
        otherBranchCount: blocker.otherBranchCount,
      };
    default:
      return { ...blocker };
  }
}

/** `CLOSE_PREFLIGHT`: the repository preconditions the owner fixes before the Close can start. */
function repositoryOf(error: unknown): { repository?: RepositoryBlocker[] } {
  return error instanceof CloseOperationError && error.repository.length > 0
    ? { repository: error.repository.map(repositoryBlocker) }
    : {};
}

const SHARED_WORKTREE_REMEDY =
  'Archive just this Specification with integrateToTargetBranch=false, or use an explicit workspace-level Close.';
const LOCAL_CONFIG_REMEDY =
  'The worktree local configuration .nevo/local/config.yaml is not the unchanged copy Create made (changed, added by hand, or unreadable): move or delete it, then resume the same Close operation.';

/** Non-sensitive remedy fields of a mutating Close refusal; never the Engine message. */
function closeRefusalDetails(error: unknown): {
  remedy?: string;
  localConfig?: CloseOperationError['localConfig'];
  paths?: string[];
} {
  if (!(error instanceof CloseOperationError)) {
    return {};
  }

  if (error.code === 'CLOSE_SHARED_WORKTREE') {
    return { remedy: SHARED_WORKTREE_REMEDY };
  }

  if (error.code === 'CLOSE_LOCAL_CONFIG_MODIFIED') {
    return {
      remedy: LOCAL_CONFIG_REMEDY,
      ...(error.localConfig ? { localConfig: error.localConfig } : {}),
    };
  }

  if (error.code === 'CLOSE_EXTERNAL_MERGE_MISMATCH' && error.paths.length > 0) {
    return { paths: [...error.paths] };
  }

  return {};
}

function statusForCloseError(code: SafeCode): 400 | 404 | 409 | 422 | 503 {
  switch (code) {
    case 'CLOSE_INVALID':
      return 400;
    case 'CLOSE_EXTERNAL_MERGE_UNSUPPORTED':
      return 400;
    case 'SPEC_VALIDATION_ERROR':
      return 400;
    case 'CLOSE_CONFLICT':
    case 'CLOSE_BLOCKED':
    case 'CLOSE_SHARED_WORKTREE':
    case 'CLOSE_EXTERNAL_MERGE_MISMATCH':
    case 'CLOSE_LOCAL_CONFIG_MODIFIED':
    case 'REGISTRY_CONFLICT':
    case 'SPEC_CONFLICT':
    case 'BRANCH_ALREADY_EXISTS':
    case 'BRANCH_ALREADY_CHECKED_OUT':
    case 'WORKTREE_PATH_CONFLICT':
    case 'COMMIT_BLOCKED':
      return 409;
    case 'CLOSE_PREFLIGHT':
    case 'GIT_DISABLED':
    case 'BRANCH_PROTECTED':
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
    case 'CONTROL_LOCK_RECOVERY_REQUIRED':
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
    case 'COMMIT_FAILED':
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
  400: contractRef(CloseErrorSchema),
  401: contractRef(AuthenticationRequiredErrorResponseSchema),
  403: contractRef(AuthorizationForbiddenErrorResponseSchema),
  404: contractRef(CloseErrorSchema),
  409: contractRef(CloseErrorSchema),
  422: contractRef(CloseErrorSchema),
  503: contractRef(CloseErrorSchema),
} as const;

export const specsCloseEndpoint: FastifyPluginCallback<SpecsCloseEndpointOptions> = (
  app,
  options,
  done,
) => {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const projectId = () => options.engine?.context.project.projectId;
  const authWorktree = requireCapability({
    resource: SpecCapabilities,
    capability: SpecCapabilities.capabilities.CloseWorktree,
    scope: (request) => specScope(projectId(), (request.params as { specId: string }).specId),
  });
  const authSpec = requireCapability({
    resource: SpecCapabilities,
    capability: SpecCapabilities.capabilities.CloseSpecification,
    scope: (request) => specScope(projectId(), (request.params as { specId: string }).specId),
  });

  for (const kind of ['worktree-close', 'specification-close'] as const) {
    const url =
      kind === 'worktree-close' ? '/api/specs/:specId/worktree/close' : '/api/specs/:specId/close';
    const preHandler = kind === 'worktree-close' ? authWorktree : authSpec;
    const worktree = kind === 'worktree-close';
    const tags = [worktree ? 'Workspaces' : 'Specifications'];
    typed.post(
      url,
      {
        preHandler,
        schema: {
          tags,
          summary: worktree
            ? 'Close the linked worktree of a Specification'
            : 'Close a Specification',
          description: worktree
            ? 'Close the linked worktree associated with one Specification. Optional finishAfterExternalMerge:true is a person-initiated assertion of a previous external merge; the Engine proves whole-branch content equivalence before disposing without a second merge commit. The same flag is not accepted by Specification Close. Refusals include 409 CLOSE_EXTERNAL_MERGE_MISMATCH and 409 CLOSE_LOCAL_CONFIG_MODIFIED; a changed local config must be moved before replaying the same operation id. Git-off projects cannot close worktrees.'
            : 'Close (archive) a single Specification under its workflow gate, using the project Git policy and durable Engine journal. Optional integrateToTargetBranch:false archives without integration; Git-off mode supports archive-only even in a linked checkout, without a Git commit. The request never accepts finishAfterExternalMerge. A successful settled result is 200, an unsettled operation 202. Workflow/Session blockers are 409 CLOSE_BLOCKED; document commits pending are 409 DOCUMENT_COMMITS_PENDING; ordinary repository blockers are 422 CLOSE_PREFLIGHT. Do not retry uncertain Git effects with a different operationId.',
          params: CloseSpecParamsSchema,
          body:
            kind === 'worktree-close'
              ? CloseWorktreeRequestSchema
              : CloseSpecificationRequestSchema,
          response: {
            200: contractRef(CloseResultSchema),
            202: contractRef(CloseResultSchema),
            ...errors,
          },
        },
      },
      async (request, reply) => {
        reply.header('Cache-Control', 'no-store');
        const engine = options.engine;
        if (!engine) {
          return reply.code(503).send({ code: 'ENGINE_UNAVAILABLE', error: 'ENGINE_UNAVAILABLE' });
        }

        try {
          const { specId } = request.params;
          const body = request.body as {
            operationId: string;
            integrateToTargetBranch?: boolean;
            finishAfterExternalMerge?: boolean;
          };
          const plan = await authorizedPlan(
            request,
            engine,
            kind,
            specId,
            body.operationId,
            body.integrateToTargetBranch,
            body.finishAfterExternalMerge,
            // The admission commits the queued document changes first; the authorization plan must too.
            { flushDocumentCommits: true },
          );
          const result = await whileReleased(options.releaseWorkspace, plan.sourceWorkspace, () =>
            kind === 'worktree-close'
              ? closeWorktreeOperation(engine, {
                  specId,
                  operationId: body.operationId,
                  ...(body.finishAfterExternalMerge === undefined
                    ? {}
                    : { finishAfterExternalMerge: body.finishAfterExternalMerge }),
                })
              : // Specification Close never accepts finishAfterExternalMerge (owner decision
                // 2026-11-20); the schema already rejects a body that sends it.
                closeSpecificationOperation(engine, {
                  specId,
                  operationId: body.operationId,
                  ...(body.integrateToTargetBranch === undefined
                    ? {}
                    : { integrateToTargetBranch: body.integrateToTargetBranch }),
                }),
          );

          return reply.code(result.status === 'completed' ? 200 : 202).send(result);
        } catch (error) {
          const busy = busyRefusal(error);
          if (busy) {
            return reply.code(409).send(busy);
          }

          const refusal = documentRefusal(error);
          if (refusal) {
            return reply.code(refusal.status).send(refusal.body);
          }

          const code = safeCode(error);
          if (!code) {
            throw error;
          }

          return reply.code(statusForCloseError(code)).send({
            code,
            error: code,
            ...blockersOf(error),
            ...repositoryOf(error),
            ...closeRefusalDetails(error),
          });
        }
      },
    );

    typed.get(
      url + '/preview',
      {
        preHandler,
        schema: {
          tags,
          summary: worktree
            ? 'Preview closing the linked worktree of a Specification'
            : 'Preview closing a Specification',
          description: worktree
            ? 'Read-only preview of worktree disposal; optional finishAfterExternalMerge query value must be the literal string true. When selected, merge status already-merged-externally describes the chosen mode, not verified Git equivalence; actual Close proves it. Git-off worktrees cannot be closed.'
            : 'Read-only preview of Specification Close; shows integration intent, merge facts or blockers without mutating Git. Optional integrateToTargetBranch determines archive-only vs integrate; finishAfterExternalMerge is rejected at the schema boundary. Preview is advisory, not proof of future admission. Workflow blockers, running linked-checkout Sessions and pending document commits may prevent Close. No default integration branch is guessed.',
          params: CloseSpecParamsSchema,
          querystring: worktree
            ? CloseWorktreePreviewQuerySchema
            : CloseSpecificationPreviewQuerySchema,
          response: { 200: contractRef(ClosePreviewSchema), ...errors },
        },
      },
      async (request, reply) => {
        reply.header('Cache-Control', 'no-store');
        if (!options.engine) {
          return reply.code(503).send({ code: 'ENGINE_UNAVAILABLE', error: 'ENGINE_UNAVAILABLE' });
        }

        try {
          const engine = options.engine;
          const { specId } = request.params;
          // The schema is chosen per `kind` above, so its static type cannot be inferred here.
          const query = request.query as {
            integrateToTargetBranch?: boolean;
            finishAfterExternalMerge?: 'true';
          };
          const integrateToTargetBranch = query.integrateToTargetBranch;
          const finishAfterExternalMerge = query.finishAfterExternalMerge === 'true';
          // A fresh operation id: the read-only preview with its merge facts, never a journal.
          // finishAfterExternalMerge changes the previewed merge shape (no merge at all, instead of
          // an ordinary integration), so it is forwarded for Worktree Close. The Specification Close
          // preview query schema has no such field at all (owner decision 2026-11-20, same as its
          // request body): a preview request that sends it is rejected 400 at the schema boundary,
          // never silently ignored.
          const preview = await previewPublicCloseOperation(
            engine,
            kind === 'worktree-close'
              ? {
                  kind,
                  operationId: randomUUID(),
                  specId,
                  ...(finishAfterExternalMerge ? { finishAfterExternalMerge } : {}),
                }
              : {
                  kind,
                  operationId: randomUUID(),
                  specId,
                  ...(integrateToTargetBranch === undefined ? {} : { integrateToTargetBranch }),
                },
          );
          if (preview.integrationRequired) {
            projectIntegrationAllowed(request, engine);
          }

          await assertNoRunningTurns(options.runningSessions, preview.sourceWorkspace);

          return reply.code(200).send(preview);
        } catch (error) {
          const busy = busyRefusal(error);
          if (busy) {
            return reply.code(409).send(busy);
          }

          // Documents the Close would commit first, or wait for: answered as the Close would.
          const refusal = documentRefusal(error);
          if (refusal) {
            return reply.code(refusal.status).send(refusal.body);
          }

          const code = safeCode(error);
          if (!code) {
            throw error;
          }

          return reply.code(statusForCloseError(code)).send({
            code,
            error: code,
            ...blockersOf(error),
            ...repositoryOf(error),
            ...closeRefusalDetails(error),
          });
        }
      },
    );
  }

  // A Close the workflow blocks is not planned: its dialog reads what else holds the checkout here.
  typed.get(
    '/api/specs/:specId/close/occupancy',
    {
      preHandler: authSpec,
      schema: {
        tags: ['Specifications'],
        summary:
          'Read the agent Session Turns that keep a Specification Close from removing its worktree',
        description:
          'Read agent Session Turns holding the linked checkout a Specification Close might remove, without planning Close or touching Git. Empty blockers for no active Turns or a Specification in the primary checkout. Useful alongside workflow Close blockers; removing an occupied linked checkout is refused.',
        params: CloseSpecParamsSchema,
        response: { 200: CloseOccupancySchema, ...errors },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      if (!options.engine) {
        return reply.code(503).send({ code: 'ENGINE_UNAVAILABLE', error: 'ENGINE_UNAVAILABLE' });
      }

      try {
        const registry = await readRegistrySnapshot(options.engine);

        return reply.code(200).send({
          blockers: await specificationOccupancy(
            registry,
            request.params.specId,
            options.runningSessions,
          ),
        });
      } catch (error) {
        const code = safeCode(error);
        if (!code) {
          throw error;
        }

        return reply.code(statusForCloseError(code)).send({ code, error: code });
      }
    },
  );

  // Workspace scope is not an alias for an arbitrary Spec ID. Authorization
  // runs BEFORE the read-only preview or journal inspection: unauthorized
  // callers cannot enumerate any canonical workspace occupant.
  typed.get(
    '/api/workspaces/:workspaceId/close/preview',
    {
      schema: {
        tags: ['Workspaces'],
        summary: 'Preview closing a workspace',
        description:
          'Read-only preview of closing one whole registered workspace: identifies all canonical Specification occupants and integration destination. Project-wide Git close-workspace and integrate are required before exposing occupants. It is not permission to close only one shared Specification; previews cannot promise future mutation success.',
        params: CloseWorkspaceParamsSchema,
        response: { 200: CloseWorkspacePreviewSchema, ...errors },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const engine = options.engine;
      if (!engine) {
        return reply.code(503).send({ code: 'ENGINE_UNAVAILABLE', error: 'ENGINE_UNAVAILABLE' });
      }

      try {
        projectWorkspaceCloseAllowed(request, engine);
        projectIntegrationAllowed(request, engine);

        const plan = await planPublicWorkspaceCloseOperation(engine, {
          workspaceId: request.params.workspaceId,
          operationId: randomUUID(),
        });
        await assertNoRunningTurns(options.runningSessions, plan.sourceWorkspace);

        return reply.code(200).send(plan);
      } catch (error) {
        const busy = busyRefusal(error);
        if (busy) {
          return reply.code(409).send(busy);
        }

        // Documents the Close would commit first, or wait for: answered as the Close would.
        const refusal = documentRefusal(error);
        if (refusal) {
          return reply.code(refusal.status).send(refusal.body);
        }

        const code = safeCode(error);
        if (!code) {
          throw error;
        }

        return reply.code(statusForCloseError(code)).send({ code, error: code });
      }
    },
  );

  typed.post(
    '/api/workspaces/:workspaceId/close',
    {
      schema: {
        tags: ['Workspaces'],
        summary: 'Close a workspace',
        description:
          'Close and integrate an entire registered linked workspace including all its canonical Specifications. Requires project-wide Git close-workspace and integrate. Uses durable operationId, safe whole-branch integration, group rebind and disposal; 200 when completed, 202 while unsettled. Git off refuses 400 CLOSE_INVALID. Mutation never drops unrelated workspace contents or active Session Turns.',
        params: CloseWorkspaceParamsSchema,
        body: CloseWorktreeRequestSchema,
        response: {
          200: contractRef(CloseWorkspaceResultSchema),
          202: contractRef(CloseWorkspaceResultSchema),
          ...errors,
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const engine = options.engine;
      if (!engine) {
        return reply.code(503).send({ code: 'ENGINE_UNAVAILABLE', error: 'ENGINE_UNAVAILABLE' });
      }

      try {
        projectWorkspaceCloseAllowed(request, engine);
        projectIntegrationAllowed(request, engine);
        const params = {
          workspaceId: request.params.workspaceId,
          operationId: request.body.operationId,
        };
        // A retry uses the stored immutable plan, not a client supplied list.
        const plan = await planPublicWorkspaceCloseOperation(engine, params, {
          flushDocumentCommits: true,
        });
        const result = await whileReleased(options.releaseWorkspace, plan.sourceWorkspace, () =>
          closeWorkspaceOperation(engine, params),
        );

        return reply.code(result.status === 'completed' ? 200 : 202).send(result);
      } catch (error) {
        const busy = busyRefusal(error);
        if (busy) {
          return reply.code(409).send(busy);
        }

        const refusal = documentRefusal(error);
        if (refusal) {
          return reply.code(refusal.status).send(refusal.body);
        }

        const code = safeCode(error);
        if (!code) {
          throw error;
        }

        return reply.code(statusForCloseError(code)).send({ code, error: code });
      }
    },
  );

  typed.get(
    '/api/workspaces/:workspaceId/close/operations/:operationId',
    {
      schema: {
        tags: ['Workspaces'],
        summary: 'Read a workspace close operation',
        description:
          'Read the durable Close operation observation; it does not retry, replay uncertain Git effects or mutate repository state. Use the same operationId for recovery/retry, and refer to the operator recovery protocol when resolution is needed.',
        params: CloseWorkspaceOperationParamsSchema,
        response: { 200: contractRef(CloseWorkspaceResultSchema), ...errors },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const engine = options.engine;
      if (!engine) {
        return reply.code(503).send({ code: 'ENGINE_UNAVAILABLE', error: 'ENGINE_UNAVAILABLE' });
      }

      try {
        projectWorkspaceCloseAllowed(request, engine);
        projectIntegrationAllowed(request, engine);
        const result = await inspectPublicWorkspaceCloseOperation(
          engine,
          request.params.operationId,
          request.params.workspaceId,
        );
        if (!result) {
          return reply.code(404).send({ code: 'CLOSE_NOT_FOUND', error: 'CLOSE_NOT_FOUND' });
        }

        return reply.code(200).send(result);
      } catch (error) {
        const code = safeCode(error);
        if (!code) {
          throw error;
        }

        return reply.code(statusForCloseError(code)).send({ code, error: code });
      }
    },
  );

  typed.get(
    '/api/specs/:specId/close/operations/:operationId',
    {
      preHandler: authSpec,
      schema: {
        tags: ['Specifications'],
        summary: 'Read a Specification close operation',
        description:
          'Read the durable Close operation observation; it does not retry, replay uncertain Git effects or mutate repository state. Use the same operationId for recovery/retry, and refer to the operator recovery protocol when resolution is needed.',
        params: CloseOperationParamsSchema,
        response: { 200: contractRef(CloseResultSchema), ...errors },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      if (!options.engine) {
        return reply.code(503).send({ code: 'ENGINE_UNAVAILABLE', error: 'ENGINE_UNAVAILABLE' });
      }

      const { specId, operationId } = request.params;
      const existing = await inspectPublicCloseOperation(options.engine, operationId);
      if (existing?.specId !== specId || existing.kind !== 'specification-close') {
        return reply.code(404).send({ code: 'CLOSE_NOT_FOUND', error: 'CLOSE_NOT_FOUND' });
      }

      if (existing.integrationRequired) {
        projectIntegrationAllowed(request, options.engine);
      }

      return reply.code(200).send(existing);
    },
  );

  typed.post(
    '/api/specs/:specId/close/operations/:operationId/reconcile-scratch',
    {
      preHandler: authSpec,
      schema: {
        tags: ['Specifications'],
        summary: 'Reconcile the scratch checkout of a close operation',
        description:
          'Reconcile an interrupted Close scratch checkout after trusted operator acknowledgement that no Git process is still active. Requires confirmedNoActiveGitProcess:true; this is not an inference about process state, and the Engine additionally checks physical scratch evidence.',
        params: CloseOperationParamsSchema,
        body: CloseScratchReconciliationRequestSchema,
        response: { 200: contractRef(CloseResultSchema), ...errors },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const engine = options.engine;
      if (!engine) {
        return reply.code(503).send({ code: 'ENGINE_UNAVAILABLE', error: 'ENGINE_UNAVAILABLE' });
      }

      const { specId, operationId } = request.params;
      try {
        // Project-wide Git grant is required BEFORE journal inspection.
        projectIntegrationAllowed(request, engine);
        const existing = await inspectPublicCloseOperation(engine, operationId);
        if (existing?.specId !== specId || existing.kind !== 'specification-close') {
          return reply.code(404).send({ code: 'CLOSE_NOT_FOUND', error: 'CLOSE_NOT_FOUND' });
        }

        const settled = await reconcileArchivedConflictScratchOperation(
          engine,
          operationId,
          request.body.confirmedNoActiveGitProcess,
        );

        return reply.code(200).send(settled);
      } catch (error) {
        const code = safeCode(error);
        if (!code) {
          throw error;
        }

        return reply.code(statusForCloseError(code)).send({
          code,
          error: code,
          ...closeRefusalDetails(error),
        });
      }
    },
  );

  typed.get(
    '/api/specs/:specId/worktree/close/operations/:operationId',
    {
      preHandler: authWorktree,
      schema: {
        tags: ['Workspaces'],
        summary: 'Read a worktree close operation',
        description:
          'Read the durable Close operation observation; it does not retry, replay uncertain Git effects or mutate repository state. Use the same operationId for recovery/retry, and refer to the operator recovery protocol when resolution is needed.',
        params: CloseOperationParamsSchema,
        response: { 200: contractRef(CloseResultSchema), ...errors },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      if (!options.engine) {
        return reply.code(503).send({ code: 'ENGINE_UNAVAILABLE', error: 'ENGINE_UNAVAILABLE' });
      }

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

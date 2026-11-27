import {
  inspectCreateOptions,
  inspectPublicCreateOperation,
  ownExecutorIdentity,
  proveExecutorState,
  readArchetypeCatalogue,
  readPublicCreateOperationRow,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';
import { join } from 'node:path';

import { Type } from 'typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginCallback } from 'fastify';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import { ArchetypeCatalogueSchema } from '@nevo/specflow-contracts/documents';
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

import { requireCapability, type RequestAuthorization } from '../../auth';
import {
  deriveOperationStatus,
  registerOperationEventsRoute,
  type OperationEventsStreamOptions,
  type OperationProgressRegistry,
} from '../../operations';
import { matchesEtag, sendNotModified } from '../../../server/etag';
import { catalogueEtag } from './catalogue-etag';
import { createErrorCode, createErrorDetails, statusForCreateError } from './error-status';
import { prefersRespondAsync } from './respond-async';
import { createOperationPath, runCreate } from './run-create';
import type { CreateFirstStep } from './first-step';
import {
  CREATE_REQUEST_RELATIVE_DIR,
  createFileCreateRequestStore,
  type CreateRequestStore,
} from './request-store';
import { resumeAcceptedCreates } from './resume';
import { contractRef } from '../../../server/shared-contracts';

/**
 * Route-level `bodyLimit` of `POST /api/specs` (reference "Limits": HTTP body, Save and Create).
 * Above the content caps (1 MiB per file, 1 MiB of added files) to leave room for JSON escaping.
 */
const CREATE_BODY_LIMIT_BYTES = 2 * 1024 * 1024;
const DEFAULT_CLOSE_GRACE_MS = 30_000;

export interface SpecsCreateEndpointOptions {
  readonly engine?: SpecFlowEngine;
  /** Optional live progress (SSE) for operations that carry a client `operationId`. */
  readonly progress?: OperationProgressRegistry;
  readonly stream?: OperationEventsStreamOptions;
  /** Idle time after which a journal without a live writer is interrupted (tests; default 5 min). */
  readonly staleAfterMs?: number;
  /** How long `close()` waits for Creates still running (default 30 s). */
  readonly closeGraceMs?: number;
  /** Injectable clock (tests). */
  readonly now?: () => Date;
  /**
   * The owner of Create's first-step intents (start the first step with an agent after Create).
   * Absent: this Runtime runs no agent and a request with `firstStep` is refused.
   */
  readonly firstStep?: CreateFirstStep;
  /** The Runtime's project, for the Manage check of a Create that starts an agent. */
  readonly projectId?: () => string | undefined;
  /** Replaces the Runtime's record of accepted Creates (tests); default: files under the Project Home state. */
  readonly requests?: CreateRequestStore;
  /**
   * The authorization of a stored principal, for the startup rerun of a Create (it runs without a
   * request). Absent or undefined: the principal cannot be checked and the Create is not rerun.
   */
  readonly authorizePrincipal?: (principal: string) => RequestAuthorization | undefined;
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
  // Creates are not bound to their request, so shutdown has to wait for them: a Create killed
  // mid-stage leaves a non terminal journal that only an operator can recover.
  const inFlight = new Set<Promise<unknown>>();
  const track = (finished: Promise<unknown>): void => {
    inFlight.add(finished);
    const forget = () => inFlight.delete(finished);
    finished.then(forget, forget);
  };

  const closeGraceMs = options.closeGraceMs ?? DEFAULT_CLOSE_GRACE_MS;
  const now = options.now ?? (() => new Date());
  const startedAt = now().getTime();
  const engineForRequests = options.engine;
  const requests: CreateRequestStore | undefined =
    options.requests ??
    (engineForRequests
      ? createFileCreateRequestStore(() =>
          join(engineForRequests.context.project.stateRoot, CREATE_REQUEST_RELATIVE_DIR),
        )
      : undefined);
  let closing = false;
  app.addHook('onClose', async () => {
    closing = true;
    // A start interrupted by the shutdown stays pending for the next Runtime start.
    options.firstStep?.stop();
    if (inFlight.size === 0) {
      return;
    }

    let timer: NodeJS.Timeout | undefined;
    const expired = new Promise<void>((resolve) => {
      timer = setTimeout(resolve, closeGraceMs);
      timer.unref();
    });
    try {
      await Promise.race([Promise.allSettled([...inFlight]), expired]);
    } finally {
      clearTimeout(timer);
    }
  });

  // The Runtime startup steps, in the background after the server is ready (the Session
  // coordinator recovered first): Creates a previous Runtime accepted and did not see through are
  // run again (resumed or settled from their journal), then a Create that completed while this
  // Runtime was stopped before its agent start is started, as the principal stored with it.
  const firstStep = options.firstStep;
  const resumeEngine = options.engine;
  if (resumeEngine && (requests || firstStep)) {
    app.addHook('onReady', () => {
      const resumed = (async () => {
        if (requests) {
          await resumeAcceptedCreates({
            store: requests,
            startedAt,
            now,
            stopped: () => closing,
            executorState: async (executor) =>
              proveExecutorState(executor, await ownExecutorIdentity()),
            journalExists: async (operationId) =>
              (await inspectPublicCreateOperation(resumeEngine, operationId)) !== undefined,
            authorized: (record) => {
              try {
                const authz = options.authorizePrincipal?.(record.principal);
                const projectId = options.projectId?.();
                const scope: Readonly<Record<string, string>> =
                  projectId === undefined ? {} : { projectId };

                return (
                  authz !== undefined &&
                  authz.can({
                    resource: SpecCapabilities,
                    capability: SpecCapabilities.capabilities.Create,
                    scope: {},
                  }) &&
                  (record.request.firstStep === undefined ||
                    authz.can({
                      resource: SpecCapabilities,
                      capability: SpecCapabilities.capabilities.Manage,
                      scope,
                    }))
                );
              } catch {
                return false;
              }
            },
            run: (record) =>
              runCreate({
                engine: resumeEngine,
                body: record.request,
                respondAsync: false,
                progress: options.progress,
                track,
                onDetachedFailure: () => undefined,
                requests: { store: requests, principal: record.principal, now, resumed: true },
                ...(firstStep
                  ? { firstStep: { owner: firstStep, principal: record.principal } }
                  : {}),
              }),
            onFailure: (operationId, error) => {
              if (!createErrorCode(error)) {
                app.log.warn({ operationId, err: error }, 'Create resume failed');
              }
            },
          }).catch((error: unknown) => app.log.warn({ err: error }, 'Create resume could not run'));
        }

        await firstStep
          ?.resume(resumeEngine, (operationId, error) =>
            app.log.warn({ operationId, err: error }, 'Create first-step resume failed'),
          )
          .catch((error: unknown) =>
            app.log.warn({ err: error }, 'Create first-step resume could not run'),
          );
      })();
      track(resumed);
    });
  }

  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/api/specs/create-options',
    {
      preHandler: requireCapability({
        resource: SpecCapabilities,
        capability: SpecCapabilities.capabilities.Create,
        scope: {},
      }),
      schema: {
        tags: ['Specifications'],
        summary: 'Read the options of a Specification creation',
        description:
          'Read-only admission options for Specification Create, requiring project-wide spec.create. Snapshot only: not a branch/workspace reservation. Options contain Create facts keyed by workspaceId, joined to the separately authorized GET /api/workspaces; specCount counts all occupants, not only viewable ones. worktreesRoot.path is an absolute machine-local directory exposed to any Create-capable principal; clients needing workspace names/paths also require workspace.view. Invalid Git policy produces 200 with Git-dependent choices marked unavailable, while Create mutations fail closed. Inspect current policy and registry again on mutation.',
        response: {
          200: CreateOptionsSchema,
          400: contractRef(CreateSpecErrorSchema),
          401: contractRef(AuthenticationRequiredErrorResponseSchema),
          403: contractRef(AuthorizationForbiddenErrorResponseSchema),
          409: contractRef(CreateSpecErrorSchema),
          422: contractRef(CreateSpecErrorSchema),
          503: contractRef(CreateSpecErrorSchema),
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

      try {
        const { commits, ...read } = await inspectCreateOptions(engine, {
          // An invalid Git section degrades the answer (reason `git-policy-invalid`); the problem
          // goes to the server log only, never into the response.
          onPolicyProblem: (problem) =>
            request.log.warn({ problem }, 'Invalid Git policy: create-options served without Git'),
        });

        return reply.code(200).send({
          ...read,
          // The registry facts (kind, name, path) are served by `GET /api/workspaces`; Create
          // options carry only what Create decides on (and the count of every bound Specification).
          workspaces: read.workspaces.map(
            ({ kind: _kind, name: _name, path: _path, ...facts }) => facts,
          ),
          baseRefs: [...read.baseRefs],
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
        const code = createErrorCode(error);
        if (!code) {
          throw error;
        }

        const details = createErrorDetails(error);

        return reply
          .code(statusForCreateError(code))
          .send({ error: code, code, ...(details ? { details } : {}) });
      }
    },
  );

  // The archetype catalogue the Create form and the CLI choose from. Same capability as
  // `create-options`; the ETag is the catalogue revision, so a client can revalidate cheaply.
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/api/specs/archetypes',
    {
      preHandler: requireCapability({
        resource: SpecCapabilities,
        capability: SpecCapabilities.capabilities.Create,
        scope: {},
      }),
      config: {
        openApiParameters: {
          header: {
            'If-None-Match':
              'ETag from an earlier archetype catalogue response; when unchanged the server returns 304 without a body.',
          },
        },
      },
      schema: {
        tags: ['Specifications'],
        summary: 'List the Specification archetypes',
        description:
          'List project archetype definitions for Create. Requires project-wide spec.create. ETag is the catalogue revision; If-None-Match may yield 304. Client must select archetype id, integer version and catalogue revision; there is no implicit default archetype for the request. Unreadable or missing definitions are not silently replaced by demo fixtures.',
        response: {
          200: ArchetypeCatalogueSchema,
          304: Type.Null(),
          401: contractRef(AuthenticationRequiredErrorResponseSchema),
          403: contractRef(AuthorizationForbiddenErrorResponseSchema),
          503: contractRef(CreateSpecErrorSchema),
        },
      },
    },
    async (request, reply) => {
      const engine = options.engine;
      if (!engine) {
        return reply.code(503).send({ error: 'ENGINE_UNAVAILABLE', code: 'ENGINE_UNAVAILABLE' });
      }

      const catalogue = await readArchetypeCatalogue(engine);
      const etag = catalogueEtag(catalogue);
      reply.header('ETag', etag).header('Cache-Control', 'private, no-cache');
      if (matchesEtag(request.headers['if-none-match'], etag)) {
        return sendNotModified(reply);
      }

      return reply.code(200).send(catalogue);
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
        tags: ['Operations'],
        summary: 'Read the status of a Specification creation',
        description:
          'Read-only sanitized observation of one Specification Create operation, requiring project-wide spec.create. A running operation, remembered failure, recovery-required journal or completed result are distinguished by the response union. Does not run Git, initiate recovery, claim process liveness or disclose filesystem paths/internal journal stages. After an uncertain response poll this endpoint with the original operationId; never issue a fresh Create. An idle journal can be recovery-required with OPERATION_INTERRUPTED.',
        params: CreateOperationParamsSchema,
        response: {
          200: CreateOperationInspectionSchema,
          400: contractRef(CreateSpecErrorSchema),
          401: contractRef(AuthenticationRequiredErrorResponseSchema),
          403: contractRef(AuthorizationForbiddenErrorResponseSchema),
          404: contractRef(CreateSpecErrorSchema),
          409: contractRef(CreateSpecErrorSchema),
          422: contractRef(CreateSpecErrorSchema),
          503: contractRef(CreateSpecErrorSchema),
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const engine = options.engine;
      if (!engine) {
        return reply.code(503).send({
          code: 'ENGINE_UNAVAILABLE',
          error: 'ENGINE_UNAVAILABLE',
        });
      }

      try {
        const result = await inspectPublicCreateOperation(engine, request.params.operationId);
        // The Runtime's record of the request: a Create it accepted is readable before (and
        // without) an Engine journal, and keeps how its last run ended.
        const accepted = await requests?.read(request.params.operationId).catch(() => undefined);
        if (!result) {
          if (accepted) {
            return reply.code(200).send(
              accepted.failure
                ? {
                    operationId: request.params.operationId,
                    kind: 'specification-create' as const,
                    // A refusal is final; an open outcome names why only an operator can go on.
                    status: accepted.failure.definite
                      ? ('failed' as const)
                      : ('recovery-required' as const),
                    code: accepted.failure.code,
                  }
                : {
                    operationId: request.params.operationId,
                    kind: 'specification-create' as const,
                    status: 'in-progress' as const,
                  },
            );
          }

          return reply.code(404).send({
            code: 'CREATE_NOT_FOUND',
            error: 'CREATE_NOT_FOUND',
          });
        }

        // The journal has no failed state: a run that failed after reservation leaves it non-terminal.
        // The status is derived exactly like the operations list does (one shared status table):
        // the registry overlay (also a recently failed run), else the journal idle time.
        if (result.status === 'completed') {
          // A Create with a first-step intent is complete once its agent start is settled.
          const intent = await options.firstStep?.read(request.params.operationId);
          if (!intent) {
            return reply.code(200).send(result);
          }

          return reply.code(200).send(
            intent.result
              ? { ...result, firstStep: intent.result }
              : {
                  operationId: request.params.operationId,
                  kind: 'specification-create' as const,
                  status: 'in-progress' as const,
                },
          );
        }

        if (accepted?.failure) {
          // How the last run after the reservation ended (for example of a resumed run): the journal
          // stays unfinished, the Runtime's record says why: a refusal, or what an operator must do.
          return reply.code(200).send({
            operationId: request.params.operationId,
            kind: 'specification-create' as const,
            status: accepted.failure.definite
              ? ('failed' as const)
              : ('recovery-required' as const),
            code: accepted.failure.code,
          });
        }

        const row = await readPublicCreateOperationRow(engine, request.params.operationId);
        if (!row) {
          return reply.code(200).send(result);
        }

        const derived = deriveOperationStatus(
          { state: result.status, updatedAt: row.updatedAt },
          options.progress?.recall(request.params.operationId, 'specification-create'),
          (options.now ?? (() => new Date()))().getTime(),
          options.staleAfterMs,
        );
        if (derived.status === 'failed' && derived.code !== undefined) {
          return reply.code(200).send({
            operationId: request.params.operationId,
            kind: 'specification-create',
            status: 'failed',
            code: derived.code,
          });
        }

        return reply.code(200).send({
          operationId: request.params.operationId,
          kind: 'specification-create',
          status: derived.status === 'recovery-required' ? 'recovery-required' : 'in-progress',
          ...(derived.status === 'recovery-required' && derived.code ? { code: derived.code } : {}),
        });
      } catch (error) {
        const code = createErrorCode(error);
        if (!code) {
          throw error;
        }

        const details = createErrorDetails(error);

        return reply
          .code(statusForCreateError(code))
          .send({ error: code, code, ...(details ? { details } : {}) });
      }
    },
  );

  // Live progress of the same operation: authorized exactly like the inspection endpoint above.
  if (options.progress) {
    registerOperationEventsRoute(app, {
      path: '/api/specs/create/operations/:operationId/events',
      kind: 'specification-create',
      summary: 'Stream the progress of a Specification creation',
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
      // Above the content caps (1 MiB per file, 1 MiB of added files) to leave room for JSON
      // escaping; a larger body is answered 413 before it is parsed.
      bodyLimit: CREATE_BODY_LIMIT_BYTES,
      preHandler: requireCapability({
        resource: SpecCapabilities,
        capability: SpecCapabilities.capabilities.Create,
        scope: {},
      }),
      config: {
        openApiParameters: {
          header: {
            Prefer:
              'RFC 7240 request preference; respond-async asks the Runtime to validate and reserve before returning 202. Clients must also handle synchronous 201.',
          },
        },
      },
      schema: {
        tags: ['Specifications'],
        summary: 'Create a Specification',
        description:
          'Create a Specification and its selected archetype documents atomically under Engine admission. Requires project-wide spec.create; with firstStep also project-wide spec.manage, and the first workflow step of the archetype must be one an agent may do (else 400 CREATE_OPERATION_INVALID before anything is written). firstStep asks the Runtime to start that step with the given agent, as the caller, once the Specification exists: the intent is stored with the operation, resumed after a Runtime restart, and the operation stays in-progress until the start is settled; the completed result then carries firstStep (started with its Session, or not-started with the refusal code and agent option). A refused start never undoes the Create. A retry must carry the same firstStep (or none when the first request had none), else 409 CREATE_CONFLICT. Omitted target means primary checkout; explicit existing/new-worktree choices use registered workspaces and validated Git policy. Body limit is 2 MiB. A retry MUST reuse the same operationId and identical request; changed data yields 409 CREATE_CONFLICT. With Prefer: respond-async, the Runtime validates/reserves and returns 202 with Location and Preference-Applied while detached work continues, even after client disconnect. Without the preference, successful Create normally returns 201. The inspection route reports the outcome; SSE is optional and display-only. Git-off success may contain uncommitted:true. Invalid Git policy fails closed.',
        body: CreateSpecRequestSchema,
        response: {
          201: CreatedSpecSchema,
          202: {
            ...CreateOperationAcceptedSchema,
            headers: {
              Location: {
                type: 'string',
                description: 'Path of the accepted Create operation inspection resource.',
              },
              'Preference-Applied': {
                type: 'string',
                description: 'respond-async, when the asynchronous preference was honored.',
              },
            },
          },
          400: contractRef(CreateSpecErrorSchema),
          401: contractRef(AuthenticationRequiredErrorResponseSchema),
          403: contractRef(AuthorizationForbiddenErrorResponseSchema),
          409: contractRef(CreateSpecErrorSchema),
          413: contractRef(CreateSpecErrorSchema),
          422: contractRef(CreateSpecErrorSchema),
          503: contractRef(CreateSpecErrorSchema),
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

      try {
        if (request.body.firstStep) {
          // Starting the first step drives the new Specification's run: the caller must be allowed
          // to manage it (a project-wide grant; the Specification has no id yet).
          const projectId = options.projectId?.();
          request.authz.require({
            resource: SpecCapabilities,
            capability: SpecCapabilities.capabilities.Manage,
            scope: projectId === undefined ? {} : { projectId },
          });
        }

        const outcome = await runCreate({
          engine,
          body: request.body,
          respondAsync: prefersRespondAsync(request.headers.prefer),
          progress: options.progress,
          track,
          onDetachedFailure: (error) => request.log.error({ err: error }, 'Detached Create failed'),
          ...(requests
            ? {
                requests: {
                  store: requests,
                  principal: request.authz.readContext().subject,
                  now,
                },
              }
            : {}),
          ...(options.firstStep
            ? {
                firstStep: {
                  owner: options.firstStep,
                  principal: request.authz.readContext().subject,
                },
              }
            : {}),
        });
        if (outcome.kind === 'accepted') {
          return reply
            .code(202)
            .header('Location', createOperationPath(outcome.operationId))
            .header('Preference-Applied', CREATE_RESPOND_ASYNC_PREFERENCE)
            .send({
              operationId: outcome.operationId,
              kind: 'specification-create',
              status: 'in-progress',
            });
        }

        return reply.code(201).send(outcome.created);
      } catch (error) {
        const code = createErrorCode(error);
        if (!code) {
          throw error;
        }

        const details = createErrorDetails(error);

        return reply
          .code(statusForCreateError(code))
          .send({ error: code, code, ...(details ? { details } : {}) });
      }
    },
  );
  done();
};

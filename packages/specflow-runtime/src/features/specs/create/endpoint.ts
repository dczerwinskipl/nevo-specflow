import {
  HTTP_BODY_SAVE_AND_CREATE_MAX_BYTES,
  inspectCreateOptions,
  inspectPublicCreateOperation,
  projectCatalogue,
  readPublicCreateOperationRow,
  type SpecFlowEngine,
} from '@nevo/specflow-engine';
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

import { requireCapability } from '../../auth';
import {
  deriveOperationStatus,
  registerOperationEventsRoute,
  type OperationEventsStreamOptions,
  type OperationProgressRegistry,
} from '../../operations';
import { matchesEtag } from '../../../server/etag';
import { createErrorCode, statusForCreateError } from './error-status';
import { prefersRespondAsync } from './respond-async';
import { createOperationPath, runCreate } from './run-create';

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
  app.addHook('onClose', async () => {
    if (inFlight.size === 0) return;
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
          workspaces: [...read.workspaces],
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
        if (!code) throw error;
        return reply.code(statusForCreateError(code)).send({ error: code, code });
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
      schema: {
        response: {
          200: ArchetypeCatalogueSchema,
          304: Type.Null(),
          401: AuthenticationRequiredErrorResponseSchema,
          403: AuthorizationForbiddenErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      // The catalogue is resolved in memory; the await keeps the handler shape of its siblings.
      const catalogue = await Promise.resolve(projectCatalogue());
      const etag = `"${catalogue.revision}"`;
      reply.header('ETag', etag).header('Cache-Control', 'private, no-cache');
      // A 304 carries no body on the wire (Node drops it); null only satisfies the typed reply.
      if (matchesEtag(request.headers['if-none-match'], etag)) {
        return reply.code(304).send(null);
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
        // The status is derived exactly like the operations list does (one shared status table):
        // the registry overlay (also a recently failed run), else the journal idle time.
        if (result.status === 'completed') {
          return reply.code(200).send(result);
        }
        const row = await readPublicCreateOperationRow(engine, request.params.operationId);
        if (!row) return reply.code(200).send(result);
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
      // Above the content caps (1 MiB per file, 1 MiB of added files) to leave room for JSON
      // escaping; a larger body is answered 413 before it is parsed.
      bodyLimit: HTTP_BODY_SAVE_AND_CREATE_MAX_BYTES,
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
          413: CreateSpecErrorSchema,
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

      try {
        const outcome = await runCreate({
          engine,
          body: request.body,
          respondAsync: prefersRespondAsync(request.headers.prefer),
          progress: options.progress,
          track,
          onDetachedFailure: (error) => request.log.error({ err: error }, 'Detached Create failed'),
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
        if (!code) throw error;
        return reply.code(statusForCreateError(code)).send({ error: code, code });
      }
    },
  );
  done();
};

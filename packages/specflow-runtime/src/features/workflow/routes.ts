import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import {
  AbandonSpecificationRequestSchema,
  AbandonSpecificationResultSchema,
  FinishWorkflowRequestSchema,
  FinishWorkflowResultSchema,
  ReturnWorkflowRequestSchema,
  ReturnWorkflowResultSchema,
  StartWorkflowRequestSchema,
  StartWorkflowResultSchema,
  WorkflowActionProjectionSchema,
  WorkflowErrorSchema,
  WorkflowSpecParamsSchema,
  WorkflowTaskParamsSchema,
  type StartWorkflowResult,
} from '@nevo/specflow-contracts/workflow';
import type { StartResult, WorkflowSubject } from '@nevo/specflow-engine';
import type { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';

import { requireCapability, type ResourceCapability } from '../auth';
import { specScope, type ProjectIdSource } from '../specs';
import { contractRef } from '../../server/shared-contracts';
import type { WorkflowPort } from './port';
import { WorkflowUnavailableError, ownerActorOf, workflowFailure } from './refusal';
import { toWire } from './wire';

export interface WorkflowRoutesOptions {
  /** Absent: every route answers 503 `WORKFLOW_UNAVAILABLE`, like an unreadable document source. */
  readonly port?: WorkflowPort;
  /** The Runtime's project; see `specScope`. */
  readonly projectId?: ProjectIdSource;
}

/** A command body is a few short fields. */
const BODY_LIMIT_BYTES = 64 * 1024;

const errors = {
  401: contractRef(AuthenticationRequiredErrorResponseSchema),
  403: contractRef(AuthorizationForbiddenErrorResponseSchema),
  404: contractRef(WorkflowErrorSchema),
  409: contractRef(WorkflowErrorSchema),
  422: contractRef(WorkflowErrorSchema),
  503: contractRef(WorkflowErrorSchema),
} as const;

function presentStart(result: StartResult): StartWorkflowResult {
  return result.kind === 'terminal'
    ? { kind: 'terminal', subject: result.subject }
    : {
        kind: result.kind,
        subject: result.subject,
        step: toWire(result.context.step),
        attempt: result.context.attempt,
      };
}

/** The port, or one that refuses every call because there is no backend. */
function unavailablePort(port: WorkflowPort | undefined): WorkflowPort {
  if (port) {
    return port;
  }

  const refuse = (): never => {
    throw new WorkflowUnavailableError();
  };

  return { actions: refuse, start: refuse, finish: refuse, return: refuse, abandon: refuse };
}

/** Turns a workflow refusal thrown in the handler into the stable answer; a defect propagates. */
function refusing<Request, Result>(
  handler: (request: Request, reply: FastifyReply) => Promise<Result>,
): (request: Request, reply: FastifyReply) => Promise<Result> {
  return async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    try {
      return await handler(request, reply);
    } catch (error) {
      const failure = workflowFailure(error);
      if (!failure) {
        throw error;
      }

      // The failure statuses and body are declared by every route (`errors`).
      if (failure.body.code === 'CONTROL_LOCK_BUSY') {
        reply.header('Retry-After', '1');
      }

      void reply.code(failure.status).send(failure.body);

      return reply as unknown as Result;
    }
  };
}

/**
 * The workflow action routes: the projection of what the owner may do, and the owner commands start,
 * finish, return and (for a Specification) abandon. `View` reads, `Manage` drives a run; abandoning a
 * Specification is a close without realization, so it needs the close capability. The actor is the
 * authenticated caller, never part of a request.
 */
export const workflowEndpoint: FastifyPluginCallback<WorkflowRoutesOptions> = (
  app,
  options,
  done,
) => {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const port: WorkflowPort = unavailablePort(options.port);
  const guard = (capability: ResourceCapability<typeof SpecCapabilities>) =>
    requireCapability({
      resource: SpecCapabilities,
      capability,
      scope: (request) =>
        specScope(options.projectId?.(), (request.params as { specId: string }).specId),
    });
  const view = guard(SpecCapabilities.capabilities.View);
  const manage = guard(SpecCapabilities.capabilities.Manage);
  const close = guard(SpecCapabilities.capabilities.CloseSpecification);
  const actorOf = (request: FastifyRequest) => ownerActorOf(request.authz.readContext().subject);

  const subjects = [
    {
      base: '/api/specs/:specId/workflow',
      params: WorkflowSpecParamsSchema,
      subject: (params: { specId: string }): WorkflowSubject => ({
        kind: 'specification',
        specId: params.specId,
      }),
      label: 'Specification',
    },
    {
      base: '/api/specs/:specId/tasks/:taskId/workflow',
      params: WorkflowTaskParamsSchema,
      subject: (params: { specId: string; taskId?: string }): WorkflowSubject => ({
        kind: 'task',
        specId: params.specId,
        taskId: params.taskId ?? '',
      }),
      label: 'Task',
    },
  ] as const;

  for (const { base, params, subject, label } of subjects) {
    const subjectOf = (request: FastifyRequest) => subject(request.params as never);
    const tags = ['Workflow'];

    typed.get(
      `${base}/actions`,
      {
        onRequest: view,
        schema: {
          tags,
          summary: `Read the workflow actions of a ${label}`,
          params,
          response: { 200: contractRef(WorkflowActionProjectionSchema), ...errors },
        },
      },
      refusing(async (request, reply) =>
        reply.code(200).send(toWire(await port.actions(subjectOf(request)))),
      ),
    );

    typed.post(
      `${base}/start`,
      {
        onRequest: manage,
        bodyLimit: BODY_LIMIT_BYTES,
        schema: {
          tags,
          summary: `Start or resume the next workflow step of a ${label}`,
          params,
          body: StartWorkflowRequestSchema,
          response: { 200: StartWorkflowResultSchema, ...errors },
        },
      },
      refusing(async (request, reply) => {
        const result = await port.start({
          subject: subjectOf(request),
          actor: actorOf(request),
          ...(request.body.expectedWorkflowRevision !== undefined
            ? { expectedWorkflowRevision: request.body.expectedWorkflowRevision }
            : {}),
        });

        return reply.code(200).send(presentStart(result));
      }),
    );

    typed.post(
      `${base}/finish`,
      {
        onRequest: manage,
        bodyLimit: BODY_LIMIT_BYTES,
        schema: {
          tags,
          summary: `Finish the active workflow step of a ${label}`,
          params,
          body: FinishWorkflowRequestSchema,
          response: { 200: FinishWorkflowResultSchema, ...errors },
        },
      },
      refusing(async (request, reply) => {
        const { step, attempt, result, feedback, artifacts, tasks } = request.body;
        const finished = await port.finish({
          subject: subjectOf(request),
          step,
          attempt,
          input: {
            ...(result !== undefined ? { result } : {}),
            ...(feedback !== undefined ? { feedback } : {}),
            ...(artifacts !== undefined ? { artifacts } : {}),
            ...(tasks !== undefined ? { tasks } : {}),
          },
          actor: actorOf(request),
        });

        return reply.code(200).send(toWire(finished));
      }),
    );

    typed.post(
      `${base}/return`,
      {
        onRequest: manage,
        bodyLimit: BODY_LIMIT_BYTES,
        schema: {
          tags,
          summary: `Return a ${label} workflow to an earlier step`,
          params,
          body: ReturnWorkflowRequestSchema,
          response: { 200: ReturnWorkflowResultSchema, ...errors },
        },
      },
      refusing(async (request, reply) => {
        const returned = await port.return({
          subject: subjectOf(request),
          step: request.body.step,
          ...(request.body.reason !== undefined ? { feedback: request.body.reason } : {}),
          actor: actorOf(request),
        });

        return reply.code(200).send(toWire(returned));
      }),
    );
  }

  typed.post(
    '/api/specs/:specId/workflow/abandon',
    {
      onRequest: close,
      bodyLimit: BODY_LIMIT_BYTES,
      schema: {
        tags: ['Workflow'],
        summary: 'Abandon a Specification without realizing it',
        params: WorkflowSpecParamsSchema,
        body: AbandonSpecificationRequestSchema,
        response: { 200: AbandonSpecificationResultSchema, ...errors },
      },
    },
    refusing(async (request, reply) => {
      const abandoned = await port.abandon({
        specId: request.params.specId,
        reason: request.body.reason,
        actor: actorOf(request),
      });

      return reply.code(200).send(toWire(abandoned));
    }),
  );

  done();
};

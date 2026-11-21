import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import {
  AgentStepExecutionCheckSchema,
  AgentStepExecutionRequestSchema,
  AgentStepExecutionResultSchema,
  StopAgentStepExecutionRequestSchema,
  StopAgentStepExecutionResultSchema,
  TakeOverAgentStepExecutionRequestSchema,
  TakeOverAgentStepExecutionResultSchema,
  WorkflowErrorSchema,
  WorkflowSpecParamsSchema,
  WorkflowTaskParamsSchema,
} from '@nevo/specflow-contracts/workflow';
import { WorkflowError, type AgentOption, type WorkflowSubject } from '@nevo/specflow-engine';
import type { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';

import { contractRef } from '../../../server/shared-contracts';
import { requireCapability, type ResourceCapability } from '../../auth';
import { SessionError } from '../../sessions';
import { specScope, type ProjectIdSource } from '../../specs';
import {
  AgentUnavailableError,
  WorkflowUnavailableError,
  ownerActorOf,
  sendWorkflowFailure,
  toWire,
  workflowFailure,
} from '../../workflow';
import type { AgentStepExecution } from './operation';

export interface AgentStepExecutionRoutesOptions {
  /** Absent: every route answers 503 `WORKFLOW_UNAVAILABLE` (no Engine, the demo). */
  readonly agentStepExecution?: AgentStepExecution;
  readonly projectId?: ProjectIdSource;
}

const BODY_LIMIT_BYTES = 64 * 1024;

const errors = {
  401: contractRef(AuthenticationRequiredErrorResponseSchema),
  403: contractRef(AuthorizationForbiddenErrorResponseSchema),
  404: contractRef(WorkflowErrorSchema),
  409: contractRef(WorkflowErrorSchema),
  422: contractRef(WorkflowErrorSchema),
  503: contractRef(WorkflowErrorSchema),
} as const;

/** What a Session refusal on the way to the Turn means for the agent, by its code. */
const SESSION_REASONS: Partial<
  Record<string, Extract<AgentOption, { kind: 'unavailable' }>['reason']>
> = {
  PROVIDER_UNAVAILABLE: 'provider-not-ready',
  PROVIDER_AUTH_REQUIRED: 'provider-not-ready',
  PROVIDER_CATALOGUE_UNAVAILABLE: 'provider-not-ready',
  CAPABILITY_UNSUPPORTED: 'provider-not-ready',
  MODEL_UNSUPPORTED: 'provider-not-ready',
  SESSION_DISABLED: 'provider-not-ready',
  TURN_CONFLICT: 'project-busy',
  SESSION_NOT_FOUND: 'session-unavailable',
  SESSION_ARCHIVED: 'session-unavailable',
};

/**
 * A Session refusal on the way to the Turn, in the workflow vocabulary: the agent unavailable for a
 * reason the owner can act on (said in the Session's words), the request invalid, or the Session
 * store unavailable for now (503).
 */
function refusalOf(error: unknown) {
  if (error instanceof SessionError) {
    const reason = SESSION_REASONS[error.code];
    if (reason !== undefined) {
      return workflowFailure(
        new AgentUnavailableError(
          { kind: 'unavailable', reason, detail: error.message },
          error.message,
        ),
      );
    }

    return workflowFailure(
      error.code === 'SESSION_INPUT_INVALID' || error.code === 'IDEMPOTENCY_CONFLICT'
        ? new WorkflowError('WORKFLOW_INPUT_INVALID', error.message)
        : new WorkflowUnavailableError(),
    );
  }

  return workflowFailure(error);
}

function refusing<Request, Result>(
  handler: (request: Request, reply: FastifyReply) => Promise<Result>,
): (request: Request, reply: FastifyReply) => Promise<Result> {
  return async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    try {
      return await handler(request, reply);
    } catch (error) {
      const failure = refusalOf(error);
      if (!failure) {
        throw error;
      }

      void sendWorkflowFailure(reply, failure);

      return reply as unknown as Result;
    }
  };
}

/**
 * The Ask agent owner routes of a Specification and of a Task: start an agent attempt of the step
 * the owner was shown or continue the active one (`agent-execution`), and stop its running agent
 * (`agent-execution/stop`), and take the stopped attempt over (`agent-execution/take-over`). They
 * drive a run, so they need `Manage`; the caller is the owner, the agent's actor comes only from the
 * Session the Runtime binds.
 */
export const agentStepExecutionEndpoint: FastifyPluginCallback<AgentStepExecutionRoutesOptions> = (
  app,
  options,
  done,
) => {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const guard = (capability: ResourceCapability<typeof SpecCapabilities>) =>
    requireCapability({
      resource: SpecCapabilities,
      capability,
      scope: (request) =>
        specScope(options.projectId?.(), (request.params as { specId: string }).specId),
    });
  const manage = guard(SpecCapabilities.capabilities.Manage);
  const view = guard(SpecCapabilities.capabilities.View);
  const principal = (request: FastifyRequest) => request.authz.readContext().subject;
  const execution = (): AgentStepExecution => {
    if (!options.agentStepExecution) {
      throw new WorkflowUnavailableError();
    }

    return options.agentStepExecution;
  };

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

    typed.post(
      `${base}/agent-execution`,
      {
        onRequest: manage,
        bodyLimit: BODY_LIMIT_BYTES,
        schema: {
          tags,
          summary: `Ask an agent to do the next step of a ${label}, or continue its attempt`,
          params,
          body: AgentStepExecutionRequestSchema,
          response: { 200: AgentStepExecutionResultSchema, ...errors },
        },
      },
      refusing(async (request, reply) => {
        const { requestId, expected, provider, model, effort, message } = request.body;
        const result = await execution().startAgentStepExecution({
          subject: subjectOf(request),
          principal: principal(request),
          requestId,
          expected: {
            step: expected.step,
            ...(expected.attempt !== undefined ? { attempt: expected.attempt } : {}),
          },
          ...(provider !== undefined ? { provider } : {}),
          ...(model !== undefined ? { model } : {}),
          ...(effort !== undefined ? { effort } : {}),
          ...(message !== undefined ? { message } : {}),
        });

        return reply.code(200).send(result);
      }),
    );

    typed.get(
      `${base}/agent-execution/check`,
      {
        onRequest: view,
        schema: {
          tags,
          summary: `Check whether an agent can run the step of a ${label} now`,
          params,
          response: { 200: AgentStepExecutionCheckSchema, ...errors },
        },
      },
      refusing(async (request, reply) =>
        reply.code(200).send(toWire(await execution().check(subjectOf(request)))),
      ),
    );

    typed.post(
      `${base}/agent-execution/stop`,
      {
        onRequest: manage,
        bodyLimit: BODY_LIMIT_BYTES,
        schema: {
          tags,
          summary: `Stop the agent working on a ${label}'s step`,
          params,
          body: StopAgentStepExecutionRequestSchema,
          response: { 200: StopAgentStepExecutionResultSchema, ...errors },
        },
      },
      refusing(async (request, reply) => {
        const result = await execution().stopAgentStepExecution({
          subject: subjectOf(request),
          principal: principal(request),
          requestId: request.body.requestId,
          attemptId: request.body.attemptId,
        });

        return reply.code(200).send(result);
      }),
    );

    typed.post(
      `${base}/agent-execution/take-over`,
      {
        onRequest: manage,
        bodyLimit: BODY_LIMIT_BYTES,
        schema: {
          tags,
          summary: `Take over the stopped agent attempt of a ${label}'s step and go on yourself`,
          params,
          body: TakeOverAgentStepExecutionRequestSchema,
          response: { 200: TakeOverAgentStepExecutionResultSchema, ...errors },
        },
      },
      refusing(async (request, reply) => {
        const result = await execution().takeOver({
          subject: subjectOf(request),
          step: request.body.step,
          attempt: request.body.attempt,
          actor: ownerActorOf(principal(request)),
        });

        return reply.code(200).send(
          toWire({
            subject: result.subject,
            takenOver: result.takenOver,
            step: result.context.step,
            attempt: result.context.attempt,
          }),
        );
      }),
    );
  }

  done();
};

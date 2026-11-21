import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import {
  AgentStepExecutionRequestSchema,
  AgentStepExecutionResultSchema,
  StopAgentStepExecutionRequestSchema,
  StopAgentStepExecutionResultSchema,
  WorkflowErrorSchema,
  WorkflowSpecParamsSchema,
  WorkflowTaskParamsSchema,
} from '@nevo/specflow-contracts/workflow';
import type { WorkflowSubject } from '@nevo/specflow-engine';
import type { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';

import { contractRef } from '../../../server/shared-contracts';
import { requireCapability } from '../../auth';
import { SessionError } from '../../sessions';
import { specScope, type ProjectIdSource } from '../../specs';
import {
  AgentUnavailableError,
  WorkflowUnavailableError,
  sendWorkflowFailure,
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

/**
 * A Session refusal on the way to the Turn (the provider, the Session store) is the agent being
 * unavailable now, said in the Session's own words.
 */
function refusalOf(error: unknown) {
  if (error instanceof SessionError) {
    return workflowFailure(
      new AgentUnavailableError(
        { kind: 'unavailable', reason: 'provider-not-ready', detail: error.message },
        error.message,
      ),
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
 * (`agent-execution/stop`). They drive a run, so they need `Manage`; the caller is the owner, the agent's
 * actor comes only from the Session the Runtime binds.
 */
export const agentStepExecutionEndpoint: FastifyPluginCallback<AgentStepExecutionRoutesOptions> = (
  app,
  options,
  done,
) => {
  const typed = app.withTypeProvider<TypeBoxTypeProvider>();
  const manage = requireCapability({
    resource: SpecCapabilities,
    capability: SpecCapabilities.capabilities.Manage,
    scope: (request) =>
      specScope(options.projectId?.(), (request.params as { specId: string }).specId),
  });
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
  }

  done();
};

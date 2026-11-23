import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import {
  AbandonSpecificationRequestSchema,
  AbandonSpecificationResultSchema,
  ConfirmWorkflowRequestSchema,
  ConfirmWorkflowResultSchema,
  FinishWorkflowRequestSchema,
  FinishWorkflowResultSchema,
  ReevaluateWaitRequestSchema,
  ReevaluateWaitResultSchema,
  RejectWorkflowRequestSchema,
  RejectWorkflowResultSchema,
  ReturnWorkflowRequestSchema,
  ReturnWorkflowResultSchema,
  RetryAttemptCommitRequestSchema,
  RetryAttemptCommitResultSchema,
  StartWorkflowRequestSchema,
  StartWorkflowResultSchema,
  WorkflowActionProjectionSchema,
  WorkflowErrorSchema,
  WorkflowHistorySchema,
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
import {
  WorkflowUnavailableError,
  ownerActorOf,
  sendWorkflowFailure,
  workflowFailure,
} from './refusal';
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

  return {
    actions: refuse,
    start: refuse,
    finish: refuse,
    return: refuse,
    history: refuse,
    reevaluateWait: refuse,
    abandon: refuse,
    retryAttemptCommit: refuse,
    confirm: refuse,
    reject: refuse,
  };
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
      void sendWorkflowFailure(reply, failure);

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
          description:
            'Read the Engine-owned action projection for this subject: pinned workflow/first-start candidate, position, allowed owner actions, per-transition gates, Task authoring, document relations and Specification exit. Requires spec.view at trusted Specification scope. Client renders allowed actions only; reasons and codes are stable, messages and step purpose/instructions are display-only. An unresolved workflow or inaccessible source refuses with typed WorkflowError. Demo uses the same Engine logic over in-memory state. Cache-Control: no-store.',
          params,
          response: { 200: contractRef(WorkflowActionProjectionSchema), ...errors },
        },
      },
      refusing(async (request, reply) =>
        reply.code(200).send(toWire(await port.actions(subjectOf(request)))),
      ),
    );

    typed.get(
      `${base}/history`,
      {
        onRequest: view,
        schema: {
          tags,
          summary: `Read the workflow history of a ${label}, with its agent attempts' events and work`,
          params,
          response: { 200: contractRef(WorkflowHistorySchema), ...errors },
        },
      },
      refusing(async (request, reply) =>
        reply.code(200).send(toWire(await port.history(subjectOf(request)))),
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
          description:
            'Start or resume the next owner workflow step; Runtime derives human actor from trusted request.authz, never from request data. Requires spec.manage at Specification scope. For a Task first start, expectedWorkflowRevision pins the revision the owner previewed; changed definitions refuse WORKFLOW_DEFINITION_CHANGED. An agent attempt is not started here. 64 KiB body limit, Cache-Control: no-store.',
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
          description:
            'Finish an active owner workflow attempt, naming step and attempt so stale clients cannot complete a newer run. Requires spec.manage. A step that produces Tasks accepts the complete owned draft set; omitted owned drafts are cancelled, unrelated drafts untouched. Specification taskDecisions apply before terminal completion; Task finishes reject them. Replaying the same successful finish returns the recorded result with replayed:true; post-actions report separately and do not undo the workflow result. Gate, open-Task or attempt mismatch refusals are typed. Body limit 64 KiB.',
          params,
          body: FinishWorkflowRequestSchema,
          response: { 200: FinishWorkflowResultSchema, ...errors },
        },
      },
      refusing(async (request, reply) => {
        const { step, attempt, result, feedback, artifacts, tasks, taskDecisions } = request.body;
        const finished = await port.finish({
          subject: subjectOf(request),
          step,
          attempt,
          input: {
            ...(result !== undefined ? { result } : {}),
            ...(feedback !== undefined ? { feedback } : {}),
            ...(artifacts !== undefined ? { artifacts } : {}),
            ...(tasks !== undefined ? { tasks } : {}),
            ...(taskDecisions !== undefined ? { taskDecisions } : {}),
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
          description:
            'Return the owner workflow run to a permitted earlier step, optionally carrying reason as feedback. Requires spec.manage; the target must be a declared return, never an arbitrary step. Actor is resolved by Runtime, not request. Typed refusal for return-not-allowed or stale execution. 64 KiB body limit.',
          params,
          body: ReturnWorkflowRequestSchema,
          response: { 200: ReturnWorkflowResultSchema, ...errors },
        },
      },
      refusing(async (request, reply) => {
        const returned = await port.return(
          {
            subject: subjectOf(request),
            step: request.body.step,
            ...(request.body.reason !== undefined ? { feedback: request.body.reason } : {}),
            actor: actorOf(request),
          },
          request.authz.readContext().subject,
        );

        return reply.code(200).send(toWire(returned));
      }),
    );

    typed.post(
      `${base}/attempt-commit/retry`,
      {
        onRequest: manage,
        bodyLimit: BODY_LIMIT_BYTES,
        schema: {
          tags,
          summary: `Retry the failed commit of a finished agent attempt of a ${label}`,
          params,
          body: RetryAttemptCommitRequestSchema,
          response: { 200: RetryAttemptCommitResultSchema, ...errors },
        },
      },
      refusing(async (request, reply) => {
        const retried = await port.retryAttemptCommit({
          subject: subjectOf(request),
          step: request.body.step,
          attempt: request.body.attempt,
          actor: actorOf(request),
        });

        return reply.code(200).send(toWire(retried));
      }),
    );

    typed.post(
      `${base}/confirmation/confirm`,
      {
        onRequest: manage,
        bodyLimit: BODY_LIMIT_BYTES,
        schema: {
          tags,
          summary: `Confirm an agent's result that waits for the owner on a ${label}`,
          params,
          body: ConfirmWorkflowRequestSchema,
          response: { 200: ConfirmWorkflowResultSchema, ...errors },
        },
      },
      refusing(async (request, reply) => {
        const confirmed = await port.confirm({
          subject: subjectOf(request),
          step: request.body.step,
          attempt: request.body.attempt,
          requestId: request.body.requestId,
          confirmsDigest: request.body.confirmsDigest,
          actor: actorOf(request),
        });

        return reply.code(200).send(toWire(confirmed));
      }),
    );

    typed.post(
      `${base}/confirmation/reject`,
      {
        onRequest: manage,
        bodyLimit: BODY_LIMIT_BYTES,
        schema: {
          tags,
          summary: `Reject an agent's result that waits for the owner on a ${label}`,
          params,
          body: RejectWorkflowRequestSchema,
          response: { 200: RejectWorkflowResultSchema, ...errors },
        },
      },
      refusing(async (request, reply) => {
        const rejected = await port.reject({
          subject: subjectOf(request),
          step: request.body.step,
          attempt: request.body.attempt,
          requestId: request.body.requestId,
          feedback: request.body.feedback,
          actor: actorOf(request),
        });

        return reply.code(200).send(toWire(rejected));
      }),
    );
  }

  typed.post(
    '/api/specs/:specId/workflow/reevaluate-wait',
    {
      onRequest: manage,
      bodyLimit: BODY_LIMIT_BYTES,
      schema: {
        tags: ['Workflow'],
        summary: 'Re-evaluate a Specification wait attempt',
        description:
          "Re-evaluate a Specification's named waiting attempt when a Tasks-finished event may have been missed. Requires spec.manage. Input is step/attempt; results settled or already-settled. A different completed attempt conflicts; open/escalated/broken Tasks refuse WORKFLOW_TASK_BLOCKED. This is not an arbitrary transition or Task state mutation.",
        params: WorkflowSpecParamsSchema,
        body: ReevaluateWaitRequestSchema,
        response: { 200: ReevaluateWaitResultSchema, ...errors },
      },
    },
    refusing(async (request, reply) => {
      const result = await port.reevaluateWait({
        ...request.body,
        specId: request.params.specId,
        actor: actorOf(request),
      });

      return reply.code(200).send(result);
    }),
  );

  typed.post(
    '/api/specs/:specId/workflow/abandon',
    {
      onRequest: close,
      bodyLimit: BODY_LIMIT_BYTES,
      schema: {
        tags: ['Workflow'],
        summary: 'Abandon a Specification without realizing it',
        description:
          'Permanently abandon a Specification workflow without realizing it; this is not Git Close. Requires spec.close-specification. Runtime supplies the human actor; body requires reason. Same-reason retry is idempotent, but pending writes, broken Tasks and other operations still block. Result includes cancelled Task identities and abandoned Task runs. 64 KiB body limit.',
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

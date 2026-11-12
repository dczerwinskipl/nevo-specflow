import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginCallback, FastifyReply } from 'fastify';
import { Type } from 'typebox';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import { SpecIdSchema } from '@nevo/specflow-contracts/documents';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import { WorkflowErrorSchema } from '@nevo/specflow-contracts/workflow';
import {
  CreateTaskInputSchema,
  EditTaskInputSchema,
  RemoveTaskQuerySchema,
  SetTaskStatusInputSchema,
  SpecificationTaskParamsSchema,
  TaskChangeResultSchema,
  TaskRemoveResultSchema,
  TaskStatusResultSchema,
} from '@nevo/specflow-contracts/tasks';

import { requireCapability } from '../../auth';
import { specScope, type ProjectIdSource } from '../../specs';
import { contractRef } from '../../../server/shared-contracts';
import {
  ownerActorOf,
  sendWorkflowFailure,
  workflowFailure,
  WorkflowUnavailableError,
} from '../../workflow';
import type { TaskCommands } from './task-commands';

/** A create may carry the first text of `task.md`: the document save cap with room for escaping. */
const CREATE_BODY_LIMIT_BYTES = 2 * 1024 * 1024;

const SpecParamsSchema = Type.Object({ specId: SpecIdSchema }, { additionalProperties: false });

export interface TaskCommandRoutesOptions {
  /** Absent (no Engine): every command answers `503 WORKFLOW_UNAVAILABLE`. */
  readonly commands?: TaskCommands;
  readonly projectId?: ProjectIdSource;
}

const errors = {
  401: contractRef(AuthenticationRequiredErrorResponseSchema),
  403: contractRef(AuthorizationForbiddenErrorResponseSchema),
  404: contractRef(WorkflowErrorSchema),
  409: contractRef(WorkflowErrorSchema),
  422: contractRef(WorkflowErrorSchema),
  503: contractRef(WorkflowErrorSchema),
};

/**
 * The owner's Task commands (`reference.api.task-reads`, "Task commands"): create, edit, remove and
 * decide the status of a Task, each with `spec.manage` on the Task's Specification, checked before
 * the body is read. The actor is the authenticated subject; a body never names one.
 */
export const taskCommandRoutes: FastifyPluginCallback<TaskCommandRoutesOptions> = (
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
  /**
   * Runs one command, which sends its own success answer; a workflow refusal is answered with its
   * status and `WorkflowError` body (`sendWorkflowFailure`), which every command route declares.
   */
  const run = async (reply: FastifyReply, command: (port: TaskCommands) => Promise<void>) => {
    reply.header('Cache-Control', 'no-store');
    try {
      if (!options.commands) {
        throw new WorkflowUnavailableError();
      }

      await command(options.commands);
    } catch (error) {
      const failure = workflowFailure(error);
      if (!failure) {
        throw error;
      }

      await sendWorkflowFailure(reply, failure);
    }
  };

  typed.post(
    '/api/specs/:specId/tasks',
    {
      onRequest: manage,
      bodyLimit: CREATE_BODY_LIMIT_BYTES,
      schema: {
        tags: ['Tasks'],
        summary: 'Create a Task',
        params: SpecParamsSchema,
        body: CreateTaskInputSchema,
        response: { 201: contractRef(TaskChangeResultSchema), ...errors },
      },
    },
    async (request, reply) => {
      await run(reply, async (port) => {
        const result = await port.create(
          request.params.specId,
          request.body,
          ownerActorOf(request.authz.readContext().subject),
        );
        await reply.code(201).send(result);
      });
    },
  );

  typed.patch(
    '/api/specs/:specId/tasks/:taskId',
    {
      onRequest: manage,
      schema: {
        tags: ['Tasks'],
        summary: 'Edit a Task',
        params: SpecificationTaskParamsSchema,
        body: EditTaskInputSchema,
        response: { 200: contractRef(TaskChangeResultSchema), ...errors },
      },
    },
    async (request, reply) => {
      await run(reply, async (port) => {
        const { specId, taskId } = request.params;
        const result = await port.edit(
          specId,
          taskId,
          request.body,
          ownerActorOf(request.authz.readContext().subject),
        );
        await reply.code(200).send(result);
      });
    },
  );

  typed.delete(
    '/api/specs/:specId/tasks/:taskId',
    {
      onRequest: manage,
      schema: {
        tags: ['Tasks'],
        summary: 'Remove a Task',
        params: SpecificationTaskParamsSchema,
        querystring: RemoveTaskQuerySchema,
        response: { 200: TaskRemoveResultSchema, ...errors },
      },
    },
    async (request, reply) => {
      await run(reply, async (port) => {
        const { specId, taskId } = request.params;
        const result = await port.remove(
          specId,
          taskId,
          request.query.expectedRevision,
          ownerActorOf(request.authz.readContext().subject),
        );
        await reply.code(200).send(result);
      });
    },
  );

  typed.put(
    '/api/specs/:specId/tasks/:taskId/status',
    {
      onRequest: manage,
      schema: {
        tags: ['Tasks'],
        summary: 'Decide the status of a Task',
        params: SpecificationTaskParamsSchema,
        body: SetTaskStatusInputSchema,
        response: { 200: TaskStatusResultSchema, ...errors },
      },
    },
    async (request, reply) => {
      await run(reply, async (port) => {
        const { specId, taskId } = request.params;
        const result = await port.setStatus(
          specId,
          taskId,
          request.body,
          ownerActorOf(request.authz.readContext().subject),
        );
        await reply.code(200).send(result);
      });
    },
  );

  done();
};

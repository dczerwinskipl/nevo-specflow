import type { FastifyPluginCallback, FastifyReply } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  SpecificationTaskParamsSchema,
  SpecificationTaskResponseSchema,
  TaskPageQuerySchema,
  TaskResourcePageSchema,
  TaskHistoryPageSchema,
  TaskSnapshotExpiredSchema,
  TaskReadErrorSchema,
} from '@nevo/specflow-contracts/tasks';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import { requireCapability } from '../auth';
import { specScope } from '../specs';
import { readTaskDetail, type TaskReadDependencies } from './detail/read-task-detail';
import { readTaskPage } from './reads/read-page';
import { contractRef } from '../../server/shared-contracts';
import { TaskSourceUnavailableError } from './engine/sources';
import type { ReadOutcome } from './reads/outcome';

/** A source outage (the Engine could not read the execution) is the read's `unavailable` (503). */
async function unlessUnavailable<T>(read: () => Promise<ReadOutcome<T>>): Promise<ReadOutcome<T>> {
  try {
    return await read();
  } catch (error) {
    if (error instanceof TaskSourceUnavailableError) {
      return { kind: 'unavailable', retryable: error.retryable };
    }

    throw error;
  }
}

/** 503 `specification_source_unavailable`; `Retry-After` only when the lock was busy. */
function unavailableReply<R extends FastifyReply>(reply: R, retryable: boolean): R {
  if (retryable) {
    reply.header('Retry-After', '1');
  }

  (reply as FastifyReply).code(503).send({ error: 'specification_source_unavailable' });

  return reply;
}

export const taskReadEndpoint: FastifyPluginCallback<{ dependencies: TaskReadDependencies }> = (
  app,
  options,
  done,
) => {
  const authorization = requireCapability({
    resource: SpecCapabilities,
    capability: SpecCapabilities.capabilities.View,
    scope: (request) =>
      specScope(options.dependencies.projectId?.(), (request.params as { specId: string }).specId),
  });
  const errors = {
    401: contractRef(AuthenticationRequiredErrorResponseSchema),
    403: contractRef(AuthorizationForbiddenErrorResponseSchema),
    404: contractRef(TaskReadErrorSchema),
    409: contractRef(TaskSnapshotExpiredSchema),
    503: contractRef(TaskReadErrorSchema),
  };
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/api/specs/:specId/tasks/:taskId',
    {
      preHandler: authorization,
      schema: {
        tags: ['Tasks'],
        summary: 'Read a Task',
        params: SpecificationTaskParamsSchema,
        response: { 200: SpecificationTaskResponseSchema, ...errors },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const result = await unlessUnavailable(() =>
        readTaskDetail(
          options.dependencies,
          request.params.specId,
          request.params.taskId,
          request.authz,
        ),
      );
      if (result.kind === 'ok') {
        return result.value;
      }

      if (result.kind === 'not_found') {
        return reply.code(404).send({ error: 'specification_task_not_found' });
      }

      return unavailableReply(reply, result.kind === 'unavailable' && result.retryable === true);
    },
  );
  for (const kind of ['resources', 'history'] as const) {
    app.withTypeProvider<TypeBoxTypeProvider>().get(
      `/api/specs/:specId/tasks/:taskId/${kind}`,
      {
        preHandler: authorization,
        schema: {
          tags: ['Tasks'],
          summary:
            kind === 'resources' ? 'Read the resources of a Task' : 'Read the history of a Task',
          params: SpecificationTaskParamsSchema,
          querystring: TaskPageQuerySchema,
          response: {
            200: kind === 'resources' ? TaskResourcePageSchema : TaskHistoryPageSchema,
            ...errors,
          },
        },
      },
      async (request, reply) => {
        reply.header('Cache-Control', 'no-store');
        const result = await unlessUnavailable(() =>
          readTaskPage(
            options.dependencies,
            kind,
            request.params.specId,
            request.params.taskId,
            request.query,
            request.authz,
          ),
        );
        if (result.kind === 'ok') {
          return result.value;
        }

        if (result.kind === 'expired') {
          return reply.code(409).send({ error: 'task_snapshot_expired' });
        }

        if (result.kind === 'not_found') {
          return reply.code(404).send({ error: 'specification_task_not_found' });
        }

        return unavailableReply(reply, result.kind === 'unavailable' && result.retryable === true);
      },
    );
  }

  done();
};

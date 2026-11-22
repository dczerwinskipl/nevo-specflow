import type { FastifyPluginCallback, FastifyReply } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  SpecificationTaskParamsSchema,
  SpecificationTaskResponseSchema,
  TaskPageQuerySchema,
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
import { readTaskHistoryPage } from './reads/read-page';
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
        description:
          "Read one Task's resource and bounded execution snapshot from one Engine readExecution, including workflow position and section availability but not whole Task history, full document text or Sessions. Requires spec.view at trusted Specification scope; Session references are independently filtered by session.view at their store-derived scopes. Empty available data is not unavailable/forbidden; no GET starts work. Missing Task 404 specification_task_not_found, unreadable/unavailable checkout 503 specification_source_unavailable (Retry-After:1 on busy control lock). Project mode cannot fall back to demo data. Cache-Control: no-store.",
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
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/api/specs/:specId/tasks/:taskId/history',
    {
      preHandler: authorization,
      schema: {
        tags: ['Tasks'],
        summary: 'Read the history of a Task',
        description:
          'Read a page of Task attempt history against the opaque lease issued by Task detail. Requires spec.view at trusted Specification scope on every request; token/cursor possession grants no access. Token is a bounded in-memory observation lease, not an offset, session or persistent authority. Expired/evicted/rebound leases, changed source/policy, mismatched cursor or page size return 409 task_snapshot_expired. coverage complete concerns source enumeration, not end of this page; continue while nextCursor is non-null even after an underfilled/empty page. History order is stable attempt order, not nullable timestamps. Cache-Control: no-store.',
        params: SpecificationTaskParamsSchema,
        querystring: TaskPageQuerySchema,
        response: { 200: TaskHistoryPageSchema, ...errors },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const result = await unlessUnavailable(() =>
        readTaskHistoryPage(
          options.dependencies,
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

  done();
};

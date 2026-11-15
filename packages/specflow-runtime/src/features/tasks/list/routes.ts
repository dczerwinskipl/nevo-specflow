import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginCallback } from 'fastify';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import {
  SpecificationReadErrorSchema,
  SpecificationWorkspaceParamsSchema,
} from '@nevo/specflow-contracts/specs/workspace';
import { TaskListQuerySchema, TaskListResponseSchema } from '@nevo/specflow-contracts/tasks';

import { requireCapability } from '../../auth';
import { specScope, type ProjectIdSource } from '../../specs';
import { contractRef } from '../../../server/shared-contracts';
import { TaskSourceUnavailableError } from '../engine/sources';
import type { TaskListSource } from './read-task-list';

export interface TaskListRoutesOptions {
  /** Absent (no Engine, the demo Runtime): the read answers 503. */
  readonly source?: TaskListSource;
  readonly projectId?: ProjectIdSource;
}

/**
 * `GET /api/specs/:specId/tasks`: the Tasks page, with `spec.view` on the Specification. The query
 * is validated (`blocking=specification` or nothing); anything else is a 400 before the read.
 */
export const taskListRoutes: FastifyPluginCallback<TaskListRoutesOptions> = (
  app,
  options,
  done,
) => {
  const view = requireCapability({
    resource: SpecCapabilities,
    capability: SpecCapabilities.capabilities.View,
    scope: (request) =>
      specScope(options.projectId?.(), (request.params as { specId: string }).specId),
  });

  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/api/specs/:specId/tasks',
    {
      preHandler: view,
      schema: {
        tags: ['Tasks'],
        summary: 'Read the Tasks of a Specification, grouped',
        params: SpecificationWorkspaceParamsSchema,
        querystring: TaskListQuerySchema,
        response: {
          200: TaskListResponseSchema,
          401: contractRef(AuthenticationRequiredErrorResponseSchema),
          403: contractRef(AuthorizationForbiddenErrorResponseSchema),
          404: contractRef(SpecificationReadErrorSchema),
          503: contractRef(SpecificationReadErrorSchema),
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      if (!options.source) {
        return reply.code(503).send({ error: 'specification_source_unavailable' });
      }

      try {
        const list = await options.source.read(request.params.specId, request.query);
        if (!list) {
          return reply.code(404).send({ error: 'specification_not_found' });
        }

        return list;
      } catch (error) {
        if (!(error instanceof TaskSourceUnavailableError)) {
          throw error;
        }

        if (error.retryable) {
          reply.header('Retry-After', '1');
        }

        return reply.code(503).send({ error: 'specification_source_unavailable' });
      }
    },
  );

  done();
};

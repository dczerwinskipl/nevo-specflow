import { SpecificationError, WorkspaceRegistryError } from '@nevo/specflow-engine';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import {
  WorkspaceCapabilities,
  WorkspaceListErrorSchema,
  WorkspaceListSchema,
  type WorkspaceList,
} from '@nevo/specflow-contracts/workspaces';

import { specScope, type ProjectIdSource } from '../../specs';
import { contractRef } from '../../../server/shared-contracts';

/**
 * Every registered workspace with every bound Specification, before any authorization: the
 * endpoint filters the Specifications per caller.
 */
export type WorkspaceListSource = () => Promise<WorkspaceList>;

export interface WorkspaceListEndpointOptions {
  /** Absent (a Runtime without an Engine or demo data): the list answers `503`. */
  readonly source?: WorkspaceListSource;
  readonly projectId: ProjectIdSource;
}

const unavailable = { error: 'WORKSPACES_UNAVAILABLE', code: 'WORKSPACES_UNAVAILABLE' } as const;

/**
 * `GET /api/workspaces` (ADR 0022 §§1-2): `workspace.view` at the Runtime's project scope
 * `{ projectId }`, checked before the source is touched: `401` without access, `503` without a
 * source or project, then `403`. Bound Specification titles are filtered by `spec.view` per
 * Specification, silently.
 */
export const workspaceListEndpoint: FastifyPluginCallback<WorkspaceListEndpointOptions> = (
  app,
  options,
  done,
) => {
  const requireWorkspaceView = async (request: FastifyRequest, reply: FastifyReply) => {
    request.authz.requireAccess();
    const projectId = options.projectId();
    if (options.source === undefined || projectId === undefined) {
      // A pre-handler that sends ends the request; the route handler does not run.
      await reply.code(503).header('Cache-Control', 'no-store').send(unavailable);

      return;
    }

    request.authz.require({
      resource: WorkspaceCapabilities,
      capability: WorkspaceCapabilities.capabilities.View,
      scope: { projectId },
    });
  };

  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/api/workspaces',
    {
      preHandler: requireWorkspaceView,
      schema: {
        tags: ['Workspaces'],
        summary: 'List the registered workspaces of the project',
        response: {
          200: WorkspaceListSchema,
          401: contractRef(AuthenticationRequiredErrorResponseSchema),
          403: contractRef(AuthorizationForbiddenErrorResponseSchema),
          503: WorkspaceListErrorSchema,
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      const projectId = options.projectId();
      let list: WorkspaceList;
      try {
        list = await options.source!();
      } catch (error) {
        // An unreadable registry or Specification source (`SPEC_SOURCE_INVALID`, `SPEC_CONFLICT`).
        if (!(error instanceof WorkspaceRegistryError) && !isSpecificationSourceError(error)) {
          throw error;
        }

        // The Engine's message can name paths: the code goes to the log, never into the response.
        request.log.warn({ code: error.code }, 'Workspace list unavailable');

        return reply.code(503).send(unavailable);
      }

      return reply.code(200).send({
        projectFolderId: list.projectFolderId,
        workspaces: list.workspaces.map((workspace) => ({
          ...workspace,
          specifications: request.authz.filterByCapability(workspace.specifications, {
            resource: SpecCapabilities,
            capability: SpecCapabilities.capabilities.View,
            scope: (spec) => specScope(projectId, spec.specId),
          }),
        })),
      });
    },
  );
  done();
};

function isSpecificationSourceError(error: unknown): error is SpecificationError {
  return (
    error instanceof SpecificationError &&
    (error.code === 'SPEC_SOURCE_INVALID' || error.code === 'SPEC_CONFLICT')
  );
}

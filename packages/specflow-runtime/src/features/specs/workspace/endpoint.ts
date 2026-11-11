import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginCallback } from 'fastify';
import {
  SpecificationReadErrorSchema,
  SpecificationWorkspaceParamsSchema,
  SpecificationWorkspaceResponseSchema,
} from '@nevo/specflow-contracts/specs/workspace';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import { requireCapability } from '../../auth';
import { specScope, type ProjectIdSource } from '../scope';
import { isSpecsSourceError } from '../read/error';
import type { SpecificationWorkspaceRepository, WorkspaceContributions } from './repository';
import { readAuthorizedWorkspace } from './read-authorized-workspace';
import type { SessionReferenceOwner } from '../../sessions';
import { contractRef } from '../../../server/shared-contracts';

export interface SpecificationWorkspaceEndpointOptions {
  readonly repository?: SpecificationWorkspaceRepository;
  readonly contributions?: WorkspaceContributions;
  readonly sessions?: SessionReferenceOwner;
  /** The Runtime's project; see `specScope`. */
  readonly projectId?: ProjectIdSource;
}

export const specificationWorkspaceEndpoint: FastifyPluginCallback<
  SpecificationWorkspaceEndpointOptions
> = (app, options, done) => {
  const authorization = requireCapability({
    resource: SpecCapabilities,
    capability: SpecCapabilities.capabilities.View,
    scope: (request) =>
      specScope(options.projectId?.(), (request.params as { specId: string }).specId),
  });

  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/api/specs/:specId/workspace',
    {
      preHandler: authorization,
      schema: {
        tags: ['Specifications'],
        summary: 'Read the workspace view of a Specification',
        params: SpecificationWorkspaceParamsSchema,
        response: {
          200: SpecificationWorkspaceResponseSchema,
          401: contractRef(AuthenticationRequiredErrorResponseSchema),
          403: contractRef(AuthorizationForbiddenErrorResponseSchema),
          404: contractRef(SpecificationReadErrorSchema),
          503: contractRef(SpecificationReadErrorSchema),
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      let result: Awaited<ReturnType<typeof readAuthorizedWorkspace>>;
      try {
        result = await readAuthorizedWorkspace(
          options.repository,
          options.contributions,
          request.params.specId,
          request.authz,
          options.sessions,
          options.projectId?.(),
        );
      } catch (error) {
        // Authorization failures and defects keep their own handling; only a failing canonical
        // source is an unavailable read.
        if (!isSpecsSourceError(error)) {
          throw error;
        }

        return reply.code(503).send({ error: 'specification_source_unavailable' });
      }

      if (result.kind === 'ok') {
        return result.value;
      }

      if (result.kind === 'not_found') {
        return reply.code(404).send({ error: 'specification_not_found' });
      }

      return reply.code(503).send({ error: 'specification_source_unavailable' });
    },
  );

  done();
};

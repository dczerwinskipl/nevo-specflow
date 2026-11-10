import { Type } from 'typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginCallback } from 'fastify';
import {
  GitCapabilityError,
  ProjectHomeError,
  SpecificationError,
  WorkspaceRegistryError,
} from '@nevo/specflow-engine';
import {
  AuthenticationRequiredErrorResponseSchema,
  AuthorizationForbiddenErrorResponseSchema,
} from '@nevo/specflow-contracts/authorization';
import { SpecCapabilities } from '@nevo/specflow-contracts/specs';
import { SpecificationReadErrorSchema } from '@nevo/specflow-contracts/specs/workspace';
import {
  SpecsOverviewQuerySchema,
  SpecsOverviewReadErrorSchema,
  SpecsOverviewSchema,
  type CurrentSpecSectionId,
} from '@nevo/specflow-contracts/specs/overview';

import { requireCapabilityInAnyScope } from '../../auth';
import type { ProjectIdSource } from '../scope';
import type { SpecsOverviewRepository } from './repository/read-repository';
import { SpecsReadError, type SpecsReadErrorCode } from '../read/error';
import { getArchiveOverview } from './archive/get-overview';
import { getCurrentOverview } from './current/get-overview';
import { contractRef } from '../../../server/shared-contracts';

export interface SpecsOverviewEndpointOptions {
  readonly repository?: SpecsOverviewRepository;
  readonly currentSections: readonly CurrentSpecSectionId[];
  /** The Runtime's project; see `specScope`. */
  readonly projectId?: ProjectIdSource;
}

export const specsOverviewEndpoint: FastifyPluginCallback<SpecsOverviewEndpointOptions> = (
  app,
  options,
  done,
) => {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/api/specs/overview',
    {
      preHandler: requireCapabilityInAnyScope({
        resource: SpecCapabilities,
        capability: SpecCapabilities.capabilities.View,
      }),
      schema: {
        tags: ['Specifications'],
        summary: 'Read the Specifications overview',
        querystring: SpecsOverviewQuerySchema,
        response: {
          200: SpecsOverviewSchema,
          503: Type.Union([
            SpecsOverviewReadErrorSchema,
            contractRef(SpecificationReadErrorSchema),
          ]),
          401: contractRef(AuthenticationRequiredErrorResponseSchema),
          403: contractRef(AuthorizationForbiddenErrorResponseSchema),
        },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      if (!options.repository) {
        return reply.code(503).send({ error: 'specification_source_unavailable' });
      }

      try {
        return await (request.query.collection === 'archive'
          ? getArchiveOverview({
              authorization: request.authz,
              repository: options.repository,
              projectId: options.projectId?.(),
            })
          : getCurrentOverview({
              authorization: request.authz,
              repository: options.repository,
              sections: options.currentSections,
              projectId: options.projectId?.(),
            }));
      } catch (error) {
        const code = readErrorCode(error);
        if (!code) {
          throw error;
        }

        return reply.code(503).send({ error: code, code });
      }
    },
  );

  done();
};

function readErrorCode(error: unknown): SpecsReadErrorCode | undefined {
  if (error instanceof SpecsReadError) {
    return error.code;
  }

  if (
    error instanceof SpecificationError ||
    error instanceof WorkspaceRegistryError ||
    error instanceof ProjectHomeError ||
    error instanceof GitCapabilityError
  ) {
    return 'SPEC_SOURCE_UNAVAILABLE';
  }

  return undefined;
}

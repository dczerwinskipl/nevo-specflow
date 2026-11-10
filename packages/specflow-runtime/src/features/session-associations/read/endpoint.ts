import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';
import { SessionAssociationReadSchema, SessionIdSchema } from '@nevo/specflow-contracts/sessions';
import type { SessionAssociations } from '../../sessions';
import type { ProjectIdSource } from '../../specs';
import type { AssociationTargets } from '../targets';
import { readSessionAssociation } from './read-association';
import { AuthorizationForbiddenErrorResponseSchema } from '@nevo/specflow-contracts/authorization';
import { contractRef } from '../../../server/shared-contracts';

// A Session UUID in project and demo mode alike; the port decides whether it exists.
const params = Type.Object({ sessionId: SessionIdSchema }, { additionalProperties: false });

/** `GET /api/sessions/:sessionId/association`, in project and demo mode alike. */
export function registerSessionAssociationReadRoute(
  feature: FastifyInstance,
  options: {
    associations: SessionAssociations;
    targets: AssociationTargets;
    projectId: ProjectIdSource;
  },
): void {
  feature.withTypeProvider<TypeBoxTypeProvider>().get(
    '/api/sessions/:sessionId/association',
    {
      schema: {
        tags: ['Sessions'],
        summary: 'Read the Specification association of a Session',
        params,
        response: {
          200: SessionAssociationReadSchema,
          403: contractRef(AuthorizationForbiddenErrorResponseSchema),
        },
      },
    },
    (request) =>
      readSessionAssociation(
        {
          associations: options.associations,
          targets: options.targets,
          projectId: options.projectId(),
        },
        request.authz,
        request.params.sessionId,
      ),
  );
}

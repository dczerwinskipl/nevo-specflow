import type { FastifyInstance } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { Type } from 'typebox';
import {
  SessionAssociationReadSchema,
  SessionReferenceIdSchema,
} from '@nevo/specflow-contracts/sessions';
import type { SessionAssociations } from '../../sessions';
import type { ProjectIdSource } from '../../specs';
import type { AssociationTargets } from '../targets';
import { readSessionAssociation } from './read-association';

// A managed Session UUID or a demo catalogue Session id; the port decides whether it exists.
const params = Type.Object(
  { sessionId: SessionReferenceIdSchema },
  { additionalProperties: false },
);

/** `GET /api/sessions/:sessionId/association`, in project and demo mode alike. */
export function registerSessionAssociationReadRoute(
  feature: FastifyInstance,
  options: {
    associations: SessionAssociations;
    targets: AssociationTargets;
    projectId: ProjectIdSource;
  },
): void {
  feature
    .withTypeProvider<TypeBoxTypeProvider>()
    .get(
      '/api/sessions/:sessionId/association',
      { schema: { params, response: { 200: SessionAssociationReadSchema } } },
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

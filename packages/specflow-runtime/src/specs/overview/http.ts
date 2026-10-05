import type { FastifyPluginCallback } from 'fastify';
import { setTimeout as delay } from 'node:timers/promises';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import {
  SpecsOverviewProjectionSchema,
  SpecsOverviewQuerySchema,
  type SpecsOverviewGroup,
  type SpecOverviewIdentity,
} from '@nevo/specflow-contracts/specs-overview';
import { AuthorizationErrorResponseSchema } from '@nevo/specflow-contracts/authorization';
import type { CapabilityRoutesOptions } from '../../auth/authorization/capabilities/http';
import { resolveAuthorizationAccess } from '../../auth/authorization/access';
import { SAMPLE_PROJECT_ID, sampleSpecsOverview } from './sample';

export const specsOverviewRoutes: FastifyPluginCallback<
  CapabilityRoutesOptions & { groups?: readonly SpecsOverviewGroup[] }
> = (app, options, done) => {
  app.withTypeProvider<TypeBoxTypeProvider>().get(
    '/api/specs/overview',
    {
      schema: {
        querystring: SpecsOverviewQuerySchema,
        response: { 200: SpecsOverviewProjectionSchema, 401: AuthorizationErrorResponseSchema },
      },
    },
    async (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      // Simulate transport latency for the provisional backend sample catalogue.
      await delay(200);
      const access = resolveAuthorizationAccess(
        options.auth,
        options.store,
        request.cookies[options.cookieNames.session],
      );
      if (access.mode === 'unauthenticated') {
        reply.code(401);
        return { error: 'authentication_required' as const };
      }
      const projection = sampleSpecsOverview(request.query.collection ?? 'active', options.groups);
      // Collection access is per-item; no grant yields empty 200, not a collection 403.
      const canView = (item: SpecOverviewIdentity) =>
        access.mode === 'disabled' ||
        options.authorization.can({
          subject: access.subject,
          resource: { name: 'spec', scope: { projectId: SAMPLE_PROJECT_ID, specId: item.id } },
          capability: 'spec.view',
        });
      if (projection.collection === 'archive')
        return { ...projection, items: projection.items.filter(canView) };
      return { ...projection, items: projection.items.filter(canView) };
    },
  );
  done();
};

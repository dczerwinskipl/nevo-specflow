import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginCallback } from 'fastify';

import type { Authorization } from '@nevo/authorization';
import {
  AuthorizationCapabilitiesRequestSchema,
  AuthorizationCapabilitiesResponseSchema,
  AuthorizationErrorResponseSchema,
  type AuthorizationErrorResponse,
} from '@nevo/specflow-contracts/authorization';

import type { RuntimeAuthConfig } from '../../authentication/config/model';
import type { AuthStore } from '../../authentication/session/state';
import { resolveCapabilitiesForSession } from './resolve';
import { AUTH_SESSION_COOKIE } from '../../http/cookies';

export interface CapabilityRoutesOptions {
  readonly auth: RuntimeAuthConfig;
  readonly authorization: Authorization;
  readonly store: AuthStore;
}

export const capabilityRoutes: FastifyPluginCallback<CapabilityRoutesOptions> = (
  app,
  options,
  done,
) => {
  const routes = app.withTypeProvider<TypeBoxTypeProvider>();

  routes.post(
    '/api/authorization/capabilities',
    {
      schema: {
        body: AuthorizationCapabilitiesRequestSchema,
        response: {
          200: AuthorizationCapabilitiesResponseSchema,
          401: AuthorizationErrorResponseSchema,
        },
      },
    },
    (request, reply) => {
      reply.header('Cache-Control', 'no-store');

      const result = resolveCapabilitiesForSession(
        options.auth,
        options.store,
        options.authorization,
        request.cookies[AUTH_SESSION_COOKIE],
        request.body.resource,
      );

      if (!result.ok) {
        reply.code(401);
        const response: AuthorizationErrorResponse = { error: result.error };
        return response;
      }

      return result.response;
    },
  );

  done();
};

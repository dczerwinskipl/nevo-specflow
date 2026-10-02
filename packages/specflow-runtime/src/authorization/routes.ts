import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginCallback } from 'fastify';

import type { RuntimeAuthConfig } from '../auth/config.js';
import { AUTH_SESSION_COOKIE } from '../auth/session-access.js';
import type { InMemoryAuthStore } from '../auth/session-store.js';
import type { RuntimeAuthorizationConfig } from './config.js';
import {
  AuthorizationCapabilitiesBodySchema,
  AuthorizationCapabilitiesResponseSchema,
  AuthorizationErrorSchema,
  type AuthorizationErrorResponse,
} from './contracts.js';
import { resolveAuthorizationAccess } from './access.js';
import { createSpecFlowAuthorization } from './composition.js';

export interface AuthorizationFeatureOptions {
  readonly auth: RuntimeAuthConfig;
  readonly authorization: RuntimeAuthorizationConfig;
  readonly store: InMemoryAuthStore;
}

export const authorizationFeature: FastifyPluginCallback<AuthorizationFeatureOptions> = (
  app,
  options,
  done,
) => {
  const routes = app.withTypeProvider<TypeBoxTypeProvider>();
  const authorization = createSpecFlowAuthorization(options.authorization);

  routes.post(
    '/api/authorization/capabilities',
    {
      schema: {
        body: AuthorizationCapabilitiesBodySchema,
        response: {
          200: AuthorizationCapabilitiesResponseSchema,
          401: AuthorizationErrorSchema,
        },
      },
    },
    (request, reply) => {
      reply.header('Cache-Control', 'no-store');

      const access = resolveAuthorizationAccess(
        options.auth,
        options.store,
        request.cookies[AUTH_SESSION_COOKIE],
      );

      if (access.mode === 'unauthenticated') {
        reply.code(401);
        return authorizationError();
      }

      const capabilities =
        access.mode === 'disabled'
          ? authorization.resourceCapabilities(request.body.resource.name)
          : authorization.resolveCapabilities({
              subject: access.subject,
              resource: request.body.resource,
            }).capabilities;

      return { resource: request.body.resource, capabilities };
    },
  );

  done();
};

function authorizationError(): AuthorizationErrorResponse {
  return { error: 'authentication_required' };
}

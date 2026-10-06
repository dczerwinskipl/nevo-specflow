import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginCallback } from 'fastify';

import { AuthSessionResponseSchema } from '@nevo/specflow-contracts/authentication';

import type { RuntimeAuthenticationConfig } from '../configuration/model';
import { logout } from './logout';
import { getAuthSession } from './get-session';
import type { AuthenticationStore } from '../store';
import type { AuthCookieNames, AuthCookieOptions } from '../http/cookies';

export interface SessionEndpointOptions {
  readonly authentication: RuntimeAuthenticationConfig;
  readonly store: AuthenticationStore;
  readonly cookieNames: AuthCookieNames;
  readonly cookieOptions: AuthCookieOptions;
}

export const sessionEndpoint: FastifyPluginCallback<SessionEndpointOptions> = (
  app,
  options,
  done,
) => {
  const routes = app.withTypeProvider<TypeBoxTypeProvider>();

  routes.get(
    '/api/auth/session',
    {
      schema: {
        response: {
          200: AuthSessionResponseSchema,
        },
      },
    },
    (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return getAuthSession(
        options.authentication,
        options.store,
        request.cookies[options.cookieNames.session],
      );
    },
  );

  routes.post('/api/auth/logout', (request, reply) => {
    logout(
      options.store,
      request.cookies[options.cookieNames.session],
      request.cookies[options.cookieNames.oidc],
    );
    reply.clearCookie(options.cookieNames.session, options.cookieOptions);
    reply.clearCookie(options.cookieNames.oidc, options.cookieOptions);
    return reply.code(204).send();
  });

  done();
};

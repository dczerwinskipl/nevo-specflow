import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginCallback } from 'fastify';

import { AuthSessionResponseSchema } from '@nevo/specflow-contracts/authentication';

import type { RuntimeAuthConfig } from '../config/model';
import { clearAuthState, getAuthSession } from './access';
import type { AuthStore } from './state';
import { AUTH_SESSION_COOKIE, OIDC_COOKIE, type AuthCookieOptions } from '../../http/cookies';

export interface SessionRoutesOptions {
  readonly auth: RuntimeAuthConfig;
  readonly store: AuthStore;
  readonly cookieOptions: AuthCookieOptions;
}

export const sessionRoutes: FastifyPluginCallback<SessionRoutesOptions> = (app, options, done) => {
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
      return getAuthSession(options.auth, options.store, request.cookies[AUTH_SESSION_COOKIE]);
    },
  );

  routes.post('/api/auth/logout', (request, reply) => {
    clearAuthState(
      options.store,
      request.cookies[AUTH_SESSION_COOKIE],
      request.cookies[OIDC_COOKIE],
    );
    reply.clearCookie(AUTH_SESSION_COOKIE, options.cookieOptions);
    reply.clearCookie(OIDC_COOKIE, options.cookieOptions);
    return reply.code(204).send();
  });

  done();
};

import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginCallback } from 'fastify';

import {
  AuthSessionResponseSchema,
  PasswordLoginErrorResponseSchema,
  PasswordLoginRequestSchema,
  type PasswordLoginErrorResponse,
} from '@nevo/specflow-contracts/authentication';

import type { RuntimeAuthConfig } from '../config/model';
import type { PasswordAccountThrottle } from './account-throttle';
import { loginWithPassword } from './login';
import { ttlSeconds } from '../session/policy';
import type { AuthStore } from '../session/state';
import { AUTH_SESSION_COOKIE, type AuthCookieOptions } from '../../http/cookies';
import { PASSWORD_SOURCE_ATTEMPT_LIMIT, PASSWORD_SOURCE_WINDOW_MS } from '../../http/rate-limit';

const PASSWORD_LOGIN_BODY_LIMIT = 8 * 1024;

export interface PasswordRoutesOptions {
  readonly auth: RuntimeAuthConfig;
  readonly store: AuthStore;
  readonly accountThrottle: PasswordAccountThrottle;
  readonly cookieOptions: AuthCookieOptions;
}

export const passwordRoutes: FastifyPluginCallback<PasswordRoutesOptions> = (
  app,
  options,
  done,
) => {
  const routes = app.withTypeProvider<TypeBoxTypeProvider>();

  routes.post(
    '/api/auth/password/login',
    {
      bodyLimit: PASSWORD_LOGIN_BODY_LIMIT,
      config: {
        rateLimit: {
          max: PASSWORD_SOURCE_ATTEMPT_LIMIT,
          timeWindow: PASSWORD_SOURCE_WINDOW_MS,
        },
      },
      schema: {
        body: PasswordLoginRequestSchema,
        response: {
          200: AuthSessionResponseSchema,
          401: PasswordLoginErrorResponseSchema,
          429: PasswordLoginErrorResponseSchema,
          503: PasswordLoginErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await loginWithPassword(
        options.auth,
        options.store,
        options.accountThrottle,
        request.cookies[AUTH_SESSION_COOKIE],
        request.body.username,
        request.body.password,
      );

      if (!result.ok) {
        if (result.error === 'rate_limited') {
          reply.header('Retry-After', String(result.retryAfterSeconds));
        }
        if (result.error === 'service_unavailable') {
          request.log.warn('Authentication session store capacity reached during password login');
        }

        reply.code(passwordErrorStatus(result.error));
        const response: PasswordLoginErrorResponse = { error: result.error };
        return response;
      }

      reply.setCookie(AUTH_SESSION_COOKIE, result.sessionId, {
        ...options.cookieOptions,
        maxAge: ttlSeconds(options.store.policy.sessionTtlMs),
      });
      return result.session;
    },
  );

  done();
};

function passwordErrorStatus(error: PasswordLoginErrorResponse['error']): 401 | 429 | 503 {
  switch (error) {
    case 'invalid_credentials':
      return 401;
    case 'rate_limited':
      return 429;
    case 'service_unavailable':
      return 503;
  }
}

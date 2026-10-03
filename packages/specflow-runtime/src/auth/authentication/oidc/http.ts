import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginCallback } from 'fastify';

import {
  OidcCallbackErrorResponseSchema,
  OidcStartErrorResponseSchema,
  type OidcCallbackErrorResponse,
  type OidcStartErrorResponse,
} from '@nevo/specflow-contracts/authentication';

import type { RuntimeOidcEnabledProviderConfig } from '../config/model';
import type { OidcClient } from './client';
import { completeOidcLogin, startOidcLogin } from './login';
import { ttlSeconds } from '../session/policy';
import type { AuthStore } from '../session/state';
import { AUTH_SESSION_COOKIE, OIDC_COOKIE, type AuthCookieOptions } from '../../http/cookies';
import {
  OIDC_START_SOURCE_ATTEMPT_LIMIT,
  OIDC_START_SOURCE_WINDOW_MS,
} from '../../http/rate-limit';

const OIDC_CALLBACK_PATH = '/api/auth/oidc/callback';

export interface OidcRoutesOptions {
  readonly provider: RuntimeOidcEnabledProviderConfig;
  readonly store: AuthStore;
  readonly oidc: OidcClient;
  readonly publicOrigin: string;
  readonly cookieOptions: AuthCookieOptions;
}

export const oidcRoutes: FastifyPluginCallback<OidcRoutesOptions> = (app, options, done) => {
  const routes = app.withTypeProvider<TypeBoxTypeProvider>();

  routes.get(
    '/api/auth/oidc/login',
    {
      config: {
        rateLimit: {
          max: OIDC_START_SOURCE_ATTEMPT_LIMIT,
          timeWindow: OIDC_START_SOURCE_WINDOW_MS,
        },
      },
      schema: {
        response: {
          429: OidcStartErrorResponseSchema,
          503: OidcStartErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await startOidcLogin(
        options.store,
        options.oidc,
        request.cookies[OIDC_COOKIE],
        new URL(OIDC_CALLBACK_PATH, `${options.publicOrigin}/`).toString(),
      );

      if (!result.ok) {
        if (result.error === 'provider_unavailable') {
          request.log.warn(
            { oidc: result.providerError.diagnostic },
            'OIDC provider unavailable during login start',
          );
        } else {
          request.log.warn('OIDC transaction store capacity reached during login start');
        }

        reply.code(503);
        const response: OidcStartErrorResponse = { error: result.error };
        return response;
      }

      reply.setCookie(OIDC_COOKIE, result.transactionId, {
        ...options.cookieOptions,
        maxAge: ttlSeconds(options.store.policy.oidcTransactionTtlMs),
      });
      return reply.redirect(result.authorizationUrl.toString());
    },
  );

  // The callback query is provider protocol input. openid-client validates the raw URL
  // together with PKCE, state, and nonce; duplicating that protocol surface in a strict
  // application DTO would create a second, drifting validator.
  routes.get(
    OIDC_CALLBACK_PATH,
    {
      schema: {
        response: {
          400: OidcCallbackErrorResponseSchema,
          401: OidcCallbackErrorResponseSchema,
          403: OidcCallbackErrorResponseSchema,
          503: OidcCallbackErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await completeOidcLogin(
        options.provider,
        options.store,
        options.oidc,
        request.cookies[OIDC_COOKIE],
        request.cookies[AUTH_SESSION_COOKIE],
        new URL(request.url, options.publicOrigin),
      );

      if (!result.ok) {
        reply.clearCookie(OIDC_COOKIE, options.cookieOptions);
        if ('providerError' in result) {
          request.log.warn(
            { oidc: result.providerError.diagnostic },
            'OIDC callback failed at provider boundary',
          );
        } else if (result.error === 'service_unavailable') {
          request.log.warn('Authentication session store capacity reached during OIDC callback');
        }

        reply.code(oidcErrorStatus(result.error));
        const response: OidcCallbackErrorResponse = { error: result.error };
        return response;
      }

      reply.clearCookie(OIDC_COOKIE, options.cookieOptions);
      reply.setCookie(AUTH_SESSION_COOKIE, result.sessionId, {
        ...options.cookieOptions,
        maxAge: ttlSeconds(options.store.policy.sessionTtlMs),
      });
      return reply.redirect(new URL('/', options.publicOrigin).toString());
    },
  );

  done();
};

function oidcErrorStatus(error: OidcCallbackErrorResponse['error']): 400 | 401 | 403 | 503 {
  switch (error) {
    case 'invalid_oidc_transaction':
      return 400;
    case 'oidc_authentication_failed':
      return 401;
    case 'identity_not_allowed':
      return 403;
    case 'provider_unavailable':
    case 'service_unavailable':
      return 503;
  }
}

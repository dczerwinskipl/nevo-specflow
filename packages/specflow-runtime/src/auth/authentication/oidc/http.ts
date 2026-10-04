import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginCallback } from 'fastify';

import {
  OidcStartErrorResponseSchema,
  OidcStartRequestSchema,
  OidcStartSuccessResponseSchema,
  type OidcCallbackErrorCode,
  type OidcStartErrorResponse,
  type OidcStartSuccessResponse,
} from '@nevo/specflow-contracts/authentication';

import type { RuntimeOidcEnabledProviderConfig } from '../config/model';
import type { OidcClient } from './client';
import { completeOidcLogin, startOidcLogin } from './login';
import { ttlSeconds } from '../session/policy';
import type { AuthStore } from '../session/state';
import type { AuthCookieNames, AuthCookieOptions } from '../../http/cookies';
import {
  OIDC_START_SOURCE_ATTEMPT_LIMIT,
  OIDC_START_SOURCE_WINDOW_MS,
} from '../../http/rate-limit';

const DEFAULT_RETURN_TO = '/';

export interface OidcRoutesOptions {
  readonly providerId: string;
  readonly provider: RuntimeOidcEnabledProviderConfig;
  readonly store: AuthStore;
  readonly oidc: OidcClient;
  readonly publicOrigin: string;
  readonly cookieNames: AuthCookieNames;
  readonly cookieOptions: AuthCookieOptions;
}

export const oidcRoutes: FastifyPluginCallback<OidcRoutesOptions> = (app, options, done) => {
  const routes = app.withTypeProvider<TypeBoxTypeProvider>();

  routes.post(
    '/start',
    {
      config: {
        rateLimit: {
          max: OIDC_START_SOURCE_ATTEMPT_LIMIT,
          timeWindow: OIDC_START_SOURCE_WINDOW_MS,
        },
      },
      schema: {
        body: OidcStartRequestSchema,
        response: {
          200: OidcStartSuccessResponseSchema,
          400: OidcStartErrorResponseSchema,
          429: OidcStartErrorResponseSchema,
          503: OidcStartErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const returnTo = normalizeReturnTo(request.body.returnTo);
      if (!returnTo) {
        reply.code(400);
        const response: OidcStartErrorResponse = { error: 'invalid_return_to' };
        return response;
      }

      const callbackPath = `/api/auth/oidc/${options.providerId}/callback`;
      const result = await startOidcLogin(
        options.providerId,
        returnTo,
        options.store,
        options.oidc,
        request.cookies[options.cookieNames.oidc],
        new URL(callbackPath, `${options.publicOrigin}/`).toString(),
      );

      if (!result.ok) {
        if (result.error === 'provider_unavailable') {
          request.log.warn(
            { oidc: result.providerError.diagnostic, providerId: options.providerId },
            'OIDC provider unavailable during login start',
          );
        } else {
          request.log.warn('OIDC transaction store capacity reached during login start');
        }

        reply.code(503);
        const response: OidcStartErrorResponse = { error: result.error };
        return response;
      }

      reply.setCookie(options.cookieNames.oidc, result.transactionId, {
        ...options.cookieOptions,
        maxAge: ttlSeconds(options.store.policy.oidcTransactionTtlMs),
      });

      const response: OidcStartSuccessResponse = {
        authorizationUrl: result.authorizationUrl.toString(),
      };
      return response;
    },
  );

  routes.get('/callback', async (request, reply) => {
    const result = await completeOidcLogin(
      options.providerId,
      options.provider,
      options.store,
      options.oidc,
      request.cookies[options.cookieNames.oidc],
      request.cookies[options.cookieNames.session],
      new URL(request.url, options.publicOrigin),
    );

    if (!result.ok) {
      if (result.error !== 'invalid_oidc_transaction' || !result.preserveTransactionCookie) {
        reply.clearCookie(options.cookieNames.oidc, options.cookieOptions);
      }

      if ('providerError' in result) {
        request.log.warn(
          { oidc: result.providerError.diagnostic, providerId: options.providerId },
          'OIDC callback failed at provider boundary',
        );
      } else if (result.error === 'service_unavailable') {
        request.log.warn('Authentication session store capacity reached during OIDC callback');
      }

      return reply.redirect(
        loginRedirect(options.publicOrigin, result.error, result.returnTo).toString(),
      );
    }

    reply.clearCookie(options.cookieNames.oidc, options.cookieOptions);
    reply.setCookie(options.cookieNames.session, result.sessionId, {
      ...options.cookieOptions,
      maxAge: ttlSeconds(options.store.policy.sessionTtlMs),
    });
    return reply.redirect(new URL(result.returnTo, options.publicOrigin).toString());
  });

  done();
};

export function normalizeReturnTo(value: string | undefined): string | null {
  if (value === undefined) return DEFAULT_RETURN_TO;
  if (!value.startsWith('/') || value.startsWith('//')) return null;

  let url: URL;
  try {
    url = new URL(value, 'http://specflow.local');
  } catch {
    return null;
  }

  if (url.origin !== 'http://specflow.local') return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

function loginRedirect(publicOrigin: string, error: OidcCallbackErrorCode, returnTo?: string): URL {
  const url = new URL('/login', publicOrigin);
  url.searchParams.set('error', error);
  if (returnTo && returnTo !== DEFAULT_RETURN_TO) {
    url.searchParams.set('returnTo', returnTo);
  }
  return url;
}

import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginCallback } from 'fastify';
import { Type } from 'typebox';

import {
  OidcStartErrorResponseSchema,
  OidcStartRequestSchema,
  OidcStartSuccessResponseSchema,
  type OidcCallbackErrorCode,
  type OidcStartErrorResponse,
  type OidcStartSuccessResponse,
} from '@nevo/specflow-contracts/authentication';
import { RequestErrorResponseSchema } from '@nevo/specflow-contracts/runtime';

import { contractRef } from '../../../../server/shared-contracts';

import type { RuntimeOidcEnabledProviderConfig } from '../configuration/model';
import type { OidcClient } from './client';
import { completeOidcLogin } from './complete-login';
import { startOidcLogin } from './start-login';
import { ttlSeconds } from '../store/policy';
import type { AuthenticationStore } from '../store';
import type { AuthCookieNames, AuthCookieOptions } from '../http/cookies';
import { OIDC_START_SOURCE_ATTEMPT_LIMIT, OIDC_START_SOURCE_WINDOW_MS } from '../http/rate-limit';

const DEFAULT_RETURN_TO = '/';

export interface OidcLoginEndpointOptions {
  readonly providerId: string;
  readonly provider: RuntimeOidcEnabledProviderConfig;
  readonly store: AuthenticationStore;
  readonly oidc: OidcClient;
  readonly publicOrigin: string;
  readonly cookieNames: AuthCookieNames;
  readonly cookieOptions: AuthCookieOptions;
}

export const oidcLoginEndpoint: FastifyPluginCallback<OidcLoginEndpointOptions> = (
  app,
  options,
  done,
) => {
  const routes = app.withTypeProvider<TypeBoxTypeProvider>();

  routes.post(
    '/start',
    {
      config: {
        openApiPublic: true,
        rateLimit: {
          max: OIDC_START_SOURCE_ATTEMPT_LIMIT,
          timeWindow: OIDC_START_SOURCE_WINDOW_MS,
        },
      },
      schema: {
        tags: ['Authentication'],
        summary: 'Start an OIDC login',
        body: OidcStartRequestSchema,
        response: {
          200: OidcStartSuccessResponseSchema,
          // A body that fails the request schema (or is not JSON) is Fastify's request error: the
          // route's own `error` enum alone would make its serialization fail (`500`).
          400: Type.Union([OidcStartErrorResponseSchema, contractRef(RequestErrorResponseSchema)], {
            'x-response-description':
              'The request is invalid: `invalid_return_to` for a return path outside the ' +
              'Runtime, or the request error with `code` `FST_ERR_VALIDATION`, ' +
              '`FST_ERR_CTP_INVALID_JSON_BODY` or `FST_ERR_CTP_EMPTY_JSON_BODY`.',
          }),
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

  routes.get(
    '/callback',
    {
      config: {
        openApiPublic: true,
        // The authorization response the provider redirects with (OpenID Connect Core 3.1.2.5,
        // RFC 9207 `iss`). The handler and the OIDC client read the query themselves: every
        // failure, a missing parameter included, ends in the redirect to the login page.
        openApiParameters: {
          query: {
            code: 'The authorization code to exchange (a successful authorization response).',
            state:
              'The state of the login transaction; it must match the transaction cookie of the ' +
              'started login.',
            iss:
              'The issuer of the authorization response; when present, it must be the issuer of ' +
              'the provider (required when the provider advertises it).',
            error:
              'The error code of a failed authorization response; the login fails as ' +
              '`oidc_authentication_failed`.',
          },
        },
        openApiResponses: {
          302: {
            description:
              'The end of the OIDC login: a redirect to the return path of the login after a ' +
              'completed login, or to `/login?error=<code>` (with `returnTo` when it is not `/`) ' +
              'after a failed one. No body.',
            headers: {
              Location: 'The return path, or the login page with the error code.',
              'Set-Cookie':
                'Clears the OIDC transaction cookie; after a completed login, also sets the ' +
                'session cookie.',
            },
          },
        },
      },
      schema: { tags: ['Authentication'], summary: 'Complete an OIDC login' },
    },
    async (request, reply) => {
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
    },
  );

  done();
};

export function normalizeReturnTo(value: string | undefined): string | null {
  if (value === undefined) {
    return DEFAULT_RETURN_TO;
  }

  if (!value.startsWith('/') || value.startsWith('//')) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(value, 'http://specflow.local');
  } catch {
    return null;
  }

  if (url.origin !== 'http://specflow.local') {
    return null;
  }

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

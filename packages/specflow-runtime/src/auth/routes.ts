import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance, RawServerBase } from 'fastify';

import type { RuntimeAuthConfig } from './config.js';
import {
  type AuthErrorResponse,
  AuthErrorSchema,
  AuthSessionSchema,
  PasswordLoginBodySchema,
} from './contracts.js';
import { createOidcClient, type OidcClient } from './oidc.js';
import { completeOidcLogin, startOidcLogin } from './oidc-login.js';
import { loginWithPassword } from './password-login.js';
import { getAuthSession, logoutAuthSession } from './session-access.js';
import {
  AUTH_SESSION_TTL_MS,
  OIDC_TRANSACTION_TTL_MS,
  InMemoryAuthStore,
} from './session-store.js';

const SESSION_COOKIE = 'nevo_session';
const OIDC_COOKIE = 'nevo_oidc';
const OIDC_CALLBACK_PATH = '/api/auth/oidc/callback';
const PASSWORD_LOGIN_BODY_LIMIT = 4_096;

export interface AuthFeatureConfig {
  readonly auth: RuntimeAuthConfig;
  readonly publicOrigin?: string;
  readonly secureCookies: boolean;
}

export interface AuthFeatureDependencies {
  readonly store?: InMemoryAuthStore;
  readonly oidc?: OidcClient;
}

export function registerAuthFeature<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
  config: AuthFeatureConfig,
  dependencies: AuthFeatureDependencies = {},
): void {
  const routes = app.withTypeProvider<TypeBoxTypeProvider>();
  const store = dependencies.store ?? new InMemoryAuthStore();
  const oidc =
    dependencies.oidc ??
    (config.auth.providers.oidc.enabled ? createOidcClient(config.auth.providers.oidc) : undefined);
  const cookieOptions = authCookieOptions(config.secureCookies);

  routes.get(
    '/api/auth/session',
    {
      schema: {
        response: {
          200: AuthSessionSchema,
        },
      },
    },
    (request) => getAuthSession(config.auth, store, request.cookies[SESSION_COOKIE]),
  );

  routes.post(
    '/api/auth/password/login',
    {
      bodyLimit: PASSWORD_LOGIN_BODY_LIMIT,
      schema: {
        body: PasswordLoginBodySchema,
        response: {
          200: AuthSessionSchema,
          401: AuthErrorSchema,
          404: AuthErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await loginWithPassword(
        config.auth,
        store,
        request.cookies[SESSION_COOKIE],
        request.body.username,
        request.body.password,
      );

      if (!result.ok) {
        reply.code(result.error === 'invalid_credentials' ? 401 : 404);
        return authError(result.error);
      }

      reply.setCookie(SESSION_COOKIE, result.sessionId, {
        ...cookieOptions,
        maxAge: Math.floor(AUTH_SESSION_TTL_MS / 1000),
      });
      return result.session;
    },
  );

  routes.get(
    '/api/auth/oidc/login',
    {
      schema: {
        response: {
          404: AuthErrorSchema,
        },
      },
    },
    async (_request, reply) => {
      const result = await startOidcLogin(config.auth, store, oidc, oidcCallbackUrl(config));
      if (!result.ok) {
        reply.code(404);
        return authError(result.error);
      }

      reply.setCookie(OIDC_COOKIE, result.transactionId, {
        ...cookieOptions,
        maxAge: Math.floor(OIDC_TRANSACTION_TTL_MS / 1000),
      });
      return reply.redirect(result.authorizationUrl.toString());
    },
  );

  routes.get(
    OIDC_CALLBACK_PATH,
    {
      schema: {
        response: {
          400: AuthErrorSchema,
          401: AuthErrorSchema,
          403: AuthErrorSchema,
          404: AuthErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const callbackUrl = new URL(request.url, requirePublicOrigin(config));
      const result = await completeOidcLogin(
        config.auth,
        store,
        oidc,
        request.cookies[OIDC_COOKIE],
        request.cookies[SESSION_COOKIE],
        callbackUrl,
      );

      if (!result.ok) {
        if (result.error === 'provider_unavailable') {
          reply.code(404);
          return authError(result.error);
        }

        reply.clearCookie(OIDC_COOKIE, cookieOptions);
        reply.code(oidcErrorStatus(result.error));
        return authError(result.error);
      }

      reply.clearCookie(OIDC_COOKIE, cookieOptions);
      reply.setCookie(SESSION_COOKIE, result.sessionId, {
        ...cookieOptions,
        maxAge: Math.floor(AUTH_SESSION_TTL_MS / 1000),
      });
      return reply.redirect(new URL('/', requirePublicOrigin(config)).toString());
    },
  );

  routes.post('/api/auth/logout', (request, reply) => {
    logoutAuthSession(store, request.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, cookieOptions);
    reply.clearCookie(OIDC_COOKIE, cookieOptions);
    return reply.code(204).send();
  });
}

function oidcCallbackUrl(config: AuthFeatureConfig): string {
  return new URL(OIDC_CALLBACK_PATH, `${requirePublicOrigin(config)}/`).toString();
}

function requirePublicOrigin(config: AuthFeatureConfig): string {
  if (!config.publicOrigin) {
    throw new Error('OIDC requires server.publicOrigin.');
  }
  return config.publicOrigin;
}

function oidcErrorStatus(
  error: 'invalid_oidc_transaction' | 'oidc_authentication_failed' | 'identity_not_allowed',
): 400 | 401 | 403 {
  switch (error) {
    case 'invalid_oidc_transaction':
      return 400;
    case 'oidc_authentication_failed':
      return 401;
    case 'identity_not_allowed':
      return 403;
  }
}

interface AuthCookieOptions {
  readonly path: '/';
  readonly httpOnly: true;
  readonly sameSite: 'lax';
  readonly secure: boolean;
}

function authCookieOptions(secure: boolean): AuthCookieOptions {
  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
  };
}

function authError(error: AuthErrorResponse['error']): AuthErrorResponse {
  return { error };
}

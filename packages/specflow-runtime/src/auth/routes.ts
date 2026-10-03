import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyPluginCallback } from 'fastify';

import type { RuntimeAuthConfig } from './config.js';
import {
  type AuthErrorResponse,
  AuthErrorSchema,
  AuthSessionSchema,
  PasswordLoginBodySchema,
} from './contracts.js';
import { InMemoryPasswordLoginThrottle, type PasswordLoginThrottle } from './login-throttle.js';
import { createOidcClient, type OidcClient } from './oidc.js';
import { InMemoryOidcStartThrottle, type OidcStartThrottle } from './oidc-start-throttle.js';
import { completeOidcLogin, startOidcLogin } from './oidc-login.js';
import { loginWithPassword } from './password-login.js';
import { AUTH_SESSION_COOKIE, getAuthSession, logoutAuthSession } from './session-access.js';
import {
  AUTH_SESSION_TTL_MS,
  OIDC_TRANSACTION_TTL_MS,
  InMemoryAuthStore,
} from './session-store.js';

const OIDC_COOKIE = 'nevo_oidc';
const OIDC_CALLBACK_PATH = '/api/auth/oidc/callback';
const PASSWORD_LOGIN_BODY_LIMIT = 4_096;

export interface AuthFeatureDependencies {
  readonly store?: InMemoryAuthStore;
  readonly oidc?: OidcClient;
  readonly passwordLoginThrottle?: PasswordLoginThrottle;
  readonly oidcStartThrottle?: OidcStartThrottle;
}

export interface AuthFeatureOptions {
  readonly auth: RuntimeAuthConfig;
  readonly publicOrigin?: string;
  readonly secureCookies: boolean;
  readonly dependencies?: AuthFeatureDependencies;
}

export const authFeature: FastifyPluginCallback<AuthFeatureOptions> = (app, options, done) => {
  const routes = app.withTypeProvider<TypeBoxTypeProvider>();
  const store = options.dependencies?.store ?? new InMemoryAuthStore();
  const passwordLoginThrottle =
    options.dependencies?.passwordLoginThrottle ?? new InMemoryPasswordLoginThrottle();
  const oidcStartThrottle =
    options.dependencies?.oidcStartThrottle ?? new InMemoryOidcStartThrottle();
  const oidc =
    options.dependencies?.oidc ??
    (options.auth.providers.oidc.enabled
      ? createOidcClient(options.auth.providers.oidc)
      : undefined);
  const cookieOptions = authCookieOptions(options.secureCookies);

  routes.get(
    '/api/auth/session',
    {
      schema: {
        response: {
          200: AuthSessionSchema,
        },
      },
    },
    (request, reply) => {
      reply.header('Cache-Control', 'no-store');
      return getAuthSession(options.auth, store, request.cookies[AUTH_SESSION_COOKIE]);
    },
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
          429: AuthErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await loginWithPassword(
        options.auth,
        store,
        passwordLoginThrottle,
        request.ip,
        request.cookies[AUTH_SESSION_COOKIE],
        request.body.username,
        request.body.password,
      );

      if (!result.ok) {
        if (result.error === 'rate_limited') {
          reply.header('Retry-After', String(result.retryAfterSeconds));
          reply.code(429);
        } else {
          reply.code(result.error === 'invalid_credentials' ? 401 : 404);
        }
        return authError(result.error);
      }

      reply.setCookie(AUTH_SESSION_COOKIE, result.sessionId, {
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
          429: AuthErrorSchema,
        },
      },
    },
    async (request, reply) => {
      const result = await startOidcLogin(
        options.auth,
        store,
        oidc,
        oidcStartThrottle,
        request.ip,
        oidcCallbackUrl(options),
      );
      if (!result.ok) {
        if (result.error === 'rate_limited') {
          reply.header('Retry-After', String(result.retryAfterSeconds));
          reply.code(429);
        } else {
          reply.code(404);
        }
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
      const callbackUrl = new URL(request.url, requirePublicOrigin(options));
      const result = await completeOidcLogin(
        options.auth,
        store,
        oidc,
        request.cookies[OIDC_COOKIE],
        request.cookies[AUTH_SESSION_COOKIE],
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
      reply.setCookie(AUTH_SESSION_COOKIE, result.sessionId, {
        ...cookieOptions,
        maxAge: Math.floor(AUTH_SESSION_TTL_MS / 1000),
      });
      return reply.redirect(new URL('/', requirePublicOrigin(options)).toString());
    },
  );

  routes.post('/api/auth/logout', (request, reply) => {
    logoutAuthSession(store, request.cookies[AUTH_SESSION_COOKIE]);
    reply.clearCookie(AUTH_SESSION_COOKIE, cookieOptions);
    reply.clearCookie(OIDC_COOKIE, cookieOptions);
    return reply.code(204).send();
  });

  done();
};

function oidcCallbackUrl(options: AuthFeatureOptions): string {
  return new URL(OIDC_CALLBACK_PATH, `${requirePublicOrigin(options)}/`).toString();
}

function requirePublicOrigin(options: AuthFeatureOptions): string {
  if (!options.publicOrigin) {
    throw new Error('OIDC requires server.publicOrigin.');
  }
  return options.publicOrigin;
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

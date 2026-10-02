import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import type { FastifyInstance, FastifyReply } from 'fastify';

import type { RuntimeConfig } from '../config/types.js';
import { AuthErrorSchema, AuthSessionSchema, PasswordLoginBodySchema } from './contracts.js';
import { createGoogleOidcClient, type GoogleOidcClient, normalizeEmail } from './google-oidc.js';
import { authenticatePassword } from './password-auth.js';
import {
  AUTH_SESSION_TTL_MS,
  OIDC_TRANSACTION_TTL_MS,
  InMemoryAuthStore,
} from './session-store.js';
import { authenticatedSession, unauthenticatedSession } from './session.js';

const SESSION_COOKIE = 'nevo_session';
const OIDC_COOKIE = 'nevo_oidc';
const GOOGLE_CALLBACK_PATH = '/api/auth/oidc/google/callback';
const PASSWORD_LOGIN_BODY_LIMIT = 4_096;

export interface AuthFeatureDependencies {
  readonly store?: InMemoryAuthStore;
  readonly googleOidc?: GoogleOidcClient;
}

export function registerAuthFeature(
  app: FastifyInstance,
  config: RuntimeConfig,
  dependencies: AuthFeatureDependencies = {},
): void {
  const routes = app.withTypeProvider<TypeBoxTypeProvider>();
  const store = dependencies.store ?? new InMemoryAuthStore();
  const googleOidc =
    dependencies.googleOidc ??
    (config.auth.providers.google.enabled
      ? createGoogleOidcClient(config.auth.providers.google)
      : undefined);
  const cookieOptions = authCookieOptions(config);

  routes.get(
    '/api/auth/session',
    {
      schema: {
        response: {
          200: AuthSessionSchema,
        },
      },
    },
    (request) => {
    const stored = store.getSession(request.cookies[SESSION_COOKIE]);
    if (!stored) return unauthenticatedSession(config.auth);
      return authenticatedSession(config.auth, stored.userId, stored.provider);
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
        },
      },
    },
    async (request, reply) => {
      if (!config.auth.providers.password.enabled) {
        return authError(reply, 404, 'provider_unavailable');
      }

      const user = await authenticatePassword(
        config.auth,
        request.body.username,
        request.body.password,
      );
      if (!user) return authError(reply, 401, 'invalid_credentials');

      store.deleteSession(request.cookies[SESSION_COOKIE]);
      const sessionId = store.createSession({ userId: user.id, provider: 'password' });
      reply.setCookie(SESSION_COOKIE, sessionId, {
        ...cookieOptions,
        maxAge: Math.floor(AUTH_SESSION_TTL_MS / 1000),
      });
      return authenticatedSession(config.auth, user.id, 'password');
    },
  );

  routes.get(
    '/api/auth/oidc/google/login',
    {
      schema: {
        response: {
          404: AuthErrorSchema,
        },
      },
    },
    async (_request, reply) => {
    if (!config.auth.providers.google.enabled || !googleOidc) {
      return authError(reply, 404, 'provider_unavailable');
    }

    const redirectUri = googleCallbackUrl(config);
    const started = await googleOidc.start(redirectUri);
    const transactionId = store.createOidcTransaction(started.transaction);
    reply.setCookie(OIDC_COOKIE, transactionId, {
      ...cookieOptions,
      maxAge: Math.floor(OIDC_TRANSACTION_TTL_MS / 1000),
    });
      return reply.redirect(started.authorizationUrl.toString());
    },
  );

  routes.get(
    GOOGLE_CALLBACK_PATH,
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
    if (!config.auth.providers.google.enabled || !googleOidc) {
      return authError(reply, 404, 'provider_unavailable');
    }

    const transaction = store.consumeOidcTransaction(request.cookies[OIDC_COOKIE]);
    reply.clearCookie(OIDC_COOKIE, cookieOptions);
    if (!transaction) return authError(reply, 400, 'invalid_oidc_transaction');

    let identity;
    try {
      const callbackUrl = new URL(request.url, config.server.publicOrigin);
      identity = await googleOidc.complete(callbackUrl, transaction);
    } catch {
      return authError(reply, 401, 'oidc_authentication_failed');
    }

    const userId = config.auth.providers.google.allowedEmails[normalizeEmail(identity.email)];
    if (!userId) return authError(reply, 403, 'identity_not_allowed');

    store.deleteSession(request.cookies[SESSION_COOKIE]);
    const sessionId = store.createSession({
      userId,
      provider: 'google',
      providerSubject: identity.subject,
    });
    reply.setCookie(SESSION_COOKIE, sessionId, {
      ...cookieOptions,
      maxAge: Math.floor(AUTH_SESSION_TTL_MS / 1000),
    });
      return reply.redirect(new URL('/', config.server.publicOrigin).toString());
    },
  );

  routes.post('/api/auth/logout', (request, reply) => {
    store.deleteSession(request.cookies[SESSION_COOKIE]);
    reply.clearCookie(SESSION_COOKIE, cookieOptions);
    reply.clearCookie(OIDC_COOKIE, cookieOptions);
    return reply.code(204).send();
  });
}

function googleCallbackUrl(config: RuntimeConfig): string {
  if (!config.server.publicOrigin) {
    throw new Error('Google OIDC requires server.publicOrigin.');
  }
  return new URL(GOOGLE_CALLBACK_PATH, `${config.server.publicOrigin}/`).toString();
}

interface AuthCookieOptions {
  readonly path: '/';
  readonly httpOnly: true;
  readonly sameSite: 'lax';
  readonly secure: boolean;
}

function authCookieOptions(config: RuntimeConfig): AuthCookieOptions {
  const secure =
    config.server.tls.enabled ||
    (config.server.publicOrigin !== undefined &&
      new URL(config.server.publicOrigin).protocol === 'https:');

  return {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure,
  };
}

function authError(reply: FastifyReply, statusCode: number, code: string) {
  return reply.code(statusCode).send({ error: code });
}

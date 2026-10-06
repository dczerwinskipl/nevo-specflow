import type { Authorization } from '@nevo/authorization';
import type { FastifyInstance, RawServerBase } from 'fastify';

import type { RuntimeAuthenticationConfig } from '../authentication/configuration/model';
import type { AuthenticationStore } from '../authentication/store';
import type { AuthCookieNames } from '../authentication/http/cookies';
import { resolveAuthorizationAccess } from './resolve-access';
import { createRequestAuthorization, type RequestAuthorization } from './request-authorization';

declare module 'fastify' {
  interface FastifyRequest {
    authz: RequestAuthorization;
  }
}

export interface AuthorizationRequestContextOptions {
  readonly authentication: RuntimeAuthenticationConfig;
  readonly authorization: Authorization;
  readonly store: AuthenticationStore;
  readonly cookieNames: AuthCookieNames;
}

export function registerAuthorizationRequestContext<RawServer extends RawServerBase>(
  app: FastifyInstance<RawServer>,
  options: AuthorizationRequestContextOptions,
): void {
  app.decorateRequest('authz');

  app.addHook('onRequest', (request, _reply, done) => {
    const access = resolveAuthorizationAccess(
      options.authentication,
      options.store,
      request.cookies[options.cookieNames.session],
    );

    request.authz = createRequestAuthorization(access, options.authorization);
    done();
  });
}

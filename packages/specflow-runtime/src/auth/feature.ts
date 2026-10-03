import type { FastifyPluginAsync } from 'fastify';

import type { RuntimeAuthConfig } from './authentication/config/model';
import { createOidcClient, type OidcClient } from './authentication/oidc/client';
import { oidcRoutes } from './authentication/oidc/http';
import {
  InMemoryPasswordAccountThrottle,
  type PasswordAccountThrottle,
} from './authentication/password/account-throttle';
import { passwordRoutes } from './authentication/password/http';
import type { AuthSessionPolicyOverrides } from './authentication/session/policy';
import { sessionRoutes } from './authentication/session/http';
import type { AuthStore } from './authentication/session/state';
import { InMemoryAuthStore } from './authentication/session/store';
import { capabilityRoutes } from './authorization/capabilities/http';
import { createSpecFlowAuthorization } from './authorization/composition';
import type { RuntimeAuthorizationConfig } from './authorization/config';
import { authCookieOptions } from './http/cookies';
import { registerAuthRateLimit } from './http/rate-limit';

export interface AuthFeatureDependencies {
  readonly store?: AuthStore;
  readonly oidc?: OidcClient;
  readonly passwordAccountThrottle?: PasswordAccountThrottle;
  readonly inMemoryStorePolicy?: AuthSessionPolicyOverrides;
}

export interface AuthFeatureOptions {
  readonly auth: RuntimeAuthConfig;
  readonly authorization?: RuntimeAuthorizationConfig;
  readonly publicOrigin?: string;
  readonly secureCookies: boolean;
  readonly dependencies?: AuthFeatureDependencies;
}

export const authFeature: FastifyPluginAsync<AuthFeatureOptions> = async (app, options) => {
  const dependencies = options.dependencies;
  if (dependencies?.store && dependencies.inMemoryStorePolicy) {
    throw new Error(
      'AuthFeatureDependencies.inMemoryStorePolicy cannot be supplied with a custom AuthStore.',
    );
  }

  const store = dependencies?.store ?? new InMemoryAuthStore(dependencies?.inMemoryStorePolicy);
  const cookieOptions = authCookieOptions(options.secureCookies);
  const authorization = createSpecFlowAuthorization(options.authorization ?? { assignments: [] });

  await registerAuthRateLimit(app);

  app.register(sessionRoutes, { auth: options.auth, store, cookieOptions });
  app.register(capabilityRoutes, { auth: options.auth, authorization, store });

  if (options.auth.providers.password.enabled) {
    app.register(passwordRoutes, {
      auth: options.auth,
      store,
      accountThrottle:
        dependencies?.passwordAccountThrottle ?? new InMemoryPasswordAccountThrottle(),
      cookieOptions,
    });
  }

  if (options.auth.providers.oidc.enabled) {
    if (!options.publicOrigin) {
      throw new Error('OIDC is enabled but Runtime publicOrigin is missing after validation.');
    }

    app.register(oidcRoutes, {
      provider: options.auth.providers.oidc,
      store,
      oidc: dependencies?.oidc ?? createOidcClient(options.auth.providers.oidc),
      publicOrigin: options.publicOrigin,
      cookieOptions,
    });
  }
};

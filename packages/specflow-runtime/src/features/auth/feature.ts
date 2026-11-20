import type { CapabilityId, ResourceDefinition } from '@nevo/authorization';
import type { FastifyInstance, RawServerBase } from 'fastify';

import {
  enabledOidcProviders,
  type RuntimeAuthenticationConfig,
} from './authentication/configuration/model';
import { authCookieNames, authCookieOptions } from './authentication/http/cookies';
import { createOidcClient, type OidcClient } from './authentication/oidc-login/client';
import { oidcLoginEndpoint } from './authentication/oidc-login/endpoint';
import {
  InMemoryPasswordAccountThrottle,
  type PasswordAccountThrottle,
} from './authentication/password-login/account-throttle';
import { passwordLoginEndpoint } from './authentication/password-login/endpoint';
import { sessionEndpoint } from './authentication/session/endpoint';
import type { AuthenticationStore } from './authentication/store';
import { InMemoryAuthenticationStore } from './authentication/store/in-memory-store';
import type { AuthenticationStorePolicyOverrides } from './authentication/store/policy';
import { capabilityDiscoveryEndpoint } from './authorization/capability-discovery/endpoint';
import type { RuntimeAuthorizationConfig } from './authorization/configuration/model';
import { createRuntimeAuthorization } from './authorization/create-authorization';
import { registerAuthorizationRequestContext } from './authorization/request-context';
import type { SpecFlowRoleId } from './authorization/roles';
import { devicePairingEndpoint } from './device-pairing/endpoint';
import type { DevicePairing } from './device-pairing/pairing';
import { deviceCookieNames, deviceCookieOptions } from './owner-credential/cookie';
import { registerOwnerCredentialGuard } from './owner-credential/guard';

export interface AuthFeatureDependencies {
  readonly store?: AuthenticationStore;
  readonly oidcClients?: Readonly<Record<string, OidcClient>>;
  readonly passwordAccountThrottle?: PasswordAccountThrottle;
  readonly inMemoryStorePolicy?: AuthenticationStorePolicyOverrides;
  /**
   * Device pairing of trusted local mode (D21): the Runtime start opens it over the local state;
   * the composition root otherwise gives an empty in-memory one, so owner routes are refused until
   * a device is paired.
   */
  readonly devicePairing?: DevicePairing;
}

export interface CreateAuthFeatureOptions {
  readonly authentication: RuntimeAuthenticationConfig;
  readonly authorization?: RuntimeAuthorizationConfig;
  readonly authorizationResources: readonly ResourceDefinition[];
  readonly roles: Readonly<Record<SpecFlowRoleId, readonly CapabilityId[]>>;
  readonly publicOrigin?: string;
  readonly serverPort: number;
  readonly secureCookies: boolean;
  /**
   * Whether owner routes need an owner credential (D21): `enforced` in project mode (the session
   * under required authentication, a paired device in trusted local mode), `not-required` for the
   * demo Runtime, which has no agent execution.
   */
  readonly ownerCredential: 'enforced' | 'not-required';
  readonly dependencies?: AuthFeatureDependencies;
}

export interface AuthFeature {
  register<RawServer extends RawServerBase>(app: FastifyInstance<RawServer>): void | Promise<void>;
}

export function createAuthFeature(options: CreateAuthFeatureOptions): AuthFeature {
  const dependencies = options.dependencies;

  if (dependencies?.store && dependencies.inMemoryStorePolicy) {
    throw new Error(
      'AuthFeatureDependencies.inMemoryStorePolicy cannot be supplied with a custom AuthenticationStore.',
    );
  }

  const store =
    dependencies?.store ?? new InMemoryAuthenticationStore(dependencies?.inMemoryStorePolicy);
  const cookieNames = authCookieNames(options.serverPort);
  const cookieOptions = authCookieOptions(options.secureCookies);
  const authorization = createRuntimeAuthorization({
    config: options.authorization ?? { assignments: [] },
    resources: options.authorizationResources,
    roles: options.roles,
  });
  const passwordAccountThrottle =
    dependencies?.passwordAccountThrottle ?? new InMemoryPasswordAccountThrottle();

  return {
    register(app) {
      registerAuthorizationRequestContext(app, {
        authentication: options.authentication,
        authorization,
        store,
        cookieNames,
      });

      const deviceCookies = deviceCookieNames(options.serverPort);
      const pairing =
        options.ownerCredential === 'enforced' && options.authentication.mode === 'none'
          ? dependencies?.devicePairing
          : undefined;
      if (
        options.ownerCredential === 'enforced' &&
        options.authentication.mode === 'none' &&
        !pairing
      ) {
        throw new Error('Trusted local mode needs device pairing for its owner routes.');
      }

      if (options.ownerCredential === 'enforced') {
        registerOwnerCredentialGuard(app, {
          ...(options.publicOrigin ? { publicOrigin: options.publicOrigin } : {}),
          check: (cookies) => {
            if (pairing) {
              return pairing.deviceOf(cookies[deviceCookies.device])
                ? 'present'
                : 'owner-credential-required';
            }

            return store.getSession(cookies[cookieNames.session])
              ? 'present'
              : 'authentication-required';
          },
        });
      }

      app.register(sessionEndpoint, {
        authentication: options.authentication,
        store,
        cookieNames,
        cookieOptions,
      });

      app.register(capabilityDiscoveryEndpoint, {
        authorizationResources: options.authorizationResources,
      });

      if (options.authentication.providers.password.enabled) {
        app.register(passwordLoginEndpoint, {
          authentication: options.authentication,
          store,
          accountThrottle: passwordAccountThrottle,
          cookieNames,
          cookieOptions,
        });
      }

      const oidcProviders = enabledOidcProviders(options.authentication);
      if (oidcProviders.length > 0 && !options.publicOrigin) {
        throw new Error('OIDC is enabled but Runtime publicOrigin is missing after validation.');
      }

      for (const [providerId, provider] of oidcProviders) {
        app.register(oidcLoginEndpoint, {
          prefix: `/api/auth/oidc/${providerId}`,
          providerId,
          provider,
          store,
          oidc: dependencies?.oidcClients?.[providerId] ?? createOidcClient(provider),
          publicOrigin: options.publicOrigin!,
          cookieNames,
          cookieOptions,
        });
      }

      app.register(devicePairingEndpoint, {
        credential:
          options.ownerCredential === 'not-required'
            ? 'not-required'
            : pairing
              ? 'device'
              : 'session',
        ...(pairing ? { pairing } : {}),
        hasSession: (request) => store.getSession(request.cookies[cookieNames.session]) !== null,
        cookieNames: deviceCookies,
        cookieOptions: deviceCookieOptions(options.secureCookies),
      });
    },
  };
}

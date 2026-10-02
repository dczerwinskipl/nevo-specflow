import type { RuntimeAuthConfig } from './config.js';
import type { AuthProviderContract, AuthSessionResponse, AuthUserContract } from './contracts.js';

export type AuthProvider = AuthProviderContract;
export type AuthUser = AuthUserContract;
export type AuthSession = AuthSessionResponse;

export function configuredAuthProviders(auth: RuntimeAuthConfig): AuthProvider[] {
  const providers: AuthProvider[] = [];

  if (auth.providers.password.enabled) {
    providers.push('password');
  }
  if (auth.providers.oidc.enabled) {
    providers.push('oidc');
  }

  return providers;
}

export function unauthenticatedSession(auth: RuntimeAuthConfig): AuthSession {
  const user = auth.localUserId ? configuredUser(auth, auth.localUserId) : undefined;

  return {
    authenticated: false,
    ...(user ? { user } : {}),
    availableProviders: configuredAuthProviders(auth),
  };
}

export function authenticatedSession(
  auth: RuntimeAuthConfig,
  userId: string,
  provider: AuthProvider,
): AuthSession {
  return {
    authenticated: true,
    user: configuredUser(auth, userId),
    provider,
    availableProviders: configuredAuthProviders(auth),
  };
}

export function configuredUser(auth: RuntimeAuthConfig, userId: string): AuthUser {
  const user = auth.users[userId];
  if (!user) {
    throw new Error(`Configured auth user '${userId}' does not exist.`);
  }

  return { id: userId, name: user.name };
}

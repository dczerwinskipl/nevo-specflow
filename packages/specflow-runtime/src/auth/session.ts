import type { RuntimeAuthConfig } from '../config/types.js';

export type AuthProvider = 'password' | 'google';

export interface AuthUser {
  readonly id: string;
  readonly name: string;
}

export interface AuthSession {
  readonly authenticated: boolean;
  readonly user?: AuthUser;
  readonly provider?: AuthProvider;
  readonly availableProviders: AuthProvider[];
}

export function configuredAuthProviders(auth: RuntimeAuthConfig): AuthProvider[] {
  const providers: AuthProvider[] = [];

  if (auth.providers.password.enabled) {
    providers.push('password');
  }
  if (auth.providers.google.enabled) {
    providers.push('google');
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

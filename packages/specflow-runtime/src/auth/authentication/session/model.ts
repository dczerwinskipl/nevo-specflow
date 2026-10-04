import type { RuntimeAuthConfig } from '../config/model';
import type {
  AuthLoginMethods,
  AuthSessionMethod,
  AuthSessionResponse,
  AuthUser as AuthUserContract,
} from '@nevo/specflow-contracts/authentication';

export type AuthUser = AuthUserContract;
export type AuthSession = AuthSessionResponse;

export function configuredLoginMethods(auth: RuntimeAuthConfig): AuthLoginMethods {
  return {
    password: { enabled: auth.providers.password.enabled },
    oidc: Object.entries(auth.providers.oidc.instances).flatMap(([id, provider]) =>
      provider.enabled ? [{ id, name: provider.name }] : [],
    ),
  };
}

export function unauthenticatedSession(auth: RuntimeAuthConfig): AuthSession {
  const user = auth.localUserId ? configuredUser(auth, auth.localUserId) : undefined;

  return {
    authenticationRequired: auth.mode === 'required',
    authenticated: false,
    ...(user ? { user } : {}),
    loginMethods: configuredLoginMethods(auth),
  };
}

export function authenticatedSession(
  auth: RuntimeAuthConfig,
  userId: string,
  authenticatedWith: AuthSessionMethod,
  userName?: string,
): AuthSession {
  return {
    authenticationRequired: auth.mode === 'required',
    authenticated: true,
    user: configuredUser(auth, userId, userName),
    authenticatedWith,
    loginMethods: configuredLoginMethods(auth),
  };
}

export function configuredUser(
  auth: RuntimeAuthConfig,
  userId: string,
  userName?: string,
): AuthUser {
  const user = Object.hasOwn(auth.users, userId) ? auth.users[userId] : undefined;
  if (!user) {
    throw new Error(`Configured auth user '${userId}' does not exist.`);
  }

  return { id: userId, name: userName?.trim() || user.name };
}

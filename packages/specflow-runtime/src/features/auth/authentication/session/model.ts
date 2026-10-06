import type {
  AuthLoginMethods,
  AuthSessionMethod,
  AuthSessionResponse,
  AuthUser as AuthUserContract,
} from '@nevo/specflow-contracts/authentication';

import type { RuntimeAuthenticationConfig } from '../configuration/model';

export type AuthUser = AuthUserContract;
export type AuthSession = AuthSessionResponse;

export function configuredLoginMethods(
  authentication: RuntimeAuthenticationConfig,
): AuthLoginMethods {
  return {
    password: { enabled: authentication.providers.password.enabled },
    oidc: Object.entries(authentication.providers.oidc.instances).flatMap(([id, provider]) =>
      provider.enabled ? [{ id, name: provider.name }] : [],
    ),
  };
}

export function unauthenticatedSession(authentication: RuntimeAuthenticationConfig): AuthSession {
  const user = authentication.localUserId
    ? configuredUser(authentication, authentication.localUserId)
    : undefined;

  return {
    authenticationRequired: authentication.mode === 'required',
    authenticated: false,
    ...(user ? { user } : {}),
    loginMethods: configuredLoginMethods(authentication),
  };
}

export function authenticatedSession(
  authentication: RuntimeAuthenticationConfig,
  userId: string,
  authenticatedWith: AuthSessionMethod,
  userName?: string,
): AuthSession {
  return {
    authenticationRequired: authentication.mode === 'required',
    authenticated: true,
    user: configuredUser(authentication, userId, userName),
    authenticatedWith,
    loginMethods: configuredLoginMethods(authentication),
  };
}

export function configuredUser(
  authentication: RuntimeAuthenticationConfig,
  userId: string,
  userName?: string,
): AuthUser {
  const user = Object.hasOwn(authentication.users, userId)
    ? authentication.users[userId]
    : undefined;
  if (!user) {
    throw new Error(`Configured auth user '${userId}' does not exist.`);
  }

  const sessionName = userName?.trim();
  return {
    id: userId,
    name: sessionName === undefined || sessionName === '' ? user.name : sessionName,
  };
}

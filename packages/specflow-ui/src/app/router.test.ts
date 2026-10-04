import type { AuthSessionResponse } from '@nevo/specflow-contracts/authentication';
import { describe, expect, it } from 'vitest';

import type { AuthApi } from '../auth/api';
import { createAuthStore } from '../auth/store';
import { resolveAppAccess, resolveLoginAccess } from './router';

const noAuth: AuthSessionResponse = {
  authenticationRequired: false,
  authenticated: false,
  user: { id: 'local-user', name: 'Local User' },
  loginMethods: { password: { enabled: false }, oidc: [] },
};

const loginRequired: AuthSessionResponse = {
  authenticationRequired: true,
  authenticated: false,
  loginMethods: { password: { enabled: true }, oidc: [] },
};

const authenticated: AuthSessionResponse = {
  authenticationRequired: true,
  authenticated: true,
  user: { id: 'demo', name: 'Demo' },
  authenticatedWith: { kind: 'password' },
  loginMethods: { password: { enabled: true }, oidc: [] },
};

describe('SpecFlow router access policy', () => {
  it('allows trusted local mode into app routes without a login screen', async () => {
    await expect(resolveAppAccess(storeWith(noAuth), '/ui-playground')).resolves.toEqual({
      kind: 'allow',
    });
  });

  it('redirects required unauthenticated app access to login and preserves a safe returnTo', async () => {
    await expect(resolveAppAccess(storeWith(loginRequired), '/ui-playground')).resolves.toEqual({
      kind: 'login',
      returnTo: '/ui-playground',
    });

    await expect(resolveAppAccess(storeWith(loginRequired), '//evil.example')).resolves.toEqual({
      kind: 'login',
      returnTo: '/',
    });
  });

  it('redirects an authenticated login route back into the application', async () => {
    await expect(resolveLoginAccess(storeWith(authenticated), '/ui-playground')).resolves.toEqual({
      kind: 'app',
      returnTo: '/ui-playground',
    });
  });

  it('redirects local-mode login visits back into the application', async () => {
    await expect(resolveLoginAccess(storeWith(noAuth), undefined)).resolves.toEqual({
      kind: 'app',
      returnTo: '/',
    });
  });

  it('keeps required unauthenticated users on the login route', async () => {
    await expect(resolveLoginAccess(storeWith(loginRequired), '/')).resolves.toEqual({
      kind: 'allow',
    });
  });

  it('routes Runtime bootstrap failure to a standalone recovery state', async () => {
    const auth = createAuthStore(
      fakeApi({ getSession: () => Promise.reject(new Error('runtime down')) }),
    );

    await expect(resolveAppAccess(auth, '/ui-playground')).resolves.toEqual({
      kind: 'runtime-unavailable',
      returnTo: '/ui-playground',
    });
    await expect(resolveLoginAccess(auth, '/ui-playground')).resolves.toEqual({
      kind: 'runtime-unavailable',
      returnTo: '/ui-playground',
    });
  });
});

function storeWith(session: AuthSessionResponse) {
  return createAuthStore(fakeApi(), session);
}

function fakeApi(overrides: Partial<AuthApi> = {}): AuthApi {
  return {
    getSession: () => Promise.resolve(noAuth),
    loginWithPassword: () => Promise.reject(new Error('not configured')),
    startOidc: () => Promise.reject(new Error('not configured')),
    logout: () => Promise.resolve(),
    ...overrides,
  };
}

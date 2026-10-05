import type { AuthSessionResponse } from '@nevo/specflow-contracts/authentication';
import { describe, expect, it } from 'vitest';

import type { AuthApi } from './api';
import { createAuthStore } from './store';

const anonymous: AuthSessionResponse = {
  authenticationRequired: true,
  authenticated: false,
  loginMethods: {
    password: { enabled: true },
    oidc: [{ id: 'company', name: 'Company SSO' }],
  },
};

describe('AuthStore', () => {
  it('coalesces bootstrap requests and publishes the loaded session', async () => {
    let calls = 0;
    const api = fakeApi({
      getSession: () => {
        calls += 1;
        return Promise.resolve(anonymous);
      },
    });
    const store = createAuthStore(api);

    const [first, second] = await Promise.all([store.ensureSession(), store.ensureSession()]);

    expect(calls).toBe(1);
    expect(first).toEqual(anonymous);
    expect(second).toEqual(anonymous);
    expect(store.getState()).toEqual({ status: 'ready', session: anonymous });
  });

  it('updates the shared session after password login', async () => {
    const authenticated: AuthSessionResponse = {
      authenticationRequired: true,
      authenticated: true,
      user: { id: 'demo', name: 'Demo' },
      authenticatedWith: { kind: 'password' },
      loginMethods: anonymous.loginMethods,
    };
    const store = createAuthStore(
      fakeApi({ loginWithPassword: () => Promise.resolve(authenticated) }),
      anonymous,
    );

    await store.loginWithPassword('demo', 'secret');

    expect(store.getState()).toEqual({ status: 'ready', session: authenticated });
  });

  it('refreshes the shared session after Runtime logout succeeds', async () => {
    const calls: string[] = [];
    const authenticated: AuthSessionResponse = {
      authenticationRequired: true,
      authenticated: true,
      user: { id: 'demo', name: 'Demo' },
      authenticatedWith: { kind: 'password' },
      loginMethods: anonymous.loginMethods,
    };
    const store = createAuthStore(
      fakeApi({
        logout: () => {
          calls.push('logout');
          return Promise.resolve();
        },
        getSession: () => {
          calls.push('getSession');
          return Promise.resolve(anonymous);
        },
      }),
      authenticated,
    );

    await store.logout();

    expect(calls).toEqual(['logout', 'getSession']);
    expect(store.getState()).toEqual({ status: 'ready', session: anonymous });
  });

  it('surfaces a failed post-logout session refresh as an auth-store error', async () => {
    const runtimeError = new Error('runtime unavailable');
    const store = createAuthStore(
      fakeApi({
        getSession: () => Promise.reject(runtimeError),
        logout: () => Promise.resolve(),
      }),
      {
        authenticationRequired: true,
        authenticated: true,
        user: { id: 'demo', name: 'Demo' },
        authenticatedWith: { kind: 'password' },
        loginMethods: anonymous.loginMethods,
      },
    );

    await expect(store.logout()).rejects.toBe(runtimeError);
    expect(store.getState()).toEqual({ status: 'error', error: runtimeError });
  });
});

function fakeApi(overrides: Partial<AuthApi>): AuthApi {
  return {
    getSession: () => Promise.resolve(anonymous),
    loginWithPassword: () => Promise.reject(new Error('not configured')),
    startOidc: () => Promise.reject(new Error('not configured')),
    logout: () => Promise.resolve(),
    ...overrides,
  };
}

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

import type { AuthSessionResponse } from '@nevo/specflow-contracts/authentication';
import { createMemoryHistory } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';

import type { AuthApi } from '../auth/api';
import { createAuthStore } from '../auth/store';
import { createSpecFlowRouter } from './router';

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

describe('SpecFlow router', () => {
  it('allows trusted local mode into app routes without a login screen', async () => {
    const router = await loadedRouter(createAuthStore(fakeApi(), noAuth));

    await router.navigate({ to: '/ui-playground' });

    expect(router.state.location.pathname).toBe('/ui-playground');
  });

  it('redirects protected app routes to standalone login and preserves returnTo', async () => {
    const router = await loadedRouter(createAuthStore(fakeApi(), loginRequired));

    await router.navigate({ to: '/ui-playground' });

    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toMatchObject({ returnTo: '/ui-playground' });
  });

  it('redirects an authenticated login route back into the application', async () => {
    const router = await loadedRouter(createAuthStore(fakeApi(), authenticated));

    await router.navigate({
      to: '/login',
      search: { returnTo: '/ui-playground' },
    });

    expect(router.state.location.pathname).toBe('/ui-playground');
  });

  it('routes Runtime bootstrap failure to a standalone recovery screen', async () => {
    const api = fakeApi({
      getSession: () => Promise.reject(new Error('runtime down')),
    });
    const router = await loadedRouter(createAuthStore(api));

    await router.navigate({ to: '/ui-playground' });

    expect(router.state.location.pathname).toBe('/runtime-unavailable');
  });
});

async function loadedRouter(auth: ReturnType<typeof createAuthStore>) {
  const router = createSpecFlowRouter(
    createMemoryHistory({ initialEntries: ['/runtime-unavailable'] }),
    auth,
  );
  await router.load();
  return router;
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

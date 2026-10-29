import { createMemoryHistory } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import type { AuthSessionResponse } from '@nevo/specflow-contracts/authentication';
import { createSpecFlowRouter } from '../../../app/router';
import type { AuthApi } from '../../../auth/api';
import { createAuthStore } from '../../../auth/store';
import { createSpecFlowAppServices } from '../../../services';

const local: AuthSessionResponse = {
  authenticationRequired: false,
  authenticated: false,
  user: { id: 'local', name: 'Local' },
  loginMethods: { password: { enabled: false }, oidc: [] },
};
const api: AuthApi = {
  getSession: () => Promise.resolve(local),
  loginWithPassword: () => Promise.reject(new Error('unused')),
  startOidc: () => Promise.reject(new Error('unused')),
  logout: () => Promise.resolve(),
};

async function searchOf(url: string) {
  const router = createSpecFlowRouter(
    createMemoryHistory({ initialEntries: [url] }),
    createSpecFlowAppServices({ authStore: createAuthStore(api, local) }),
  );
  await router.load();
  const matches: { routeId: string; search: unknown }[] = router.matchRoutes(router.latestLocation);

  return matches.find((match) => match.routeId.endsWith('/specs/new'))?.search as
    Record<string, unknown> | undefined;
}

describe('Create route search', () => {
  it('a plain entry carries no draft: the form opens empty', async () => {
    expect(await searchOf('/specs/new')).not.toHaveProperty('draft');
  });

  it('only the explicit Back to form carries the operation whose draft is restored', async () => {
    expect(await searchOf('/specs/new?draft=op-1')).toMatchObject({ draft: 'op-1' });
  });
});

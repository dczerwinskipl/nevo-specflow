import { documentContentFixture } from '../../../test-support/documents/fixtures';
import { createMemoryHistory } from '@tanstack/react-router';
import { describe, expect, it } from 'vitest';
import { createAuthStore } from '../../auth/store';
import type { AuthApi } from '../../auth/api';
import { createSpecFlowAppServices } from '../../services';
import { createSpecFlowRouter } from '../../app/router';
import type { AuthSessionResponse } from '@nevo/specflow-contracts/authentication';

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

describe('canonical Documents routes', () => {
  it('direct Document Detail resolves without fetching the aggregate Workspace', async () => {
    let aggregateReads = 0;
    const router = createSpecFlowRouter(
      createMemoryHistory({
        initialEntries: ['/specs/example/documents/notes?collection=archive'],
      }),
      createSpecFlowAppServices({
        authStore: createAuthStore(api, local),
        specificationApi: {
          getSpecificationWorkspace: () => {
            aggregateReads += 1;

            return Promise.reject(new Error('Workspace offline'));
          },
        },
        documentApi: {
          getDocument: () =>
            Promise.resolve(
              documentContentFixture({
                id: 'notes',
                title: 'Notes',
                content: '# Works',
                revision: '1',
              }),
            ),
        },
      }),
    );
    await router.load();
    expect(router.history.location.pathname).toBe('/specs/example/documents/notes');
    expect(aggregateReads).toBe(0); // routing must not preload Workspace
    const detail = router.state.matches.find((match) =>
      match.routeId.endsWith('/documents/$documentId'),
    );
    expect(detail?.params).toMatchObject({ specId: 'example', documentId: 'notes' });
  });

  it('memory history preserves canonical List and Document Detail entries', () => {
    const history = createMemoryHistory({ initialEntries: ['/specs/a'] });
    history.push('/specs/a/documents?collection=current');
    expect(history.location.pathname).toBe('/specs/a/documents');
    history.push('/specs/a/documents/notes?collection=current');
    expect(history.location.pathname).toBe('/specs/a/documents/notes');
    history.back();
    expect(history.location.pathname).toBe('/specs/a/documents');
  });

  it('serves the list and a document from one layout route', async () => {
    const services = createSpecFlowAppServices({ authStore: createAuthStore(api, local) });
    const layoutOf = async (url: string) => {
      const router = createSpecFlowRouter(createMemoryHistory({ initialEntries: [url] }), services);
      await router.load();
      expect(router.history.location.pathname).toBe(url.split('?')[0]);

      return router.state.matches.find((match) => match.routeId.endsWith('/documents-layout'))
        ?.routeId;
    };

    const list = await layoutOf('/specs/example/documents?collection=archive');
    const detail = await layoutOf('/specs/example/documents/notes?collection=archive');
    expect(list).toBeDefined();
    expect(detail).toBe(list);
  });
});

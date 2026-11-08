// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { defineSecondaryStack, useSecondaryNavigation } from '@nevo/ui';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import type { AuthSessionResponse } from '@nevo/specflow-contracts/authentication';
import type { SessionAssociationRead } from '@nevo/specflow-contracts/sessions';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpecFlowRouter } from '../../../app/router';
import { createAuthStore } from '../../../auth/store';
import { createSpecFlowAppServices } from '../../../services';
import { NotificationProvider } from '../../../shared/notifications/notifications';
import { ManagedSessionRouteView } from './routes';

/** Session `B` is associated with the archived Specification `spec-s`; every other is standalone. */
const association = (sessionId: string): SessionAssociationRead =>
  sessionId === 'B'
    ? {
        sessionId,
        association: {
          kind: 'specification',
          specification: {
            state: 'available',
            value: { specId: 'spec-s', title: 'Auth', collection: 'archived' },
          },
          tasks: [],
        },
      }
    : { sessionId, association: { kind: 'standalone' } };
vi.mock('../../../app/useAppServices', () => ({
  useAppServices: () => ({ managedSessionsApi: {} }),
}));
const sessionAssociationsApi = {
  association: (sessionId: string) => Promise.resolve(association(sessionId)),
  list: () => Promise.resolve({ items: [] }),
  createInSpecification: () => Promise.reject(new Error('unused')),
};
// The application shell is not what these tests are about: only its Outlet.
vi.mock('../../../app/SpecFlowShell', () => ({
  SpecFlowShell: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('./useAuthOwner', () => ({ useAuthOwner: () => 'owner-1' }));
vi.mock('./useSessionContextNavigation', () => ({
  useSessionContextNavigation: () => ({ onOpenSpecification: vi.fn(), onOpenDocuments: vi.fn() }),
}));

const workStack = defineSecondaryStack<{ turnId: string }, string, { page: { turnId: string } }>({
  id: 'work',
  initial: 'page',
  instanceId: (params) => params.turnId,
  useData: (params) => ({ status: 'ready', data: params.turnId }),
  screens: { page: { title: 'Work', component: () => <p>Work</p> } },
});

// Stands in for the Session screen: opens a runtime tab and shows which tabs the provider holds.
vi.mock('./ManagedSession', () => ({
  ManagedSession: ({
    sessionId,
    onSessionDeleted,
  }: {
    sessionId: string;
    onSessionDeleted?: () => void;
  }) => {
    const navigation = useSecondaryNavigation();

    return (
      <>
        <button
          type="button"
          onClick={() => void navigation.openTab(workStack, { turnId: `${sessionId}-turn` })}
        >
          open work
        </button>
        <button type="button" onClick={onSessionDeleted}>
          deleted
        </button>
        <output data-testid="tabs">{navigation.tabs.tabs.map((tab) => tab.id).join(',')}</output>
      </>
    );
  },
}));
vi.mock('../../../app/ui-modules/UiModulesProvider', () => ({
  useUiModules: () => ({ get: () => [] }),
}));
// The Specifications list's own heading, the focus target after a delete that lands there.
vi.mock('../../specs/overview/SpecsOverview', () => ({
  SpecsOverview: () => (
    <h1 tabIndex={-1} data-workspace-header-title="true">
      Specyfikacje
    </h1>
  ),
}));

afterEach(cleanup);

function QueryWrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <NotificationProvider>{children}</NotificationProvider>
    </QueryClientProvider>
  );
}

describe('ManagedSessionRouteView', () => {
  it("does not carry one Session's open tabs into the next one while the route stays mounted", async () => {
    // The router keeps the route component mounted from /sessions/A to /sessions/B: a rerender.
    const { rerender } = render(<ManagedSessionRouteView sessionId="A" />, {
      wrapper: QueryWrapper,
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'open work' }));
      await Promise.resolve();
    });
    expect(screen.getByTestId('tabs').textContent).not.toBe('');

    rerender(<ManagedSessionRouteView sessionId="B" />);

    expect(screen.getByTestId('tabs').textContent).toBe('');
  });
});

const local: AuthSessionResponse = {
  authenticationRequired: false,
  authenticated: false,
  user: { id: 'local', name: 'Local' },
  loginMethods: { password: { enabled: false }, oidc: [] },
};

async function loadedLocation(url: string) {
  const router = createSpecFlowRouter(
    createMemoryHistory({ initialEntries: [url] }),
    createSpecFlowAppServices({
      authStore: createAuthStore(
        {
          getSession: () => Promise.resolve(local),
          loginWithPassword: () => Promise.reject(new Error('unused')),
          startOidc: () => Promise.reject(new Error('unused')),
          logout: () => Promise.resolve(),
        },
        local,
      ),
    }),
  );
  await router.load();

  // The search the matched route validated (not the raw URL's).
  const match = router.state.matches.find((item) => item.routeId.endsWith('/sessions/$sessionId'));

  return { pathname: router.state.location.pathname, search: match?.search };
}

describe('Session route collection', () => {
  it.each(['current', 'archive'] as const)(
    'keeps the %s collection of the Specification the Session was opened from',
    async (collection) => {
      const location = await loadedLocation(`/sessions/s1?collection=${collection}`);

      expect(location.pathname).toBe('/sessions/s1');
      expect(location.search).toEqual({ collection });
    },
  );

  it('reads an unknown collection as current', async () => {
    expect((await loadedLocation('/sessions/s1?collection=nonsense')).search).toEqual({
      collection: 'current',
    });
  });

  it('forwards the collection when an old nested Session link is redirected', async () => {
    const location = await loadedLocation('/specs/spec-a/sessions/s1?collection=archive');

    expect(location.pathname).toBe('/sessions/s1');
    expect(location.search).toEqual({ collection: 'archive' });
  });
});

describe('Session route history', () => {
  function routerAt(url: string) {
    return createSpecFlowRouter(
      createMemoryHistory({ initialEntries: [url] }),
      createSpecFlowAppServices({
        sessionAssociationsApi,
        authStore: createAuthStore(
          {
            getSession: () => Promise.resolve(local),
            loginWithPassword: () => Promise.reject(new Error('unused')),
            startOidc: () => Promise.reject(new Error('unused')),
            logout: () => Promise.resolve(),
          },
          local,
        ),
      }),
    );
  }

  const settle = () =>
    act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

  const renderRouter = (router: ReturnType<typeof routerAt>) =>
    render(<RouterProvider router={router} />, {
      wrapper: ({ children }) => (
        <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
      ),
    });

  it('redirects the retired standalone start to the Specifications list', async () => {
    const router = routerAt('/sessions/new');
    await router.load();

    expect(router.state.location.pathname).toBe('/');
  });

  it('Back from Session B lands on Session A without a Secondary tab left over from B', async () => {
    const router = routerAt('/sessions/A');
    renderRouter(router);
    await settle();
    expect(router.state.location.pathname).toBe('/sessions/A');

    await act(async () => {
      await router.navigate({
        to: '/sessions/$sessionId',
        params: { sessionId: 'B' },
        search: { collection: 'current' },
      });
    });
    await settle();
    expect(router.state.location.pathname).toBe('/sessions/B');
    fireEvent.click(screen.getByRole('button', { name: 'open work' }));
    await settle();
    expect(screen.getByTestId('tabs').textContent).toBe('work:B-turn');

    // Back steps out of B's open tab first, then leaves B for A.
    for (let step = 0; step < 3 && router.state.location.pathname !== '/sessions/A'; step += 1) {
      await act(async () => {
        router.history.back();
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }

    expect(router.state.location.pathname).toBe('/sessions/A');
    expect(screen.getByTestId('tabs').textContent).toBe('');
  });

  it('replaces a deleted standalone Session with the Specifications list, says so and focuses its heading', async () => {
    const router = routerAt('/sessions/B');
    await act(async () => {
      await router.navigate({
        to: '/sessions/$sessionId',
        params: { sessionId: 'A' },
        search: { collection: 'current' },
      });
    });
    renderRouter(router);
    await settle();
    expect(router.state.location.pathname).toBe('/sessions/A');

    fireEvent.click(screen.getByRole('button', { name: 'deleted' }));
    await settle();
    await settle();

    expect(router.state.location.pathname).toBe('/');
    expect(
      await screen.findByText(/^(The session was deleted\.|Sesja została usunięta\.)$/),
    ).toBeTruthy();
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { name: 'Specyfikacje' })),
    );
    // Back does not reopen the deleted Session.
    await act(async () => {
      router.history.back();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(router.state.location.pathname).toBe('/sessions/B');
  });

  it("replaces a deleted Session of a Specification with that Specification's Sessions list", async () => {
    const router = routerAt('/sessions/B');
    renderRouter(router);
    await settle();
    // The association is read before the delete: its Specification is the destination.
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'deleted' })).toBeTruthy());
    await settle();

    fireEvent.click(screen.getByRole('button', { name: 'deleted' }));
    await settle();

    expect(router.state.location.pathname).toBe('/specs/spec-s/sessions');
    // The Specification is archived: its list opens under the archive collection.
    expect(router.state.location.search).toMatchObject({ collection: 'archive' });
  });
});

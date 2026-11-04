// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { defineSecondaryStack, useSecondaryNavigation } from '@nevo/ui';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import type { AuthSessionResponse } from '@nevo/specflow-contracts/authentication';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpecFlowRouter } from '../../../app/router';
import { createAuthStore } from '../../../auth/store';
import { createSpecFlowAppServices } from '../../../services';
import { ManagedSessionRouteView } from './routes';

vi.mock('../../../app/useAppServices', () => ({
  useAppServices: () => ({ managedSessionsApi: {} }),
}));
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
  ManagedSession: ({ sessionId }: { sessionId: string }) => {
    const navigation = useSecondaryNavigation();

    return (
      <>
        <button
          type="button"
          onClick={() => void navigation.openTab(workStack, { turnId: `${sessionId}-turn` })}
        >
          open work
        </button>
        <output data-testid="tabs">{navigation.tabs.tabs.map((tab) => tab.id).join(',')}</output>
      </>
    );
  },
}));

afterEach(cleanup);

describe('ManagedSessionRouteView', () => {
  it("does not carry one Session's open tabs into the next one while the route stays mounted", async () => {
    // The router keeps the route component mounted from /sessions/A to /sessions/B: a rerender.
    const { rerender } = render(<ManagedSessionRouteView sessionId="A" />);
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

  it('Back from Session B lands on Session A without a Secondary tab left over from B', async () => {
    const router = routerAt('/sessions/A');
    render(<RouterProvider router={router} />);
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
});

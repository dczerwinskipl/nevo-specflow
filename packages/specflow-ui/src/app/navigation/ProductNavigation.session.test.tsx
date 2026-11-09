// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryHistory } from '@tanstack/react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuthSessionResponse } from '@nevo/specflow-contracts/authentication';
import type { SessionAssociationRead } from '@nevo/specflow-contracts/sessions';
import { createWorkspaceIntegrationApi } from '../../../test-support/specs/workspace/api';
import { createAuthStore } from '../../auth/store';
import { createSpecFlowAppServices } from '../../services';
import { createSpecFlowRouter } from '../router';
import { installWorkspaceWidth } from '../../test-support/workspaceWidth.test-support';

// The Session screen is not what these tests are about: only the navigator beside it.
vi.mock('../../features/sessions/managed/ManagedSession', () => ({
  ManagedSession: ({ sessionId }: { sessionId: string }) => <p>Session {sessionId}</p>,
}));

beforeEach(() => {
  // The wide shell: the navigator is the persistent side navigation.
  installWorkspaceWidth(1400);
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: false,
    media: query,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: () => false,
    onchange: null,
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const local: AuthSessionResponse = {
  authenticationRequired: false,
  authenticated: false,
  user: { id: 'local', name: 'Local' },
  loginMethods: { password: { enabled: false }, oidc: [] },
};

/** `assoc` is associated with the fixture Specification, `restricted` with one the user may not
 * view, `solo` is standalone and `pending` is never answered. */
function association(sessionId: string): Promise<SessionAssociationRead> {
  const specification = (
    fact: Extract<
      SessionAssociationRead['association'],
      { kind: 'specification' }
    >['specification'],
  ): SessionAssociationRead => ({
    sessionId,
    association: { kind: 'specification', specification: fact, tasks: [] },
  });
  switch (sessionId) {
    case 'assoc':
      return Promise.resolve(
        specification({
          state: 'available',
          value: { specId: 'api-integration', title: 'API integration', collection: 'current' },
        }),
      );
    case 'restricted':
      return Promise.resolve(specification({ state: 'forbidden' }));
    case 'solo':
      return Promise.resolve({ sessionId, association: { kind: 'standalone' } });
    default:
      return new Promise(() => undefined);
  }
}

async function renderAt(url: string) {
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
      specificationApi: createWorkspaceIntegrationApi(),
      sessionAssociationsApi: {
        association,
        list: () => Promise.resolve({ items: [] }),
        createInSpecification: () => Promise.reject(new Error('unused')),
      },
    }),
  );
  render(
    <QueryClientProvider client={new QueryClient()}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** The navigator's Sessions row of a Specification section, when there is one. */
const sessionsRow = () =>
  screen.queryByRole('link', { name: /^(Sesje|Sessions)/ })?.closest('[data-navigation-state]');

describe('navigator on a Session route', () => {
  it("shows the associated Specification's section with Sessions active", async () => {
    await renderAt('/sessions/assoc');
    await screen.findByText('Session assoc');

    await vi.waitFor(() =>
      expect(sessionsRow()?.getAttribute('data-navigation-state')).toBe('active'),
    );
    expect(screen.getByRole('link', { name: /^(Sesje|Sessions)/ }).getAttribute('href')).toContain(
      '/specs/api-integration/sessions',
    );
  });

  it.each([
    ['a standalone Session', 'solo'],
    ['a Specification the user may not view', 'restricted'],
    ['an association still loading', 'pending'],
  ])('shows no Specification section for %s', async (_case, sessionId) => {
    await renderAt(`/sessions/${sessionId}`);
    await screen.findByText(`Session ${sessionId}`);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 20));
    });

    // The navigator itself is there; only the Specification section is not.
    expect(screen.getAllByRole('navigation').length).toBeGreaterThan(0);
    expect(sessionsRow()).toBeFalsy();
  });
});

// @vitest-environment jsdom
import { act, cleanup, render, waitFor } from '@testing-library/react';
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from '@tanstack/react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { SessionStateProvider, useSessionReturn } from '../SessionStateProvider';
import { useSessionContextNavigation } from './useSessionContextNavigation';

afterEach(cleanup);

type Navigation = ReturnType<typeof useSessionContextNavigation>;

function mount(initial: string) {
  const captured: { navigation?: Navigation; returnTo?: string } = {};

  function Probe() {
    captured.navigation = useSessionContextNavigation('session-1');
    captured.returnTo = useSessionReturn('spec-a');

    return null;
  }

  const rootRoute = createRootRoute({
    component: () => (
      <SessionStateProvider>
        <Probe />
      </SessionStateProvider>
    ),
  });
  const routes = ['/sessions/$sessionId', '/specs/$specId', '/specs/$specId/documents'].map(
    (path) => createRoute({ getParentRoute: () => rootRoute, path }),
  );
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [initial] }),
  });
  render(<RouterProvider router={router} />);

  return { captured, router };
}

describe('useSessionContextNavigation', () => {
  it('opens the Specification Documents and remembers this Session as the way back', async () => {
    const { captured, router } = mount('/sessions/session-1?collection=archive');
    await act(async () => {
      await router.load();
    });

    expect(captured.returnTo).toBeUndefined();

    act(() => {
      captured.navigation!.onOpenDocuments({ id: 'spec-a' });
    });

    await waitFor(() => expect(router.state.location.pathname).toBe('/specs/spec-a/documents'));
    expect(router.state.location.search).toEqual({ collection: 'archive' });
    // What the Documents screen's "Back to the Session" link reads.
    expect(captured.returnTo).toBe('session-1');
  });

  it('opens the Specification overview without remembering a return', async () => {
    const { captured, router } = mount('/sessions/session-1');
    await act(async () => {
      await router.load();
    });

    act(() => {
      captured.navigation!.onOpenSpecification({ id: 'spec-a' });
    });

    await waitFor(() => expect(router.state.location.pathname).toBe('/specs/spec-a'));
    expect(captured.returnTo).toBeUndefined();
  });
});

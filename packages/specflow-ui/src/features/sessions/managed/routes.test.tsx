// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { defineSecondaryStack, useSecondaryNavigation } from '@nevo/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ManagedSessionRouteView } from './routes';

vi.mock('../../../app/useAppServices', () => ({
  useAppServices: () => ({ managedSessionsApi: {} }),
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

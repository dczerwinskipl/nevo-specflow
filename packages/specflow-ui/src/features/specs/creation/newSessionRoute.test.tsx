// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { defineSecondaryStack, useSecondaryNavigation } from '@nevo/ui';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NewSessionRouteView } from './routes';

const contextStack = defineSecondaryStack<{ specId: string }, string, { page: { specId: string } }>(
  {
    id: 'context',
    initial: 'page',
    instanceId: (params) => params.specId,
    useData: (params) => ({ status: 'ready', data: params.specId }),
    screens: { page: { title: 'Context', component: () => <p>Context</p> } },
  },
);

// Stands in for the start screen: opens a Context tab and shows which tabs the provider holds.
vi.mock('./new-session/NewSessionScreen', () => ({
  NewSessionScreen: ({ specId }: { specId: string }) => {
    const navigation = useSecondaryNavigation();

    return (
      <>
        <button type="button" onClick={() => void navigation.openTab(contextStack, { specId })}>
          open context
        </button>
        <output data-testid="tabs">{navigation.tabs.tabs.map((tab) => tab.id).join(',')}</output>
      </>
    );
  },
}));

afterEach(cleanup);

const callbacks = { onBack: vi.fn(), onOpenSession: vi.fn(), onOpenSpecification: vi.fn() };

describe('NewSessionRouteView', () => {
  it("does not carry one Specification's open Context into another's New session", async () => {
    // The router keeps the route component mounted from spec A to spec B: a rerender.
    const { rerender } = render(<NewSessionRouteView specId="A" {...callbacks} />);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'open context' }));
      await Promise.resolve();
    });
    expect(screen.getByTestId('tabs').textContent).not.toBe('');

    rerender(<NewSessionRouteView specId="B" {...callbacks} />);

    expect(screen.getByTestId('tabs').textContent).toBe('');
  });
});

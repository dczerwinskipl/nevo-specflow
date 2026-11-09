// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider, useSecondaryNavigation } from '@nevo/ui';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import { LocalizationProvider, createSpecFlowI18n } from '../../../../i18n';
import { installWorkspaceWidth } from '../../../../test-support/workspaceWidth.test-support';
import type { ManagedSessionsApi } from '../../managed/api';
import type { SessionAssociationsApi } from '../../associations/api';
import { forgetStartedSessions } from '../handoff/startedSession';
import { useManagedStartSource } from '../source/useManagedStartSource';
import { SessionStartScreen } from './SessionStartScreen';

beforeEach(() => {
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
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
  sessionStorage.clear();
  forgetStartedSessions();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const provider: ProviderDescriptor = {
  providerId: 'claude',
  title: 'Claude Code',
  readiness: 'ready',
  models: [],
  modes: ['read-only'],
  capabilities: {
    questions: true,
    permissions: false,
    resume: true,
    cancel: true,
    modelOverride: true,
    effortOverride: true,
  },
};

function TabProbe() {
  const { tabs, isOpen } = useSecondaryNavigation();

  return (
    <output data-testid="tabs" data-visible={String(isOpen)} data-active={tabs.activeTabId ?? ''}>
      {tabs.tabs.map((tab) => tab.title).join('|')}
    </output>
  );
}

const associations = {} as SessionAssociationsApi;
const pinned = {
  specId: 'spec',
  fact: { status: 'ready', value: { id: 'spec', key: 'SPEC-1', title: 'Login' } },
} as const;

function Start({ api }: { api: ManagedSessionsApi }) {
  const source = useManagedStartSource('alice', api, associations, pinned);

  return <SessionStartScreen source={source} onOpenSession={vi.fn()} />;
}

function renderStart(providers: ManagedSessionsApi['providers'], initialWidth: number) {
  const width = installWorkspaceWidth(initialWidth);
  const api = { providers } as unknown as ManagedSessionsApi;
  render(
    <LocalizationProvider instance={createSpecFlowI18n('en')}>
      <QueryClientProvider
        client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
      >
        <AppShell navigation={<div>Navigation</div>}>
          <AppWorkspaceProvider>
            <TabProbe />
            <Start api={api} />
          </AppWorkspaceProvider>
        </AppShell>
      </QueryClientProvider>
    </LocalizationProvider>,
  );

  return width;
}

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

describe('F15 the narrow Context of a new Session follows the choice', () => {
  it('a Context opened while the catalogue loads shows the executor once it is read', async () => {
    let resolve!: (value: { items: ProviderDescriptor[] }) => void;
    renderStart(() => new Promise((done) => (resolve = done)), 600);
    fireEvent.click(await screen.findByRole('button', { name: 'Context' }));
    await settle();
    // The Context flow's Agent section: a skeleton while the catalogue is read.
    const agentSection = () => screen.getByRole('region', { name: 'Agent' });
    expect(agentSection().getAttribute('aria-busy')).toBe('true');

    resolve({ items: [provider] });
    await waitFor(() => expect(agentSection().getAttribute('aria-busy')).not.toBe('true'));

    expect(agentSection().textContent).toContain('Claude Code');
  });
});

describe('N3 the side-panel toggle of the New Session screen hides the whole panel', () => {
  it('with a placeholder tab active: one press hides it, the next shows it again', async () => {
    renderStart(() => Promise.resolve({ items: [provider] }), 1400);
    await settle();
    // Context lists the planned areas; opening one makes a runtime tab beside the pinned Context.
    fireEvent.click(screen.getByText('Files / Changes').closest('button')!);
    await settle();
    const placeholderTab = screen.getByTestId('tabs').dataset.active;
    expect(screen.getByTestId('tabs').textContent).toContain('Context|');
    expect(placeholderTab).not.toBe('$workspace-pinned$');

    const toggle = screen.getByRole('button', { name: 'Side panel' });
    fireEvent.click(toggle);
    await settle();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('tabs').dataset.visible).toBe('false');

    fireEvent.click(toggle);
    await settle();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('tabs').dataset.active).toBe(placeholderTab);
  });

  it('with Context active and a placeholder tab in the background it hides everything and brings Context back', async () => {
    renderStart(() => Promise.resolve({ items: [provider] }), 1400);
    await settle();
    fireEvent.click(screen.getByText('Files / Changes').closest('button')!);
    await settle();
    fireEvent.click(screen.getByRole('tab', { name: 'Context' }));
    await settle();
    expect(screen.getByTestId('tabs').dataset.active).toBe('$workspace-pinned$');

    const toggle = screen.getByRole('button', { name: 'Side panel' });
    fireEvent.click(toggle);
    await settle();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(screen.getByTestId('tabs').dataset.active).toBe('');

    fireEvent.click(toggle);
    await settle();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('tabs').dataset.active).toBe('$workspace-pinned$');
  });
});

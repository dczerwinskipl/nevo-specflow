// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import { HttpClientError } from '@nevo/http-client';
import type { DemoSessionInput } from '@nevo/specflow-contracts/demo';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpecFlowQueryClient } from '../../../../app/queryClient';
import { authSessionIdentity } from '../../../../auth/store';
import { VisitStateProvider } from '../../../../app/VisitStateProvider';
import { LocalizationProvider, createSpecFlowI18n } from '../../../../i18n';
import { createSpecFlowAppServices } from '../../../../services';
import { TestServicesRouterContext } from '../../../../../test-support/app/TestServicesRouterContext';
import { createWorkspaceIntegrationApi } from '../../../../../test-support/specs/workspace/api';
import {
  forgetStartedSessions,
  startedSessionOf,
} from '../../../sessions/start/handoff/startedSession';
import { catalogue } from '../options/creationCatalogue.stories-support';
import { NewSessionScreen } from './NewSessionScreen';

const open = vi.fn<(sessionId: string) => void>();
const allocations: DemoSessionInput[] = [];

function renderScreen(
  dataMode: 'project' | 'demo',
  allocate: (input: DemoSessionInput) => Promise<{ sessionId: string; location: never }>,
) {
  const defaults = createSpecFlowAppServices();
  const workspace = createWorkspaceIntegrationApi();
  const services = createSpecFlowAppServices({
    runtimeInfoApi: { getInfo: () => Promise.resolve({ dataMode }) },
    specificationApi: {
      getSpecificationWorkspace: async (specId, signal) => {
        const dto = await workspace.getSpecificationWorkspace(specId, signal);

        return { ...dto, specification: { ...dto.specification, title: 'Logowanie SSO' } };
      },
    },
    demoCreationApi: { ...defaults.demoCreationApi, catalogue: () => Promise.resolve(catalogue) },
    sessionsApi: {
      ...defaults.sessionsApi,
      allocate: (_specId, input) => {
        allocations.push(structuredClone(input));

        return allocate(input);
      },
    },
  });
  render(
    <QueryClientProvider client={createSpecFlowQueryClient()}>
      <TestServicesRouterContext services={services}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>
          <VisitStateProvider>
            <AppWorkspaceProvider>
              <AppShell navigation={<div>Nav</div>}>
                <NewSessionScreen
                  specId="spec-1"
                  onOpenSession={open}
                  onOpenSpecification={vi.fn()}
                  onBack={vi.fn()}
                />
              </AppShell>
            </AppWorkspaceProvider>
          </VisitStateProvider>
        </LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>,
  );
}

/** The signed-in identity the screen under test belongs to (the default test services). */
const owner = () => {
  const auth = createSpecFlowAppServices().authStore.getState();

  return auth.status === 'ready' ? authSessionIdentity(auth.session) : 'unavailable';
};

const ok = () => Promise.resolve({ sessionId: 'session-1', location: undefined as never });

beforeEach(() => {
  // The Radix Select the model and effort fields use measures and scrolls its options.
  Element.prototype.scrollIntoView = () => undefined;
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.releasePointerCapture = () => undefined;
  // jsdom lacks the layout observers the application shell subscribes to.
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe = vi.fn();
      unobserve = vi.fn();
      disconnect = vi.fn();
    },
  );
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
  open.mockClear();
  allocations.length = 0;
  forgetStartedSessions();
  vi.unstubAllGlobals();
});

async function chooseModel(name: string) {
  fireEvent.keyDown(await screen.findByRole('combobox', { name: 'Model' }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('option', { name }));
}

describe('NewSessionScreen', () => {
  it('explains that a session cannot be started on a project Runtime', async () => {
    renderScreen('project', ok);
    expect(await screen.findByText('Not available on this server')).toBeTruthy();
  });

  it('shows the Session shell at once, with its Composer unavailable before Start', async () => {
    renderScreen('demo', ok);
    expect(await screen.findByRole('heading', { level: 1, name: 'New session' })).toBeTruthy();
    expect(await screen.findByRole('heading', { level: 2, name: 'Start a session' })).toBeTruthy();
    expect(await screen.findByText('Choose a model.')).toBeTruthy();
  });

  it('allocates the Session with the chosen agent and opens it with what it was started with', async () => {
    renderScreen('demo', ok);
    await chooseModel('codex model A');
    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Effort' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: 'high' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Ask' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Start session' }));
    await waitFor(() => expect(open).toHaveBeenCalledWith('session-1'));
    expect(allocations).toEqual([
      expect.objectContaining({
        providerId: 'codex',
        modelId: 'model-a',
        effort: 'high',
        mode: 'ask',
      }),
    ]);
    expect(startedSessionOf(owner(), 'session-1')).toMatchObject({
      providerTitle: 'Codex',
      modelTitle: 'codex model A',
      effort: 'high',
      modeId: 'ask',
    });
    // The pinned Specification (read while the form was open) goes with it.
    expect(startedSessionOf(owner(), 'session-1')?.specification).toBeDefined();
  });

  it('allocates at the provider default effort without sending one', async () => {
    renderScreen('demo', ok);
    await chooseModel('codex model A');
    fireEvent.click(await screen.findByRole('button', { name: 'Start session' }));
    await waitFor(() => expect(open).toHaveBeenCalledOnce());
    expect(allocations[0]).not.toHaveProperty('effort');
  });

  it('checks an unknown outcome instead of repeating the start', async () => {
    renderScreen('demo', () => Promise.reject(new Error('Connection lost')));
    await chooseModel('codex model A');
    fireEvent.click(await screen.findByRole('button', { name: 'Start session' }));
    const check = await screen.findByRole('button', { name: 'Check the result' });
    expect(check.hasAttribute('disabled')).toBe(false);
    expect(screen.getByRole('combobox', { name: 'Model' }).hasAttribute('disabled')).toBe(true);
    expect(open).not.toHaveBeenCalled();
    expect(allocations).toHaveLength(1);
  });

  it('keeps the form and its choices, with an alert, when the Runtime refuses the allocation', async () => {
    renderScreen('demo', () =>
      Promise.reject(
        new HttpClientError('refused', {
          kind: 'http',
          status: 500,
          data: { error: 'demo_session_allocation_failed' },
        }),
      ),
    );
    await chooseModel('codex model A');
    fireEvent.click(await screen.findByRole('button', { name: 'Start session' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(open).not.toHaveBeenCalled();
    expect(
      screen.getByRole('combobox', { name: 'Model' }).textContent?.includes('codex model A'),
    ).toBe(true);
    expect(screen.getByRole('button', { name: 'Start session' }).hasAttribute('disabled')).toBe(
      false,
    );
  });
});

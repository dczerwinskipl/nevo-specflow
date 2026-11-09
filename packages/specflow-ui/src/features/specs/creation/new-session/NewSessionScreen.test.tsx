// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import { HttpClientError } from '@nevo/http-client';
import type { DemoSessionInput } from '@nevo/specflow-contracts/demo';
import type { CreateContextSession, ProviderDescriptor } from '@nevo/specflow-contracts/sessions';
import type { SpecificationWorkspaceResponse } from '@nevo/specflow-contracts/specs/workspace';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpecFlowQueryClient } from '../../../../app/queryClient';
import { authSessionIdentity, createAuthStore } from '../../../../auth/store';
import type { AuthSessionResponse } from '@nevo/specflow-contracts/authentication';
import { VisitStateProvider } from '../../../../app/VisitStateProvider';
import { LocalizationProvider, createSpecFlowI18n } from '../../../../i18n';
import { createSpecFlowAppServices } from '../../../../services';
import { TestServicesRouterContext } from '../../../../../test-support/app/TestServicesRouterContext';
import { createWorkspaceIntegrationApi } from '../../../../../test-support/specs/workspace/api';
import {
  forgetStartedSessions,
  startedSessionOf,
} from '../../../sessions/start/handoff/startedSession';
import { sessionAssociationKeys } from '../../../sessions/associations/queries';
import { specificationKeys } from '../../read-model';
import type { ManagedSessionsApi } from '../../../sessions';
import { catalogue } from '../options/creationCatalogue.stories-support';
import { NewSessionScreen } from './NewSessionScreen';

const open = vi.fn<(sessionId: string) => void>();
const back = vi.fn<() => void>();
const allocations: DemoSessionInput[] = [];
const creates: { specId: string; input: CreateContextSession }[] = [];
const allocationPaths: (string | undefined)[] = [];

const provider: ProviderDescriptor = {
  providerId: 'claude',
  title: 'Claude',
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

/** A signed-in local user: a start belongs to an identity, never to an unknown one. */
const local: AuthSessionResponse = {
  authenticationRequired: false,
  authenticated: false,
  user: { id: 'local', name: 'Local' },
  loginMethods: { password: { enabled: false }, oidc: [] },
};

function renderScreen(
  dataMode: 'project' | 'demo',
  allocate: (input: DemoSessionInput) => Promise<{ sessionId: string; location: never }>,
  startSession: SpecificationWorkspaceResponse['actions']['startSession'] = { available: true },
  collection: 'current' | 'archive' = 'current',
) {
  const defaults = createSpecFlowAppServices();
  const workspace = createWorkspaceIntegrationApi();
  const client = createSpecFlowQueryClient();
  const services = createSpecFlowAppServices({
    authStore: createAuthStore(
      {
        getSession: () => Promise.resolve(local),
        loginWithPassword: () => Promise.reject(new Error('unused')),
        startOidc: () => Promise.reject(new Error('unused')),
        logout: () => Promise.resolve(),
      },
      local,
    ),
    runtimeInfoApi: { getInfo: () => Promise.resolve({ dataMode }) },
    specificationApi: {
      getSpecificationWorkspace: async (specId, signal) => {
        const dto = await workspace.getSpecificationWorkspace(specId, signal);

        return {
          ...dto,
          specification: { ...dto.specification, title: 'Logowanie SSO' },
          actions: { ...dto.actions, startSession },
        };
      },
    },
    managedSessionsApi: {
      providers: () => Promise.resolve({ items: [provider] }),
    } as unknown as ManagedSessionsApi,
    sessionAssociationsApi: {
      ...defaults.sessionAssociationsApi,
      createInSpecification: (specId, input) => {
        creates.push({ specId, input: structuredClone(input) });

        return Promise.resolve({ sessionId: 'session-1', association: { specId, taskIds: [] } });
      },
    },
    demoCreationApi: { ...defaults.demoCreationApi, catalogue: () => Promise.resolve(catalogue) },
    sessionsApi: {
      ...defaults.sessionsApi,
      allocate: (_specId, input, path) => {
        allocations.push(structuredClone(input));
        allocationPaths.push(path);

        return allocate(input);
      },
    },
  });
  render(
    <QueryClientProvider client={client}>
      <TestServicesRouterContext services={services}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>
          <VisitStateProvider>
            <AppWorkspaceProvider>
              <AppShell navigation={<div>Nav</div>}>
                <NewSessionScreen
                  specId="api-integration"
                  collection={collection}
                  onOpenSession={open}
                  onOpenSpecification={vi.fn()}
                  onBackToSpecification={back}
                />
              </AppShell>
            </AppWorkspaceProvider>
          </VisitStateProvider>
        </LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>,
  );

  return client;
}

/** The signed-in identity the screen under test belongs to. */
const owner = () => authSessionIdentity(local);

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
  back.mockClear();
  allocations.length = 0;
  allocationPaths.length = 0;
  creates.length = 0;
  sessionStorage.clear();
  forgetStartedSessions();
  vi.unstubAllGlobals();
});

async function chooseModel(name: string) {
  fireEvent.keyDown(await screen.findByRole('combobox', { name: 'Model' }), { key: 'Enter' });
  fireEvent.click(await screen.findByRole('option', { name }));
}

describe('NewSessionScreen', () => {
  it('starts a project Session in the Specification with the composed create', async () => {
    const client = renderScreen('project', ok);
    // The pinned Specification comes with the workspace read.
    await waitFor(() =>
      expect(client.getQueryData(specificationKeys.detail('api-integration'))).toBeDefined(),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Start session' }));
    await waitFor(() => expect(open).toHaveBeenCalledWith('session-1'));
    expect(creates.map(({ specId }) => specId)).toEqual(['api-integration']);
    expect(creates[0]?.input).toMatchObject({ providerId: 'claude' });
    // The create's association seeds the Session's Context, so first paint and reload agree.
    expect(client.getQueryData(sessionAssociationKeys.read('session-1'))).toMatchObject({
      association: {
        kind: 'specification',
        specification: {
          state: 'available',
          value: { specId: 'api-integration', title: 'Logowanie SSO' },
        },
      },
    });
  });

  it.each([
    ['forbidden', 'You can’t start sessions in this specification.'],
    ['sessions_disabled', 'Sessions are turned off in this project.'],
  ])('replaces the start form when the workspace says %s', async (reason, text) => {
    renderScreen('project', ok, { available: false, reason });
    expect(await screen.findByText(text)).toBeTruthy();
    expect(screen.queryByRole('heading', { level: 2, name: 'Start a session' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Back to specification' }));
    expect(back).toHaveBeenCalledOnce();
  });

  it('keeps the start form without a usable provider (the form explains it)', async () => {
    renderScreen('project', ok, { available: false, reason: 'no_provider' });
    expect(await screen.findByRole('heading', { level: 2, name: 'Start a session' })).toBeTruthy();
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
  });

  it('seeds the association of an archived Specification with its archive collection', async () => {
    const client = renderScreen('demo', ok, { available: true }, 'archive');
    await chooseModel('codex model A');
    await waitFor(() =>
      expect(client.getQueryData(specificationKeys.detail('api-integration'))).toBeDefined(),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Start session' }));
    await waitFor(() => expect(open).toHaveBeenCalledOnce());
    expect(client.getQueryData(sessionAssociationKeys.read('session-1'))).toMatchObject({
      association: { specification: { value: { collection: 'archived' } } },
    });
  });

  it('allocates at the startSession path of the workspace', async () => {
    const client = renderScreen('demo', ok, {
      available: true,
      path: '/api/demo/specs/api-integration/sessions',
    });
    await chooseModel('codex model A');
    // The path arrives with the workspace read the pinned Specification comes from.
    await waitFor(() =>
      expect(client.getQueryData(specificationKeys.detail('api-integration'))).toBeDefined(),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Start session' }));
    await waitFor(() => expect(open).toHaveBeenCalledOnce());
    expect(allocationPaths).toEqual(['/api/demo/specs/api-integration/sessions']);
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

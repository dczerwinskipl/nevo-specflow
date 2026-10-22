// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import type { CreatedSpec } from '@nevo/specflow-contracts/specs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { VisitStateProvider } from '../../../app/VisitStateProvider';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import type { OperationsApi } from '../../../shared/operations/operationsApi';
import { createSessionOperationStorage } from './createOperationStorage';
import { initialWorkspaceChoice } from './workspace/workspaceChoice';
import { createOperationEventsUrl, type ProjectCreationApi } from './api.project';
import { CreateSpecificationScreen } from './CreateSpecificationScreen';
import { createOptionsFixture } from './creationOptions.stories-support';

const created: CreatedSpec = {
  operationId: '00000000-0000-4000-8000-000000000001',
  specId: '00000000-0000-4000-8000-0000000000aa',
  kind: 'specification-create',
  status: 'completed',
  slug: 'title',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  relativeManifestPath: 'specs/active/title/specification.yaml',
};

/** No live progress: the stream ends at once, as when a Runtime does not offer it. */
const silentOperations: OperationsApi = {
  // eslint-disable-next-line require-yield
  async *watchProgress() {
    await Promise.resolve();
  },
};

function renderScreen(
  dataMode: 'project' | 'demo',
  projectCreationApi: Partial<ProjectCreationApi>,
  props: { specId?: string } = {},
  client = createSpecFlowQueryClient(),
  operationsApi: OperationsApi = silentOperations,
) {
  const onProjectStarted = vi.fn();
  const services = createSpecFlowAppServices({
    runtimeInfoApi: { getInfo: () => Promise.resolve({ dataMode }) },
    projectCreationApi: {
      operationEventsUrl: createOperationEventsUrl,
      ...projectCreationApi,
    } as ProjectCreationApi,
    operationsApi,
  });
  render(
    <QueryClientProvider client={client}>
      <TestServicesRouterContext services={services}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>
          <VisitStateProvider>
            <AppWorkspaceProvider>
              <AppShell navigation={<div>Nav</div>}>
                <CreateSpecificationScreen
                  {...props}
                  onCreated={vi.fn()}
                  onProjectStarted={onProjectStarted}
                  onSession={vi.fn()}
                  onBack={vi.fn()}
                />
              </AppShell>
            </AppWorkspaceProvider>
          </VisitStateProvider>
        </LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>,
  );
  return { onProjectStarted };
}

const storage = () => createSessionOperationStorage('unknown', sessionStorage);

beforeEach(() => {
  sessionStorage.clear();
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
  Element.prototype.scrollIntoView = () => undefined;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('CreateSpecificationScreen on a project Runtime', () => {
  it('shows the real form (name, goal, workspace) without the demo workflow or agent', async () => {
    renderScreen('project', {
      createOptions: () => Promise.resolve(createOptionsFixture('default')),
    });
    expect(await screen.findByLabelText('Specification name')).toBeTruthy();
    expect(screen.getByLabelText('Goal (optional)')).toBeTruthy();
    expect(screen.queryByText('Workflow')).toBeNull();
    expect(screen.queryByText(/Creation is available in demo mode only/)).toBeNull();
  });

  it('hands the request over to the progress page instead of sending it: nothing is sent by the form', async () => {
    const create = vi.fn().mockResolvedValue(created);
    const { onProjectStarted } = renderScreen('project', {
      createOptions: () => Promise.resolve(createOptionsFixture('default')),
      create,
    });
    fireEvent.change(await screen.findByLabelText('Specification name'), {
      target: { value: 'Payment limits' },
    });
    fireEvent.change(screen.getByLabelText('Goal (optional)'), {
      target: { value: 'Limit refunds' },
    });
    const submit = await screen.findByRole('button', { name: 'Create specification' });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(submit);
    await waitFor(() => expect(onProjectStarted).toHaveBeenCalledOnce());
    const [operationId, options] = onProjectStarted.mock.calls[0] as [string, { replace: boolean }];
    expect(operationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(options).toEqual({ replace: false });
    expect(create).not.toHaveBeenCalled();
    const stored = storage().load();
    expect(stored?.request).toMatchObject({
      operationId,
      title: 'Payment limits',
      goal: 'Limit refunds',
    });
    expect(Object.keys(stored?.request ?? {}).sort()).not.toContain('archetypeId');
    expect(storage().loadDraft()).toMatchObject({ operationId, title: 'Payment limits' });
  });

  it('stores the new-worktree target of the chosen workspace in the request', async () => {
    const { onProjectStarted } = renderScreen('project', {
      createOptions: () => Promise.resolve(createOptionsFixture('default')),
    });
    fireEvent.change(await screen.findByLabelText('Specification name'), {
      target: { value: 'Payment limits' },
    });
    fireEvent.click(await screen.findByRole('radio', { name: /new workspace/i }));
    const submit = await screen.findByRole('button', { name: 'Create specification' });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(submit);
    await waitFor(() => expect(onProjectStarted).toHaveBeenCalled());
    expect(storage().load()?.request.target).toEqual({ kind: 'new-worktree' });
  });

  it('resumes an unfinished operation on its page, replacing the empty form in the history', async () => {
    storage().save({
      request: { title: 'Payment limits', operationId: created.operationId },
      startedAt: Date.now(),
    });
    const { onProjectStarted } = renderScreen('project', {
      createOptions: () => Promise.resolve(createOptionsFixture('default')),
    });
    await waitFor(() =>
      expect(onProjectStarted).toHaveBeenCalledWith(created.operationId, { replace: true }),
    );
  });

  it('Back to form: the fields and the workspace choice of the draft are restored once', async () => {
    storage().saveDraft({
      operationId: created.operationId,
      title: 'Payment limits',
      goal: 'Limit refunds',
      choice: { ...initialWorkspaceChoice, tile: 'main' },
    });
    renderScreen('project', {
      createOptions: () => Promise.resolve(createOptionsFixture('default')),
    });
    expect((await screen.findByLabelText<HTMLInputElement>('Specification name')).value).toBe(
      'Payment limits',
    );
    expect(screen.getByLabelText<HTMLTextAreaElement>('Goal (optional)').value).toBe(
      'Limit refunds',
    );
    expect((await screen.findByRole<HTMLInputElement>('radio', { name: /current/i })).checked).toBe(
      true,
    );
    // Consumed: a reload of the form starts clean.
    expect(storage().loadDraft()).toBeUndefined();
  });

  it('re-entering the screen never shows options cached from the previous visit as current', async () => {
    const client = createSpecFlowQueryClient();
    const first = renderScreen(
      'project',
      { createOptions: () => Promise.resolve(createOptionsFixture('no-linked')) },
      {},
      client,
    );
    expect(await screen.findByLabelText('Specification name')).toBeTruthy();
    await waitFor(() =>
      expect(screen.queryByRole('radio', { name: /new workspace/i })).toBeTruthy(),
    );
    cleanup();
    expect(first.onProjectStarted).not.toHaveBeenCalled();

    // The second visit: Git state changed, the answer is still in flight.
    let resolve!: (value: ReturnType<typeof createOptionsFixture>) => void;
    const pending = new Promise<ReturnType<typeof createOptionsFixture>>((r) => (resolve = r));
    renderScreen('project', { createOptions: () => pending }, {}, client);
    expect(await screen.findByLabelText('Specification name')).toBeTruthy();
    // No tile state from the cached answer while the fresh one is loading.
    expect(screen.queryByRole('radio', { name: /new workspace/i })).toBeNull();
    expect(document.querySelector('[aria-busy="true"]')).not.toBeNull();
    const submit = screen.getByRole('button', { name: 'Create specification' });
    fireEvent.change(screen.getByLabelText('Specification name'), { target: { value: 'Title' } });
    expect((submit as HTMLButtonElement).disabled).toBe(true);

    resolve(createOptionsFixture('default'));
    expect(await screen.findByRole('radio', { name: /new workspace/i })).toBeTruthy();
    expect(document.querySelector('[aria-busy="true"]')).toBeNull();
  });

  it('explains that a session cannot be created on a project Runtime', async () => {
    renderScreen('project', {}, { specId: 'spec-1' });
    expect(await screen.findByText('Not available in this Runtime')).toBeTruthy();
  });
});

// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import type { CreateOperationInspection, CreatedSpec } from '@nevo/specflow-contracts/specs';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { VisitStateProvider } from '../../../app/VisitStateProvider';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import type { OperationProgressEvent } from '@nevo/specflow-contracts/operations';
import type { OperationsApi } from '../../../shared/operations/operationsApi';
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
  const onProjectCreated = vi.fn();
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
                  onProjectCreated={onProjectCreated}
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
  return { onProjectCreated };
}

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

  it('creates against the real API with a new worktree and opens the created specification', async () => {
    const create = vi.fn().mockResolvedValue(created);
    const { onProjectCreated } = renderScreen('project', {
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
    await waitFor(() => expect(onProjectCreated).toHaveBeenCalledWith(created));
    const request = create.mock.calls[0]![0] as Record<string, unknown>;
    expect(request).toMatchObject({ title: 'Payment limits', goal: 'Limit refunds' });
    expect(Object.keys(request).sort()).not.toContain('catalogueRevision');
    expect(Object.keys(request).sort()).not.toContain('archetypeId');
  });

  it('can create the new workspace (worktree) from the form: the request carries the new-worktree target', async () => {
    const create = vi.fn().mockResolvedValue(created);
    renderScreen('project', {
      createOptions: () => Promise.resolve(createOptionsFixture('default')),
      create,
    });
    fireEvent.change(await screen.findByLabelText('Specification name'), {
      target: { value: 'Payment limits' },
    });
    fireEvent.click(await screen.findByRole('radio', { name: /new workspace/i }));
    const submit = await screen.findByRole('button', { name: 'Create specification' });
    await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(submit);
    await waitFor(() => expect(create).toHaveBeenCalled());
    expect((create.mock.calls[0]![0] as { target?: unknown }).target).toEqual({
      kind: 'new-worktree',
    });
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
    expect(first.onProjectCreated).not.toHaveBeenCalled();

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

  describe('live progress', () => {
    const base = {
      operationId: created.operationId,
      kind: 'specification-create',
      at: '2026-01-01T00:00:00.000Z',
    };

    /** A stream the test drives by hand; records the signal each watch received. */
    function controlledOperations() {
      const queue: (OperationProgressEvent | Error)[] = [];
      const signals: AbortSignal[] = [];
      let wake: (() => void) | undefined;
      const api: OperationsApi = {
        async *watchProgress(_streamUrl, signal) {
          if (signal) signals.push(signal);
          for (;;) {
            while (queue.length === 0) {
              if (signal?.aborted) return;
              await new Promise<void>((resolve) => {
                wake = resolve;
                signal?.addEventListener('abort', () => resolve(), { once: true });
              });
            }
            const next = queue.shift()!;
            if (next instanceof Error) throw next;
            yield next;
          }
        },
      };
      return {
        api,
        signals,
        push(item: OperationProgressEvent | Error) {
          queue.push(item);
          wake?.();
        },
      };
    }

    async function submitFor(
      operations: OperationsApi,
      create: ProjectCreationApi['create'],
      extra: Partial<ProjectCreationApi> = {},
    ) {
      const rendered = renderScreen(
        'project',
        {
          createOptions: () => Promise.resolve(createOptionsFixture('default')),
          create,
          ...extra,
        },
        {},
        createSpecFlowQueryClient(),
        operations,
      );
      fireEvent.change(await screen.findByLabelText('Specification name'), {
        target: { value: 'Payment limits' },
      });
      fireEvent.click(await screen.findByRole('radio', { name: /new workspace/i }));
      const submit = await screen.findByRole('button', { name: 'Create specification' });
      await waitFor(() => expect((submit as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(submit);
      return rendered;
    }

    const accepted = {
      operationId: created.operationId,
      kind: 'specification-create',
      status: 'in-progress',
    } as const;

    it('async mode: the 202 starts the checklist and the completed event opens the specification through the inspection', async () => {
      const operations = controlledOperations();
      let done = false;
      const inspectOperation = vi.fn(() =>
        Promise.resolve(done ? created : (accepted as CreateOperationInspection)),
      );
      const create = vi.fn(() => Promise.resolve(accepted));
      const rendered = await submitFor(operations.api, create, { inspectOperation });
      await waitFor(() => expect(operations.signals).toHaveLength(1));
      await waitFor(() => expect(inspectOperation).toHaveBeenCalledTimes(1));
      expect(rendered.onProjectCreated).not.toHaveBeenCalled();

      operations.push({
        ...base,
        type: 'snapshot',
        status: 'running',
        steps: [
          { id: 'reserving', status: 'done' },
          { id: 'preparing-workspace', status: 'running' },
        ],
      });
      expect(await screen.findByText('Preparing the workspace')).toBeTruthy();

      // The stream is the primary signal: its end is confirmed by the inspection, immediately.
      done = true;
      operations.push({ ...base, type: 'completed', result: created });
      await waitFor(() => expect(rendered.onProjectCreated).toHaveBeenCalledWith(created));
      expect(inspectOperation).toHaveBeenCalledTimes(2);
      expect(create).toHaveBeenCalledOnce();
    });

    it('async mode without a working stream: a calm note while the inspection is polled', async () => {
      const operations = controlledOperations();
      const inspectOperation = vi.fn(() => Promise.resolve(accepted as CreateOperationInspection));
      const create = vi.fn(() => Promise.resolve(accepted));
      const rendered = await submitFor(operations.api, create, { inspectOperation });
      await waitFor(() => expect(operations.signals).toHaveLength(1));
      operations.push(new Error('stream refused'));
      expect(await screen.findByText(/Keep this page open/)).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(rendered.onProjectCreated).not.toHaveBeenCalled();
    });

    it('shows the named steps of the running operation as a checklist and keeps the form working', async () => {
      const operations = controlledOperations();
      let finish!: (value: CreatedSpec) => void;
      const create = vi.fn(() => new Promise<CreatedSpec>((resolve) => (finish = resolve)));
      await submitFor(operations.api, create);

      // Rows are reserved at once; the real checklist arrives with the first snapshot.
      await waitFor(() => expect(operations.signals).toHaveLength(1));
      operations.push({
        ...base,
        type: 'snapshot',
        status: 'running',
        steps: [
          { id: 'reserving', status: 'done' },
          { id: 'preparing-workspace', status: 'running' },
          { id: 'writing-specification', status: 'pending' },
          { id: 'registering', status: 'pending' },
        ],
      });
      const running = await screen.findByText('Preparing the workspace');
      expect(running.closest('li')?.getAttribute('aria-current')).toBe('step');
      expect(
        screen.getByText('Reserving the name').closest('li')?.getAttribute('data-status'),
      ).toBe('done');

      operations.push({ ...base, type: 'step', step: 'preparing-workspace', status: 'done' });
      await waitFor(() => expect(running.closest('li')?.getAttribute('data-status')).toBe('done'));

      // The POST result stays authoritative: finishing it ends the operation.
      finish(created);
      await waitFor(() => expect(operations.signals[0]?.aborted).toBe(true));
    });

    it('never fails or blocks the create when the stream fails: no checklist, the POST decides', async () => {
      const operations = controlledOperations();
      let finish!: (value: CreatedSpec) => void;
      const create = vi.fn(() => new Promise<CreatedSpec>((resolve) => (finish = resolve)));
      await submitFor(operations.api, create);
      await waitFor(() => expect(operations.signals).toHaveLength(1));
      operations.push(new Error('stream refused'));
      await waitFor(() =>
        expect(document.querySelector('[data-testid="operation-progress"]')).toBeNull(),
      );
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.getByRole<HTMLButtonElement>('button', { name: /Preparing/ }).disabled).toBe(
        true,
      );
      finish(created);
    });

    it('stops watching when the page goes away mid-operation', async () => {
      const operations = controlledOperations();
      const create = vi.fn(() => new Promise<CreatedSpec>(() => undefined));
      await submitFor(operations.api, create);
      await waitFor(() => expect(operations.signals).toHaveLength(1));
      cleanup();
      expect(operations.signals[0]?.aborted).toBe(true);
    });
  });
});

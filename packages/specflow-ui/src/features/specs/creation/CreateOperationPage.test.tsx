// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { AppShell, AppWorkspaceProvider } from '@nevo/ui';
import {
  OPERATION_NOT_FOUND_CODE,
  type OperationProgressEvent,
} from '@nevo/specflow-contracts/operations';
import type { CreatedSpec } from '@nevo/specflow-contracts/specs';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { HttpClientError } from '@nevo/http-client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiTransport } from '../../../api';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { VisitStateProvider } from '../../../app/VisitStateProvider';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import type { OperationsApi } from '../../../shared/operations/operationsApi';
import { createProjectCreationApi } from './api.project';
import { CreateOperationScreen } from './CreateOperationScreen';
import { createSessionOperationStorage } from './createOperationStorage';
import { createSpecErrorCodes } from './createSpecErrors';
import { initialWorkspaceChoice } from './workspace/workspaceChoice';
import { openAfterCreatedMs } from './CreateOperationPage';

const operationId = '00000000-0000-4000-8000-000000000001';
const created: CreatedSpec = {
  operationId,
  specId: '00000000-0000-4000-8000-0000000000aa',
  kind: 'specification-create',
  status: 'completed',
  slug: 'payment-limits',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  relativeManifestPath: 'specs/active/payment-limits/specification.yaml',
};
const accepted = { operationId, kind: 'specification-create', status: 'in-progress' } as const;
const event = { operationId, kind: 'specification-create', at: '2026-01-01T00:00:00.000Z' };

const httpError = (status: number, code: string) =>
  new HttpClientError('failed', { kind: 'http', status, data: { error: code, code } });

const storage = () => createSessionOperationStorage('unknown', sessionStorage);
const store = (request: Record<string, unknown> = {}) =>
  storage().save({
    request: { title: 'Payment limits', operationId, ...request },
    startedAt: Date.now(),
  });

/** A progress stream the test drives by hand. */
function controlledOperations() {
  const queue: (OperationProgressEvent | Error)[] = [];
  let wake: (() => void) | undefined;
  const api: OperationsApi = {
    async *watchProgress(_url, signal) {
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
    push(item: OperationProgressEvent | Error) {
      queue.push(item);
      wake?.();
    },
  };
}
const silentOperations: OperationsApi = {
  // eslint-disable-next-line require-yield
  async *watchProgress() {
    await Promise.resolve();
  },
};

function renderPage(
  http: { post?: ReturnType<typeof vi.fn>; get?: ReturnType<typeof vi.fn> },
  operationsApi: OperationsApi = silentOperations,
) {
  const onOpen = vi.fn();
  const onBackToForm = vi.fn();
  const client = {
    post: http.post ?? vi.fn(),
    get: http.get ?? vi.fn(),
  } as never;
  const services = createSpecFlowAppServices({
    runtimeInfoApi: { getInfo: () => Promise.resolve({ dataMode: 'project' }) },
    projectCreationApi: createProjectCreationApi(
      createApiTransport(client, {
        operation: 'specs.create',
        codes: createSpecErrorCodes,
        isOnline: () => true,
      }),
    ),
    operationsApi,
  });
  const queryClient = createSpecFlowQueryClient();
  const tree = (
    <QueryClientProvider client={queryClient}>
      <TestServicesRouterContext services={services}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>
          <VisitStateProvider>
            <AppWorkspaceProvider>
              <AppShell navigation={<div>Nav</div>}>
                <CreateOperationScreen
                  operationId={operationId}
                  onOpen={onOpen}
                  onBackToForm={onBackToForm}
                />
              </AppShell>
            </AppWorkspaceProvider>
          </VisitStateProvider>
        </LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
  const view = render(tree);
  return { onOpen, onBackToForm, rerender: () => view.rerender(tree), unmount: view.unmount };
}

beforeEach(() => {
  sessionStorage.clear();
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
  vi.useRealTimers();
});

const heading = (name: string) => screen.findByRole('heading', { level: 1, name });

describe('CreateOperationPage', () => {
  it('names the creation, the typed title and the target, focuses the heading and sends the stored request once', async () => {
    store({ target: { kind: 'new-worktree', branch: 'feature/limits' } });
    const operations = controlledOperations();
    const post = vi.fn().mockResolvedValue(accepted);
    const get = vi.fn().mockRejectedValueOnce(httpError(404, 'CREATE_NOT_FOUND'));
    get.mockResolvedValue(accepted);
    renderPage({ post, get }, operations.api);

    const title = await heading('Creating specification');
    await waitFor(() => expect(document.activeElement).toBe(title));
    expect(screen.getByText('Payment limits')).toBeTruthy();
    expect(screen.getByText('In a new workspace on branch feature/limits.')).toBeTruthy();
    expect(screen.getByText(/you can leave this page/i)).toBeTruthy();

    await waitFor(() => expect(post).toHaveBeenCalledOnce());
    expect(post.mock.calls[0]![1]).toMatchObject({ operationId, title: 'Payment limits' });

    operations.push({
      ...event,
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
    expect(screen.getByRole('status', { name: 'Specification creation progress' })).toBeTruthy();
  });

  it('describes an existing workspace by the name the form kept', async () => {
    store({ target: { kind: 'existing', workspaceId: '00000000-0000-4000-8000-0000000000bb' } });
    storage().saveDraft({
      operationId,
      title: 'Payment limits',
      goal: '',
      choice: initialWorkspaceChoice,
      placeName: 'api-service',
    });
    renderPage({ get: vi.fn().mockResolvedValue(accepted) });
    expect(await screen.findByText('In the existing workspace api-service.')).toBeTruthy();
  });

  it('a reload resumes the same operation: it is read, never sent again', async () => {
    store();
    const get = vi.fn().mockResolvedValue(accepted);
    const post = vi.fn();
    const first = renderPage({ post, get });
    await heading('Creating specification');
    await waitFor(() => expect(get).toHaveBeenCalled());
    first.unmount();
    cleanup();

    renderPage({ post, get });
    expect(await heading('Creating specification')).toBeTruthy();
    expect(screen.getByText('Payment limits')).toBeTruthy();
    await waitFor(() => expect(get.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(post).not.toHaveBeenCalled();
  });

  it('success: shows the finished checklist, then opens the specification by itself', async () => {
    store({ target: { kind: 'new-worktree' } });
    const post = vi.fn().mockResolvedValue(created);
    const get = vi.fn().mockRejectedValue(httpError(404, 'CREATE_NOT_FOUND'));
    const { onOpen } = renderPage({ post, get });
    expect(await heading('Specification created')).toBeTruthy();
    const items = within(
      screen.getByRole('status', { name: 'Specification creation progress' }),
    ).getAllByRole('listitem');
    // Every step says "done" in text, not only by its icon.
    expect(items).toHaveLength(4);
    for (const item of items) expect(item.textContent).toMatch(/ done$/);
    expect(onOpen).not.toHaveBeenCalled();
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(created), {
      timeout: openAfterCreatedMs + 1500,
    });
    expect(storage().load()).toBeUndefined();
  });

  it('success: the button opens the specification at once', async () => {
    store();
    const { onOpen } = renderPage({
      post: vi.fn().mockResolvedValue(created),
      get: vi.fn().mockRejectedValue(httpError(404, 'CREATE_NOT_FOUND')),
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Open specification' }));
    expect(onOpen).toHaveBeenCalledWith(created);
  });

  it('a refusal keeps the entered values for Back to form, with the field it concerned', async () => {
    store({ target: { kind: 'new-worktree', branch: 'taken' } });
    storage().saveDraft({
      operationId,
      title: 'Payment limits',
      goal: 'Goal',
      choice: { ...initialWorkspaceChoice, tile: 'new' },
    });
    const post = vi.fn().mockRejectedValue(httpError(409, 'BRANCH_ALREADY_EXISTS'));
    const get = vi.fn().mockRejectedValue(httpError(404, 'CREATE_NOT_FOUND'));
    const { onBackToForm } = renderPage({ post, get });
    expect(await heading('Specification was not created')).toBeTruthy();
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(storage().load()).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Back to form' }));
    expect(onBackToForm).toHaveBeenCalledOnce();
    expect(storage().loadDraft()).toMatchObject({
      title: 'Payment limits',
      goal: 'Goal',
      choice: { tile: 'new' },
      failure: { kind: 'branch-exists', automatic: false },
    });
  });

  it('an unknown outcome offers only a check of the same operation, never a second create', async () => {
    store();
    const post = vi.fn().mockRejectedValue(new HttpClientError('network', { kind: 'network' }));
    const get = vi.fn().mockRejectedValueOnce(httpError(404, 'CREATE_NOT_FOUND'));
    get.mockResolvedValue(created);
    const { onOpen } = renderPage({ post, get });
    expect(await heading('Result not confirmed yet')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back to form' })).toBeNull();
    fireEvent.click(await screen.findByRole('button', { name: 'Check the result' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Open specification' })).toBeTruthy(),
    );
    expect(post).toHaveBeenCalledOnce();
    expect(onOpen).not.toHaveBeenCalled();
  });

  it('says it is still working, calmly, after a while', async () => {
    store();
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    renderPage({ get: vi.fn().mockResolvedValue(accepted) });
    // Let the Runtime mode and the first reading settle (they are scheduled with timers too).
    for (let i = 0; i < 5; i++)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(21_000);
    });
    expect(screen.getByText('Still working — this can take a minute.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  describe('opened by a direct link (no request stored)', () => {
    it('shows an operation still running without a title, and sends nothing', async () => {
      const post = vi.fn();
      renderPage({ post, get: vi.fn().mockResolvedValue(accepted) });
      expect(await heading('Creating specification')).toBeTruthy();
      expect(screen.queryByText('Payment limits')).toBeNull();
      await waitFor(() => expect(screen.getByText('Preparing your specification.')).toBeTruthy());
      expect(post).not.toHaveBeenCalled();
    });

    it('opens the specification of a finished operation', async () => {
      const { onOpen } = renderPage({ get: vi.fn().mockResolvedValue(created) });
      fireEvent.click(await screen.findByRole('button', { name: 'Open specification' }));
      expect(onOpen).toHaveBeenCalledWith(created);
    });

    it('shows a failure the server reports', async () => {
      renderPage({
        get: vi
          .fn()
          .mockResolvedValue({ ...accepted, status: 'failed', code: 'BRANCH_ALREADY_EXISTS' }),
      });
      expect(await heading('Specification was not created')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Back to form' })).toBeTruthy();
    });

    it('says calmly that the operation does not exist, with a way back to Create', async () => {
      const post = vi.fn();
      const { onBackToForm } = renderPage({
        post,
        get: vi.fn().mockRejectedValue(httpError(404, 'CREATE_NOT_FOUND')),
      });
      expect(await heading('Operation not found')).toBeTruthy();
      expect(screen.getByText('This operation does not exist')).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Back to Create' }));
      expect(onBackToForm).toHaveBeenCalledOnce();
      expect(post).not.toHaveBeenCalled();
      expect(screen.queryByRole('alert')).toBeNull();
    });
  });

  describe('a failure the live stream reports', () => {
    const streamFailed = (code: string) => ({ type: 'failed' as const, ...event, code });

    it('is shown as news while the inspection has not concluded, naming the reason', async () => {
      store();
      const operations = controlledOperations();
      renderPage(
        { post: vi.fn().mockResolvedValue(accepted), get: vi.fn().mockResolvedValue(accepted) },
        operations.api,
      );
      await heading('Creating specification');
      operations.push(streamFailed('BRANCH_ALREADY_EXISTS'));
      const news = await screen.findByText('The server reported a problem');
      expect(news.closest('[role="status"]')?.textContent).toMatch(/branch/i);
      // It is information, not the outcome: the page still works and offers no action on it.
      expect(
        screen.getByRole('heading', { level: 1, name: 'Creating specification' }),
      ).toBeTruthy();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Back to form' })).toBeNull();
    });

    it('is not news when the Runtime merely does not know the operation yet', async () => {
      store();
      const operations = controlledOperations();
      renderPage(
        { post: vi.fn().mockResolvedValue(accepted), get: vi.fn().mockResolvedValue(accepted) },
        operations.api,
      );
      await heading('Creating specification');
      operations.push(streamFailed(OPERATION_NOT_FOUND_CODE));
      await waitFor(() => expect(screen.getByText('Preparing your specification.')).toBeTruthy());
      expect(screen.queryByText('The server reported a problem')).toBeNull();
    });

    it('is replaced, not repeated, once the inspection concludes the same failure', async () => {
      store();
      const operations = controlledOperations();
      let concluded = false;
      const get = vi.fn(() =>
        Promise.resolve(
          concluded ? { ...accepted, status: 'failed', code: 'BRANCH_ALREADY_EXISTS' } : accepted,
        ),
      );
      renderPage({ post: vi.fn().mockResolvedValue(accepted), get }, operations.api);
      await heading('Creating specification');
      operations.push(streamFailed('BRANCH_ALREADY_EXISTS'));
      await screen.findByText('The server reported a problem');
      concluded = true;
      // The failed event is also the hint to read the inspection again soon (within one poll).
      expect(
        await screen.findByRole(
          'heading',
          { level: 1, name: 'Specification was not created' },
          { timeout: 6000 },
        ),
      ).toBeTruthy();
      expect(screen.queryByText('The server reported a problem')).toBeNull();
      expect(screen.getAllByRole('alert')).toHaveLength(1);
    });
  });

  it('shows the calm note, not an error, when the live stream is unavailable', async () => {
    store();
    const operations = controlledOperations();
    renderPage(
      { post: vi.fn().mockResolvedValue(accepted), get: vi.fn().mockResolvedValue(accepted) },
      operations.api,
    );
    await heading('Creating specification');
    await waitFor(() => expect(screen.getByText('Preparing your specification.')).toBeTruthy());
    operations.push(new Error('stream refused'));
    expect(await screen.findByText('Still working')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

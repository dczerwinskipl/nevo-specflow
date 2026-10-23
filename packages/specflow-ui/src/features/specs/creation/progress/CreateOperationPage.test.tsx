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
import { createApiTransport } from '../../../../api';
import { createSpecFlowQueryClient } from '../../../../app/queryClient';
import { VisitStateProvider } from '../../../../app/VisitStateProvider';
import { LocalizationProvider, createSpecFlowI18n } from '../../../../i18n';
import { createSpecFlowAppServices } from '../../../../services';
import { TestServicesRouterContext } from '../../../../../test-support/app/TestServicesRouterContext';
import type { OperationsApi } from '../../../../shared/operations/operationsApi';
import { createProjectCreationApi } from '../api/api.project';
import { CreateOperationScreen } from '../CreateOperationScreen';
import { createSessionOperationStorage } from '../operation/createOperationStorage';
import { createSpecErrorCodes } from '../errors/createSpecErrors';
import { initialWorkspaceChoice } from '../workspace/model/workspaceChoice';
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
    list: () => Promise.resolve({ kind: 'unavailable' as const }),
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
  list: () => Promise.resolve({ kind: 'unavailable' as const }),
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
  const onBackToSpecifications = vi.fn();
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
                  onBackToSpecifications={onBackToSpecifications}
                />
              </AppShell>
            </AppWorkspaceProvider>
          </VisitStateProvider>
        </LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
  const view = render(tree);
  return {
    onOpen,
    onBackToForm,
    onBackToSpecifications,
    rerender: () => view.rerender(tree),
    unmount: view.unmount,
  };
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

/** The page heading: the state, with the typed name when the page knows it (: Payment limits). */
const heading = (name: string, named = true) =>
  screen.findByRole('heading', {
    level: 1,
    name: named
      ? name === 'Creating specification'
        ? 'Creating Payment limits'
        : `${name}: Payment limits`
      : name,
  });

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
    // One heading carries the state and the name; no tooltip: the full name is a row of the settings.
    expect(title.hasAttribute('title')).toBe(false);
    // The settings are the request's own facts; unknown values (folder, base) have no row.
    const settings = within(screen.getByLabelText('Creation settings'));
    expect(settings.getByText('Payment limits')).toBeTruthy();
    expect(settings.getByText('In a new workspace')).toBeTruthy();
    expect(settings.getByText('feature/limits')).toBeTruthy();
    expect(settings.queryByText('Worktree folder')).toBeNull();
    expect(settings.queryByText('Goal')).toBeNull();
    expect(screen.getByText(/you can leave this page/i)).toBeTruthy();
    // The way back is the list; the old hint to open New specification is gone.
    expect(screen.queryByText(/Open New specification/)).toBeNull();

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
    // The subtitle names the running step too (no generic line next to a concrete step).
    const running = (await screen.findAllByText('Preparing the workspace')).find((node) =>
      node.closest('li'),
    );
    expect(running?.closest('li')?.getAttribute('aria-current')).toBe('step');
    expect(screen.getByRole('group', { name: 'Specification creation progress' })).toBeTruthy();
    // ONE polite announcer reads each status change once (the subtitle and checklist are not live).
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toBe('Preparing the workspace'),
    );
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('describes an existing workspace by the name and branch the form kept', async () => {
    store({ target: { kind: 'existing', workspaceId: '00000000-0000-4000-8000-0000000000bb' } });
    storage().saveDraft({
      operationId,
      title: 'Payment limits',
      goal: '',
      choice: initialWorkspaceChoice,
      facts: { place: 'existing', workspace: { name: 'api-service', branch: 'feature/api' } },
    });
    renderPage({ get: vi.fn().mockResolvedValue(accepted) });
    const settings = within(await screen.findByLabelText('Creation settings'));
    expect(settings.getByText(/Added to workspace/)).toBeTruthy();
    expect(settings.getByText('api-service')).toBeTruthy();
    expect(settings.getByText('feature/api')).toBeTruthy();
  });

  it('states the configuration compactly (type, branch, base, integrate into, goal) and keeps technical values in closed details', async () => {
    store({ target: { kind: 'new-worktree' }, slug: 'limits', goal: `Goal ${'long '.repeat(40)}` });
    storage().saveDraft({
      operationId,
      title: 'Payment limits',
      goal: '',
      choice: initialWorkspaceChoice,
      facts: {
        place: 'new',
        base: 'develop',
        branch: 'feature/limits',
        folder: '/work/trees',
        mergeInto: { name: 'acme-app', branch: 'develop' },
        mergeReason: 'dirty',
        slug: 'limits',
      },
    });
    renderPage({ get: vi.fn().mockResolvedValue(accepted) });
    const settings = within(await screen.findByLabelText('Creation settings'));
    expect(settings.getByText('Start from')).toBeTruthy();
    expect(settings.getAllByText('develop')).toHaveLength(2);
    expect(settings.getByText('Merge into')).toBeTruthy();
    // The uncommitted-changes caveat belongs to the form, not to the progress page.
    expect(screen.queryByText(/uncommitted changes/)).toBeNull();
    // Technical values are not part of the summary; they are in the closed disclosure.
    expect(settings.queryByText('/work/trees')).toBeNull();
    expect(screen.getByRole('heading', { level: 2, name: 'Configuration' })).toBeTruthy();
    const trigger = screen.getByRole('button', { name: 'Technical details' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(trigger);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(await screen.findByText('/work/trees')).toBeTruthy();
    expect(screen.getByText('limits')).toBeTruthy();
    expect(screen.getByText(operationId)).toBeTruthy();
    const goal = settings.getByText(/^Goal long/);
    expect(goal.textContent.length).toBeLessThanOrEqual(166);
    expect(goal.textContent.endsWith('…')).toBe(true);
  });

  it('shows the way back to the list, and the failed page says what was NOT created', async () => {
    store({ target: { kind: 'new-worktree', branch: 'taken' } });
    const post = vi.fn().mockRejectedValue(httpError(409, 'BRANCH_ALREADY_EXISTS'));
    const get = vi.fn().mockRejectedValue(httpError(404, 'CREATE_NOT_FOUND'));
    const { onBackToSpecifications } = renderPage({ post, get });
    expect(await heading('Specification was not created')).toBeTruthy();
    expect(screen.getByText(/^Nothing was created./, { selector: 'p:not(.sr-only)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to specifications' }));
    expect(onBackToSpecifications).toHaveBeenCalledOnce();
  });

  it.each([
    [422, 'BRANCH_PROTECTED', 'The branch of the selected workspace is protected'],
    [409, 'COMMIT_BLOCKED', 'a merge or rebase is in progress'],
  ])(
    '%i %s: nothing was created, and the page says so in plain words',
    async (status, code, copy) => {
      store({ target: { kind: 'existing', workspaceId: operationId } });
      const post = vi.fn().mockRejectedValue(httpError(status, code));
      const get = vi.fn().mockRejectedValue(httpError(404, 'CREATE_NOT_FOUND'));
      renderPage({ post, get });
      expect(await heading('Specification was not created')).toBeTruthy();
      expect(
        screen.getByText(/^Nothing was created./, { selector: 'p:not(.sr-only)' }),
      ).toBeTruthy();
      expect(screen.getByText(new RegExp(copy))).toBeTruthy();
      expect(screen.queryByText(code)).toBeNull();
    },
  );

  it('COMMIT_FAILED: the files exist but are not committed; no new create, only a check', async () => {
    store({ target: { kind: 'new-worktree' } });
    const post = vi.fn().mockRejectedValue(httpError(503, 'COMMIT_FAILED'));
    const get = vi.fn().mockRejectedValue(httpError(404, 'CREATE_NOT_FOUND'));
    renderPage({ post, get });
    expect(await heading('Result not confirmed yet')).toBeTruthy();
    expect(
      (
        await screen.findAllByText(
          /The specification files were created but could not be committed/,
        )
      ).length,
    ).toBeGreaterThan(0);
    // Truthful: never "Nothing was created", and no way to submit a fresh create.
    expect(screen.queryByText(/^Nothing was created./)).toBeNull();
    expect(screen.getByRole('button', { name: 'Check operation status' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull();
    // ONE disclosure of facts: the page's technical details, not a second "Diagnostic data".
    expect(screen.queryByRole('button', { name: 'Diagnostic data' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Technical details' })).toBeTruthy();
  });

  it('keeps the commit (system behaviour) out of the configuration and in the technical details when Git is enabled', async () => {
    store({ target: { kind: 'new-worktree' } });
    storage().saveDraft({
      operationId,
      title: 'Payment limits',
      goal: '',
      choice: initialWorkspaceChoice,
      facts: { place: 'new', branch: 'feature/limits', commit: true },
    });
    renderPage({
      post: vi.fn().mockResolvedValue(accepted),
      get: vi.fn().mockResolvedValue(accepted),
    });
    const settings = within(await screen.findByLabelText('Creation settings'));
    expect(settings.queryByText('Commit')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Technical details' }));
    expect(screen.getByText('Commit')).toBeTruthy();
    expect(screen.getByText(/The specification files are committed to/)).toBeTruthy();
  });

  it('while it runs: steps in user language with a description each, waiting steps muted, no merge-target warning', async () => {
    store({ target: { kind: 'new-worktree' } });
    storage().saveDraft({
      operationId,
      title: 'Payment limits',
      goal: '',
      choice: initialWorkspaceChoice,
      facts: {
        place: 'new',
        branch: 'feature/limits',
        mergeInto: { name: 'acme-app', branch: 'develop' },
        mergeReason: 'dirty',
      },
    });
    const operations = controlledOperations();
    renderPage(
      { post: vi.fn().mockResolvedValue(accepted), get: vi.fn().mockResolvedValue(accepted) },
      operations.api,
    );
    // Before any step is known: ONE neutral row, no simulated checklist.
    expect(await screen.findByText('This can take a moment.')).toBeTruthy();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
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
    expect(await screen.findByText('Creating the working environment')).toBeTruthy();
    expect(screen.getByText('Name and branch reserved')).toBeTruthy();
    // Pending steps are only muted titles: no repeated "waiting" line.
    expect(screen.queryByText('Waiting for previous step')).toBeNull();
    // The subtitle names the running step instead of a generic line.
    expect(
      screen.queryByText('Preparing a new workspace and the specification.', {
        selector: 'p:not(.sr-only)',
      }),
    ).toBeNull();
    // Subtitle, checklist step and the announcer (the only live region).
    await waitFor(() => expect(screen.getAllByText('Preparing the workspace')).toHaveLength(3));
    // One spinner: the header mark is static while the active step turns.
    expect(document.querySelectorAll('.animate-spin')).toHaveLength(1);
    expect(screen.queryByText(/uncommitted/)).toBeNull();
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
      screen.getByRole('group', { name: 'Specification creation progress' }),
    ).getAllByRole('listitem');
    // Every step says "done" in text, not only by its icon.
    expect(items).toHaveLength(4);
    for (const item of items) expect(item.textContent).toMatch(/ done/);
    expect(onOpen).not.toHaveBeenCalled();
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(created), {
      timeout: openAfterCreatedMs + 1500,
    });
    expect(storage().load(operationId)).toBeUndefined();
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
    expect(storage().load(operationId)).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Back to form' }));
    expect(onBackToForm).toHaveBeenCalledOnce();
    // The explicit path: the form is told which operation's draft to restore.
    expect(onBackToForm).toHaveBeenCalledWith(operationId);
    expect(storage().loadDraft(operationId)).toMatchObject({
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
    expect(
      screen.getByText('Still working — this can take a minute.', { selector: 'p:not(.sr-only)' }),
    ).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  describe('opened by a direct link (no request stored)', () => {
    it('shows an operation still running without a title, and sends nothing', async () => {
      const post = vi.fn();
      renderPage({ post, get: vi.fn().mockResolvedValue(accepted) });
      expect(await heading('Creating specification', false)).toBeTruthy();
      expect(screen.queryByText(/Payment limits/)).toBeNull();
      expect(screen.queryByLabelText('Creation settings')).toBeNull();
      await waitFor(() => expect(screen.getByText('Preparing the specification.')).toBeTruthy());
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
      expect(await heading('Specification was not created', false)).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Back to form' })).toBeTruthy();
    });

    it('says calmly that the operation does not exist, with a way back to Create', async () => {
      const post = vi.fn();
      const { onBackToForm } = renderPage({
        post,
        get: vi.fn().mockRejectedValue(httpError(404, 'CREATE_NOT_FOUND')),
      });
      expect(await heading('Operation not found', false)).toBeTruthy();
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
        screen.getByRole('heading', { level: 1, name: 'Creating Payment limits' }),
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
      await waitFor(() => expect(screen.getByText('Preparing the specification.')).toBeTruthy());
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
          { level: 1, name: 'Specification was not created: Payment limits' },
          { timeout: 6000 },
        ),
      ).toBeTruthy();
      expect(screen.queryByText('The server reported a problem')).toBeNull();
      expect(screen.getAllByRole('alert')).toHaveLength(1);
    });
  });

  it('shows ONE neutral state, not an error, when the live stream is unavailable', async () => {
    store();
    const operations = controlledOperations();
    renderPage(
      { post: vi.fn().mockResolvedValue(accepted), get: vi.fn().mockResolvedValue(accepted) },
      operations.api,
    );
    await heading('Creating specification');
    await waitFor(() => expect(screen.getByText('Preparing the specification.')).toBeTruthy());
    operations.push(new Error('stream refused'));
    expect(await screen.findByText(/Live steps are unavailable/)).toBeTruthy();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

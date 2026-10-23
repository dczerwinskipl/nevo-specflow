// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { HttpClientError, type HttpRequestClient } from '@nevo/http-client';
import type { CreatedSpec } from '@nevo/specflow-contracts/specs';
import { act, cleanup, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApiTransport } from '../../../api';
import { createSpecFlowQueryClient } from '../../../app/queryClient';
import { VisitStateProvider } from '../../../app/VisitStateProvider';
import { LocalizationProvider, createSpecFlowI18n } from '../../../i18n';
import { createSpecFlowAppServices } from '../../../services';
import { TestServicesRouterContext } from '../../../../test-support/app/TestServicesRouterContext';
import { createProjectCreationApi } from './api/api.project';
import {
  createSessionOperationStorage,
  type StoredCreateOperation,
} from './createOperationStorage';
import { createSpecErrorCodes } from './errors/createSpecErrors';
import {
  useCreateProjectSpecification,
  type ProjectCreateModel,
  type ProjectSubmission,
} from './useCreateProjectSpecification';

const created: CreatedSpec = {
  operationId: '00000000-0000-4000-8000-000000000001',
  specId: '00000000-0000-4000-8000-0000000000aa',
  kind: 'specification-create',
  status: 'completed',
  slug: 'title',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  relativeManifestPath: 'specs/active/title/specification.yaml',
};

const httpError = (status: number, code: string) =>
  new HttpClientError('failed', { kind: 'http', status, data: { error: code, code } });
const lostAnswer = () => new HttpClientError('network', { kind: 'network' });
const notFound = () => httpError(404, 'CREATE_NOT_FOUND');
const inProgress = {
  operationId: created.operationId,
  kind: 'specification-create',
  status: 'in-progress',
};

const submission = (overrides: Partial<ProjectSubmission> = {}): ProjectSubmission => ({
  title: ' Title ',
  goal: ' ',
  buildTarget: () => undefined,
  snapshot: 'form-1',
  ...overrides,
});

/** The ledger entries of this tab, whatever their operation id (the key carries the id). */
const ledgerEntries = () =>
  Object.keys(sessionStorage)
    .filter((key) => key.startsWith('specflow.create.operation.v1:'))
    .map((key) => JSON.parse(sessionStorage.getItem(key) ?? 'null') as StoredCreateOperation);
const storageKey = () => ({
  load: () => ledgerEntries()[0],
  save: (operation: StoredCreateOperation) =>
    createSessionOperationStorage('unknown', sessionStorage).save(operation),
});

function setup(
  http: { post?: ReturnType<typeof vi.fn>; get?: ReturnType<typeof vi.fn> },
  stored?: StoredCreateOperation,
  operationId?: string,
  snapshot = 'form-1',
) {
  const onCreated = vi.fn();
  const announce = vi.fn();
  const client = {
    post: http.post ?? vi.fn(),
    get: http.get ?? vi.fn(),
  } as unknown as HttpRequestClient;
  const services = createSpecFlowAppServices({
    projectCreationApi: createProjectCreationApi(
      createApiTransport(client, {
        operation: 'specs.create',
        codes: createSpecErrorCodes,
        isOnline: () => true,
      }),
    ),
  });
  const queryClient = createSpecFlowQueryClient();
  const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <TestServicesRouterContext services={services}>
        <LocalizationProvider instance={createSpecFlowI18n('en')}>
          <VisitStateProvider>{children}</VisitStateProvider>
        </LocalizationProvider>
      </TestServicesRouterContext>
    </QueryClientProvider>
  );
  const hook = renderHook(
    () =>
      useCreateProjectSpecification({
        stored,
        operationId,
        snapshot,
        onCreated,
        announce,
      }),
    { wrapper },
  );
  const model = (): ProjectCreateModel => hook.result.current;
  return { hook, model, onCreated, announce, invalidate, client };
}

beforeEach(() => {
  vi.useFakeTimers();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useCreateProjectSpecification', () => {
  it('sends only what the real schema accepts, opens the created specification and refreshes the overview', async () => {
    const post = vi.fn().mockResolvedValue(created);
    const { model, onCreated, invalidate } = setup({ post });
    await act(async () => {
      await model().actions.submit(
        submission({ goal: ' Make it work ', buildTarget: () => ({ kind: 'new-worktree' }) }),
      );
    });
    const [url, body] = post.mock.calls[0] as [string, Record<string, unknown>];
    expect(url).toBe('/api/specs');
    expect(Object.keys(body).sort()).toEqual(['goal', 'operationId', 'target', 'title']);
    expect(body).toMatchObject({
      title: 'Title',
      goal: 'Make it work',
      target: { kind: 'new-worktree' },
    });
    expect(body.operationId).toMatch(/^[0-9a-f-]{36}$/);
    expect(model().state.phase).toBe('completed');
    expect(model().actions.isNavigationAllowed()).toBe(true);
    expect(onCreated).toHaveBeenCalledWith(created);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['specs-overview'] });
    expect(storageKey().load()).toBeUndefined();
  });

  it('omits an empty goal and an unset target', async () => {
    const post = vi.fn().mockResolvedValue(created);
    const { model } = setup({ post });
    await act(async () => {
      await model().actions.submit(submission());
    });
    expect(Object.keys(post.mock.calls[0]![1] as object).sort()).toEqual(['operationId', 'title']);
  });

  it('keeps the operation stored while it is unconfirmed and releases it on success', async () => {
    let resolve!: (value: CreatedSpec) => void;
    const post = vi.fn(
      () =>
        new Promise<CreatedSpec>((res) => {
          resolve = res;
        }),
    );
    const { model } = setup({ post });
    let pending!: Promise<void>;
    act(() => {
      pending = model().actions.submit(submission());
    });
    expect(storageKey().load()?.request.title).toBe('Title');
    expect(model().state.phase).toBe('submitting');
    await act(async () => {
      resolve(created);
      await pending;
    });
    expect(storageKey().load()).toBeUndefined();
  });

  it('shows a refusal as a definite failure, keeps the id for an identical retry and releases the stored operation', async () => {
    const post = vi
      .fn()
      .mockRejectedValueOnce(httpError(409, 'BRANCH_ALREADY_EXISTS'))
      .mockResolvedValueOnce(created);
    const onFailed = vi.fn();
    const { model } = setup({ post });
    await act(async () => {
      await model().actions.submit(submission({ onFailed }));
    });
    expect(model().state.phase).toBe('failed');
    expect(model().state.failure).toMatchObject({ kind: 'branch-exists', automatic: true });
    expect(onFailed).toHaveBeenCalledWith({ kind: 'branch-exists', automatic: true });
    expect(storageKey().load()).toBeUndefined();
    await act(async () => {
      await model().actions.submit(submission());
    });
    const ids = post.mock.calls.map((call) => (call[1] as { operationId: string }).operationId);
    expect(ids[0]).toBe(ids[1]);
    expect(model().state.phase).toBe('completed');
  });

  it('uses a new operation id after CREATE_CONFLICT (the name, not the operation, conflicts)', async () => {
    const post = vi
      .fn()
      .mockRejectedValueOnce(httpError(409, 'CREATE_CONFLICT'))
      .mockResolvedValueOnce(created);
    const { model } = setup({ post });
    await act(async () => {
      await model().actions.submit(submission());
    });
    expect(model().state.failure).toMatchObject({ kind: 'name-conflict' });
    await act(async () => {
      await model().actions.submit(submission());
    });
    const ids = post.mock.calls.map((call) => (call[1] as { operationId: string }).operationId);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it('a lost answer leaves an unknown outcome; checking finds the finished operation without a second request', async () => {
    const post = vi.fn().mockRejectedValue(lostAnswer());
    const get = vi.fn().mockResolvedValue(created);
    const { model, onCreated } = setup({ post, get });
    await act(async () => {
      await model().actions.submit(submission());
    });
    expect(model().state.phase).toBe('outcome-unknown');
    expect(model().state.failure).toMatchObject({ kind: 'uncertain' });
    expect(storageKey().load()).toBeDefined();
    expect(get).not.toHaveBeenCalled();
    await act(async () => {
      await model().actions.submit(submission());
    });
    expect(get).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/specs\/create\/operations\/[0-9a-f-]{36}$/),
      expect.anything(),
    );
    expect(post).toHaveBeenCalledOnce();
    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it('sends the same operation again, with the same id, only when the server has no record of it', async () => {
    const post = vi.fn().mockRejectedValueOnce(lostAnswer()).mockResolvedValueOnce(created);
    const get = vi.fn().mockRejectedValue(notFound());
    const { model, onCreated } = setup({ post, get });
    await act(async () => {
      await model().actions.submit(submission());
    });
    await act(async () => {
      await model().actions.submit(submission());
    });
    expect(post).toHaveBeenCalledTimes(2);
    const ids = post.mock.calls.map((call) => (call[1] as { operationId: string }).operationId);
    expect(ids[0]).toBe(ids[1]);
    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it('asks for async mode, shows the accepted operation as monitoring and opens the result found by the status poll', async () => {
    const post = vi.fn().mockResolvedValue(inProgress);
    const get = vi.fn().mockResolvedValueOnce(inProgress).mockResolvedValue(created);
    const { model, onCreated, announce } = setup({ post, get });
    await act(async () => {
      void model().actions.submit(submission());
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(post.mock.calls[0]![2]).toMatchObject({ headers: { Prefer: 'respond-async' } });
    expect(model().state.phase).toBe('monitoring');
    expect(model().flags).toMatchObject({ monitoring: true, busy: true, unfinished: true });
    expect(announce).toHaveBeenCalledWith(expect.stringContaining('few minutes'));
    // The stored operation survives a reload while it is being watched.
    expect(storageKey().load()).toBeDefined();
    // A healthy stream is the primary signal: the poll is only a slow safety net.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(14_000);
    });
    expect(get).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });
    expect(onCreated).toHaveBeenCalledWith(created);
    expect(model().state.phase).toBe('completed');
    expect(post).toHaveBeenCalledOnce();
    expect(storageKey().load()).toBeUndefined();
  });

  it('reads the inspection at once when the progress stream reports its terminal event', async () => {
    const post = vi.fn().mockResolvedValue(inProgress);
    const get = vi.fn().mockResolvedValueOnce(inProgress).mockResolvedValue(created);
    const { model, onCreated } = setup({ post, get });
    await act(async () => {
      void model().actions.submit(submission());
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(model().state.phase).toBe('monitoring');
    expect(get).toHaveBeenCalledTimes(1);
    await act(async () => {
      model().actions.setStreamHint('terminal');
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(get).toHaveBeenCalledTimes(2);
    expect(onCreated).toHaveBeenCalledWith(created);
    expect(model().state.phase).toBe('completed');
  });

  it('polls with the regular backoff once the progress stream is lost', async () => {
    const post = vi.fn().mockResolvedValue(inProgress);
    const get = vi.fn().mockResolvedValueOnce(inProgress).mockResolvedValueOnce(inProgress);
    get.mockResolvedValue(created);
    const { model, onCreated } = setup({ post, get });
    await act(async () => {
      void model().actions.submit(submission());
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      model().actions.setStreamHint('lost');
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(get).toHaveBeenCalledTimes(2);
    expect(onCreated).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(3_000);
    });
    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it('still accepts the synchronous 201 of an older Runtime', async () => {
    const post = vi.fn().mockResolvedValue(created);
    const get = vi.fn();
    const { model, onCreated } = setup({ post, get });
    await act(async () => {
      await model().actions.submit(submission());
    });
    expect(model().state.phase).toBe('completed');
    expect(onCreated).toHaveBeenCalledWith(created);
    expect(get).not.toHaveBeenCalled();
  });

  it('ends a watched operation the Runtime reports as recovery-required in the recovery state', async () => {
    const post = vi.fn().mockResolvedValue(inProgress);
    const get = vi.fn().mockResolvedValue({ ...inProgress, status: 'recovery-required' });
    const { model, onCreated } = setup({ post, get });
    await act(async () => {
      await model().actions.submit(submission());
    });
    expect(model().state.phase).toBe('recovery-required');
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('locks the form on recovery-required and completes after a status check finds the result', async () => {
    const post = vi.fn().mockRejectedValue(httpError(503, 'CREATE_RECOVERY_REQUIRED'));
    const get = vi.fn().mockResolvedValue(created);
    const { model, onCreated } = setup({ post, get });
    await act(async () => {
      await model().actions.submit(submission());
    });
    expect(model().state.phase).toBe('recovery-required');
    expect(model().flags.recovery).toBe(true);
    await act(async () => {
      await model().actions.submit(submission());
    });
    expect(post).toHaveBeenCalledOnce();
    expect(onCreated).toHaveBeenCalledWith(created);
  });

  it('a status check that finds the operation still open keeps the form locked', async () => {
    const post = vi.fn().mockRejectedValue(httpError(503, 'CREATE_RECOVERY_REQUIRED'));
    const get = vi.fn().mockResolvedValue({ ...inProgress, status: 'recovery-required' });
    const { model, onCreated } = setup({ post, get });
    await act(async () => {
      await model().actions.submit(submission());
    });
    await act(async () => {
      await model().actions.submit(submission());
    });
    expect(model().state.phase).toBe('recovery-required');
    expect(model().state.status).toEqual({ status: 'recovery-required' });
    expect(model().state.checking).toBe(false);
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('ignores a second submit while one is in flight', async () => {
    const post = vi.fn(() => new Promise<never>(() => undefined));
    const { model } = setup({ post });
    await act(async () => {
      void model().actions.submit(submission());
      await model().actions.submit(submission());
    });
    expect(post).toHaveBeenCalledOnce();
  });

  it('resumes an operation stored by a previous page: it checks, never sends again, and opens the result', async () => {
    const stored: StoredCreateOperation = {
      request: { title: 'Title', operationId: created.operationId },
      startedAt: Date.now(),
    };
    storageKey().save(stored);
    const post = vi.fn();
    const get = vi.fn().mockResolvedValue(created);
    const { model, onCreated } = setup({ post, get }, stored);
    expect(model().state.sent).toMatchObject({ operationId: created.operationId, title: 'Title' });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(get).toHaveBeenCalledOnce();
    expect(post).not.toHaveBeenCalled();
    expect(onCreated).toHaveBeenCalledWith(created);
    expect(storageKey().load()).toBeUndefined();
  });

  it('concluding one operation clears only its own ledger entry, never that of another operation', async () => {
    const other: StoredCreateOperation = {
      request: { title: 'Other', operationId: '22222222-2222-4222-8222-222222222222' },
      startedAt: Date.now(),
    };
    const own: StoredCreateOperation = {
      request: { title: 'Title', operationId: created.operationId },
      startedAt: Date.now(),
    };
    storageKey().save(other);
    storageKey().save(own);
    const { onCreated } = setup(
      { post: vi.fn(), get: vi.fn().mockResolvedValue(created) },
      own,
      created.operationId,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(onCreated).toHaveBeenCalledWith(created);
    expect(ledgerEntries().map((entry) => entry.request.operationId)).toEqual([
      other.request.operationId,
    ]);
  });

  it('re-sends, with the same id, a resumed operation the server never saw', async () => {
    const stored: StoredCreateOperation = {
      request: { title: 'Title', operationId: created.operationId },
      startedAt: Date.now(),
    };
    storageKey().save(stored);
    const post = vi.fn().mockResolvedValue(created);
    const get = vi.fn().mockRejectedValue(notFound());
    const { model, onCreated } = setup({ post, get }, stored);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(post).toHaveBeenCalledOnce();
    expect(post.mock.calls[0]![1]).toMatchObject({
      operationId: created.operationId,
      title: 'Title',
    });
    expect(onCreated).toHaveBeenCalledWith(created);
    expect(model().state.phase).toBe('completed');
  });

  describe('opened by operation id alone (direct link, cleared storage)', () => {
    it('opens the specification of a finished operation without sending anything', async () => {
      const post = vi.fn();
      const get = vi.fn().mockResolvedValue(created);
      const { model, onCreated } = setup({ post, get }, undefined, created.operationId);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(onCreated).toHaveBeenCalledWith(created);
      expect(model().state.phase).toBe('completed');
      expect(post).not.toHaveBeenCalled();
    });

    it('watches an operation the server still runs', async () => {
      const post = vi.fn();
      const get = vi.fn().mockResolvedValue(inProgress);
      const { model } = setup({ post, get }, undefined, created.operationId);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(model().state.phase).toBe('monitoring');
      expect(model().state.sent).toMatchObject({ operationId: created.operationId, title: '' });
      expect(post).not.toHaveBeenCalled();
    });

    it('says the operation is unknown when the server has no record, and never sends it', async () => {
      const post = vi.fn();
      const get = vi.fn().mockRejectedValue(notFound());
      const { model } = setup({ post, get }, undefined, created.operationId);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(model().unknownOperation).toBe(true);
      expect(post).not.toHaveBeenCalled();
    });

    it('shows what the server reports about a failed operation', async () => {
      const get = vi
        .fn()
        .mockResolvedValue({ ...inProgress, status: 'failed', code: 'BRANCH_ALREADY_EXISTS' });
      const { model } = setup({ get }, undefined, created.operationId, '');
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(model().state.phase).toBe('failed');
      expect(model().state.failure).toMatchObject({ kind: 'branch-exists' });
      expect(model().unknownOperation).toBe(false);
    });

    it('the check action asks the server again for an operation that could not be read', async () => {
      const get = vi.fn().mockRejectedValueOnce(lostAnswer()).mockResolvedValue(created);
      const { model, onCreated } = setup({ get }, undefined, created.operationId);
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(model().state.phase).toBe('outcome-unknown');
      await act(async () => {
        await model().actions.check();
      });
      expect(onCreated).toHaveBeenCalledWith(created);
    });
  });

  it('retries an operation a lost session left failed: the server is asked first and the stored operation is kept meanwhile', async () => {
    const stored: StoredCreateOperation = {
      request: { title: 'Title', operationId: created.operationId },
      startedAt: Date.now(),
    };
    storageKey().save(stored);
    const post = vi.fn();
    const get = vi.fn().mockRejectedValueOnce(httpError(401, 'UNAUTHENTICATED'));
    get.mockResolvedValue(created);
    const { model, onCreated } = setup({ post, get }, stored, undefined, '');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(model().state.phase).toBe('failed');
    expect(model().state.failure).toMatchObject({ kind: 'unauthenticated' });
    expect(storageKey().load()).toBeDefined();
    await act(async () => {
      await model().actions.retry();
    });
    expect(onCreated).toHaveBeenCalledWith(created);
    expect(post).not.toHaveBeenCalled();
  });

  it('does not navigate for a page that was closed while the operation ran, and keeps the stored operation', async () => {
    let resolve!: (value: CreatedSpec) => void;
    const post = vi.fn(
      () =>
        new Promise<CreatedSpec>((res) => {
          resolve = res;
        }),
    );
    const { model, hook, onCreated } = setup({ post });
    act(() => {
      void model().actions.submit(submission());
    });
    hook.unmount();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1);
      resolve(created);
      await vi.advanceTimersByTimeAsync(1);
    });
    expect(onCreated).not.toHaveBeenCalled();
    expect(storageKey().load()).toBeDefined();
  });

  it('ends a synchronous failure while preparing the request as a definite failure and keeps the form usable', async () => {
    const post = vi.fn().mockResolvedValue(created);
    const { model } = setup({ post });
    await act(async () => {
      await model().actions.submit(
        submission({
          buildTarget: () => {
            throw new TypeError('crypto.randomUUID is not a function');
          },
        }),
      );
    });
    expect(post).not.toHaveBeenCalled();
    expect(model().state.phase).toBe('failed');
    expect(model().state.failure).toMatchObject({ kind: 'failed' });
    expect(storageKey().load()).toBeUndefined();

    await act(async () => {
      await model().actions.submit(submission());
    });
    expect(model().state.phase).toBe('completed');
  });

  it('shows the failure the inspection reports after acceptance, by its code, and releases the stored operation', async () => {
    const post = vi.fn().mockResolvedValue(inProgress);
    const get = vi.fn().mockResolvedValue({
      operationId: created.operationId,
      kind: 'specification-create',
      status: 'failed',
      code: 'BASE_REF_NOT_FOUND',
    });
    const { model, onCreated } = setup({ post, get });
    await act(async () => {
      await model().actions.submit(submission());
    });
    expect(get).toHaveBeenCalledOnce();
    expect(model().state.phase).toBe('failed');
    expect(model().state.failure).toMatchObject({ kind: 'stale', code: 'BASE_REF_NOT_FOUND' });
    expect(storageKey().load()).toBeUndefined();
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('keeps an operation whose reported failure code leaves the outcome open and offers the check', async () => {
    const post = vi.fn().mockResolvedValue(inProgress);
    const get = vi.fn().mockResolvedValue({
      operationId: created.operationId,
      kind: 'specification-create',
      status: 'failed',
      code: 'INTERNAL_ERROR',
    });
    const { model } = setup({ post, get });
    await act(async () => {
      await model().actions.submit(submission());
    });
    expect(model().state.phase).toBe('outcome-unknown');
    expect(storageKey().load()).toBeDefined();
  });

  it('stops watching and surfaces a lost session instead of polling until the hard limit', async () => {
    const post = vi.fn().mockResolvedValue(inProgress);
    const get = vi.fn().mockRejectedValue(httpError(401, 'authentication_required'));
    const { model } = setup({ post, get });
    await act(async () => {
      await model().actions.submit(submission());
    });
    expect(get).toHaveBeenCalledOnce();
    expect(model().state.failure).toMatchObject({ kind: 'unauthenticated' });
    // The operation is not abandoned: it stays stored and a resubmit replays the same id.
    expect(storageKey().load()).toBeDefined();
  });
});

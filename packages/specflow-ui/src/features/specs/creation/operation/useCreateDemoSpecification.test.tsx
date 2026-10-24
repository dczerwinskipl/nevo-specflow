// @vitest-environment jsdom
import { QueryClientProvider } from '@tanstack/react-query';
import { HttpClientError } from '@nevo/http-client';
import type {
  DemoCreatedSpec,
  DemoCreateRequest,
  DemoOperationStatus,
} from '@nevo/specflow-contracts/demo';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSpecFlowQueryClient } from '../../../../app/queryClient';
import { VisitStateProvider } from '../../../../app/VisitStateProvider';
import { LocalizationProvider, createSpecFlowI18n } from '../../../../i18n';
import { createSpecFlowAppServices } from '../../../../services';
import { TestServicesRouterContext } from '../../../../../test-support/app/TestServicesRouterContext';
import type { DemoCreationApi } from '../api/api.demo';
import {
  useCreateDemoSpecification,
  type CreateSpecificationModel,
  type CreateSubmission,
} from './useCreateDemoSpecification';

const created: DemoCreatedSpec = {
  specId: 'spec-1',
  documentIds: ['doc-1'],
  operationId: '00000000-0000-4000-8000-000000000001',
  kind: 'specification-create',
  status: 'completed',
  slug: 'spec-1',
  workspaceId: '00000000-0000-4000-8000-000000000002',
  relativeManifestPath: 'specs/spec-1/spec.yaml',
};

const httpError = (status: number, code: string) =>
  new HttpClientError('failed', { kind: 'http', status, data: { code } });
const timeout = () => new HttpClientError('timeout', { kind: 'network' });

const submission = (overrides: Partial<CreateSubmission> = {}): CreateSubmission => ({
  title: ' Title ',
  archetype: { id: 'workflow', version: 1 },
  buildTarget: () => undefined,
  snapshot: 'form-1',
  ...overrides,
});

function setup(demoCreationApi: Partial<DemoCreationApi>) {
  const onCreated = vi.fn();
  const onSession = vi.fn();
  const announce = vi.fn();
  const services = createSpecFlowAppServices({
    demoCreationApi: demoCreationApi as DemoCreationApi,
  });
  const queryClient = createSpecFlowQueryClient();
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
    ({ snapshot }: { snapshot: string }) =>
      useCreateDemoSpecification({
        catalogueRevision: 'rev-1',
        snapshot,
        onCreated,
        onSession,
        announce,
      }),
    { wrapper, initialProps: { snapshot: 'form-1' } },
  );
  const model = (): CreateSpecificationModel => hook.result.current;
  return { hook, model, onCreated, onSession, announce };
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('useCreateDemoSpecification', () => {
  it('creates, allows the navigation and ends completed', async () => {
    const create = vi.fn().mockResolvedValue(created);
    const { model, onCreated } = setup({ create });
    await act(async () => {
      expect(await model().actions.submit(submission())).toEqual({ kind: 'completed' });
    });
    expect(model().state.phase).toBe('completed');
    expect(model().actions.isNavigationAllowed()).toBe(true);
    expect(onCreated).toHaveBeenCalledWith('spec-1', 'doc-1');
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]![0]).toMatchObject({ title: 'Title', catalogueRevision: 'rev-1' });
  });

  it('ignores a second submit while one is in flight', async () => {
    let resolve!: (value: DemoCreatedSpec) => void;
    const create = vi.fn(
      () =>
        new Promise<DemoCreatedSpec>((res) => {
          resolve = res;
        }),
    );
    const { model } = setup({ create });
    let first!: Promise<unknown>;
    await act(async () => {
      first = model().actions.submit(submission());
      expect(await model().actions.submit(submission())).toEqual({ kind: 'ignored' });
    });
    expect(model().state.phase).toBe('submitting');
    await act(async () => {
      resolve(created);
      await first;
    });
    expect(create).toHaveBeenCalledOnce();
  });

  it('replays an unknown outcome with the same operation id and body', async () => {
    const create = vi.fn().mockRejectedValueOnce(timeout()).mockResolvedValueOnce(created);
    const { model, onCreated } = setup({ create });
    await act(async () => {
      await model().actions.submit(submission());
    });
    expect(model().state.phase).toBe('outcome-unknown');
    expect(model().flags.unfinished).toBe(true);
    // The form changed meanwhile: the replay must still send the retained request.
    await act(async () => {
      await model().actions.submit(submission({ title: 'Changed', snapshot: 'form-2' }));
    });
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]![0]).toEqual(create.mock.calls[0]![0]);
    expect(model().state.phase).toBe('completed');
    expect(onCreated).toHaveBeenCalledOnce();
  });

  it('does not dispatch a replay while offline and keeps the unknown outcome', async () => {
    const create = vi.fn().mockRejectedValueOnce(timeout());
    const { model } = setup({ create });
    await act(async () => {
      await model().actions.submit(submission());
    });
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await act(async () => {
      await model().actions.submit(submission());
    });
    expect(create).toHaveBeenCalledOnce();
    expect(model().state).toMatchObject({ phase: 'outcome-unknown', connectionLost: true });
  });

  it('classifies "never sent" offline on a fresh attempt as a definite failure', async () => {
    const create = vi.fn();
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { model } = setup({ create });
    await act(async () => {
      await model().actions.submit(submission());
    });
    expect(create).not.toHaveBeenCalled();
    expect(model().state).toMatchObject({ phase: 'failed', failure: { kind: 'offline' } });
  });

  it('retires a definite failure when the form changes, never an unknown outcome', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(httpError(409, 'BRANCH_ALREADY_EXISTS'))
      .mockRejectedValueOnce(timeout());
    const { hook, model } = setup({ create });
    await act(async () => {
      await model().actions.submit(submission());
    });
    expect(model().state.phase).toBe('failed');
    hook.rerender({ snapshot: 'form-2' });
    await waitFor(() => expect(model().state.phase).toBe('idle'));
    await act(async () => {
      await model().actions.submit(submission({ snapshot: 'form-2' }));
    });
    expect(model().state.phase).toBe('outcome-unknown');
    hook.rerender({ snapshot: 'form-3' });
    expect(model().state.phase).toBe('outcome-unknown');
  });

  it('starts a new operation after a conflict discarded the retained one', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(httpError(409, 'CREATE_CONFLICT'))
      .mockResolvedValueOnce(created);
    const { model } = setup({ create });
    await act(async () => {
      await model().actions.submit(submission());
    });
    expect(model().state).toMatchObject({ phase: 'failed', sent: null });
    await act(async () => {
      await model().actions.submit(submission());
    });
    const [first, second] = create.mock.calls.map((call) => call[0] as DemoCreateRequest);
    expect(second!.operationId).not.toBe(first!.operationId);
  });

  it('resolves recovery-required by checking the operation and completing from its result', async () => {
    const create = vi.fn().mockRejectedValueOnce(httpError(503, 'CREATE_RECOVERY_REQUIRED'));
    const operationStatus = vi.fn((operationId: string): Promise<DemoOperationStatus> =>
      Promise.resolve({
        operationId,
        status: 'completed',
        result: created,
      } as DemoOperationStatus),
    );
    const { model, onCreated } = setup({ create, operationStatus });
    await act(async () => {
      await model().actions.submit(submission());
    });
    expect(model().state.phase).toBe('recovery-required');
    await act(async () => {
      const outcome = await model().actions.submit(submission());
      expect(outcome).toMatchObject({ kind: 'checked', resumed: { kind: 'completed' } });
    });
    expect(operationStatus).toHaveBeenCalledWith(
      (create.mock.calls[0]![0] as DemoCreateRequest).operationId,
    );
    expect(create).toHaveBeenCalledOnce();
    expect(model().state.phase).toBe('completed');
    expect(onCreated).toHaveBeenCalledWith('spec-1', 'doc-1');
  });

  it.each([
    ['not-started', 'outcome-unknown'],
    ['failed', 'failed'],
  ] as const)('a %s status leads to %s', async (status, phase) => {
    const create = vi.fn().mockRejectedValueOnce(httpError(503, 'CREATE_RECOVERY_REQUIRED'));
    const operationStatus = vi.fn(
      (operationId: string) =>
        Promise.resolve({ operationId, status }) as Promise<DemoOperationStatus>,
    );
    const { model, announce } = setup({ create, operationStatus });
    await act(async () => {
      await model().actions.submit(submission());
    });
    await act(async () => {
      await model().actions.submit(submission());
    });
    expect(model().state.phase).toBe(phase);
    expect(announce).toHaveBeenCalledOnce();
  });

  it('keeps recovery-required when the status cannot be read', async () => {
    const create = vi.fn().mockRejectedValueOnce(httpError(503, 'CREATE_RECOVERY_REQUIRED'));
    const operationStatus = vi.fn().mockRejectedValue(timeout());
    const { model } = setup({ create, operationStatus });
    await act(async () => {
      await model().actions.submit(submission());
    });
    await act(async () => {
      await model().actions.submit(submission());
    });
    expect(model().state).toMatchObject({
      phase: 'recovery-required',
      statusUnreadable: true,
      checking: false,
    });
  });
});

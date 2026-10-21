import type { CreateOperationInspection, CreatedSpec } from '@nevo/specflow-contracts/specs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../api';
import type { ProjectCreationApi } from './api.project';
import {
  readOperation,
  resumeCreateOperation,
  submitCreateOperation,
} from './watchCreateOperation';

const operationId = '11111111-1111-4111-8111-111111111111';
const created: CreatedSpec = {
  operationId,
  specId: '22222222-2222-4222-8222-222222222222',
  kind: 'specification-create',
  status: 'completed',
  slug: 'title',
  workspaceId: '33333333-3333-4333-8333-333333333333',
  relativeManifestPath: 'specs/active/title/specification.yaml',
};
const input = { title: 'Title', operationId };

function apiError(kind: ApiError['kind'], outcome: ApiError['outcome'], code?: string): ApiError {
  return new ApiError({ kind, operation: 'specs.create', outcome, retryable: false, code });
}

interface Deferred<T> {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function fakeApi(inspections: (() => Promise<CreateOperationInspection>)[] = []) {
  const post = deferred<CreatedSpec>();
  let call = 0;
  const raw = {
    create: vi.fn(() => post.promise),
    inspectOperation: vi.fn(() => {
      const next = inspections[Math.min(call, inspections.length - 1)];
      call += 1;
      return next
        ? next()
        : Promise.resolve({
            operationId,
            kind: 'specification-create',
            status: 'in-progress',
          } as const);
    }),
  };
  return { api: raw as unknown as ProjectCreationApi, post, raw };
}

const inProgress = () =>
  Promise.resolve<CreateOperationInspection>({
    operationId,
    kind: 'specification-create',
    status: 'in-progress',
  });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('submitCreateOperation', () => {
  it('returns the result of a request that answers before the soft deadline, without watching', async () => {
    const { api, post, raw } = fakeApi();
    const onMonitoring = vi.fn();
    const result = submitCreateOperation(api, input, { onMonitoring });
    post.resolve(created);
    await expect(result).resolves.toEqual({ kind: 'completed', created });
    expect(onMonitoring).not.toHaveBeenCalled();
    expect(raw.inspectOperation).not.toHaveBeenCalled();
  });

  it('reports a definite refusal as a failure', async () => {
    const { api, post } = fakeApi();
    const result = submitCreateOperation(api, input);
    const refusal = apiError('conflict', 'not-applied', 'BRANCH_ALREADY_EXISTS');
    post.reject(refusal);
    await expect(result).resolves.toEqual({ kind: 'failed', error: refusal });
  });

  it.each([
    ['network', apiError('network', 'unknown')],
    ['timeout', apiError('timeout', 'unknown')],
    ['server error', apiError('server', 'unknown')],
  ])('leaves a %s before the soft deadline unresolved and does not poll', async (_name, error) => {
    const { api, post, raw } = fakeApi();
    const result = submitCreateOperation(api, input);
    post.reject(error);
    await expect(result).resolves.toEqual({ kind: 'unresolved', error });
    expect(raw.inspectOperation).not.toHaveBeenCalled();
  });

  it('switches to monitoring at the soft deadline without abandoning the request', async () => {
    const { api, post, raw } = fakeApi([inProgress]);
    const onMonitoring = vi.fn();
    const result = submitCreateOperation(api, input, { onMonitoring });
    await vi.advanceTimersByTimeAsync(14_999);
    expect(onMonitoring).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(onMonitoring).toHaveBeenCalledOnce();
    expect(raw.inspectOperation).toHaveBeenCalledWith(operationId, undefined);
    post.resolve(created);
    await expect(result).resolves.toEqual({ kind: 'completed', created });
    expect(raw.create).toHaveBeenCalledOnce();
  });

  it('takes the journal answer when it completes before the request does', async () => {
    const { api } = fakeApi([inProgress, () => Promise.resolve(created)]);
    const result = submitCreateOperation(api, input);
    await vi.advanceTimersByTimeAsync(15_000 + 3_000);
    await expect(result).resolves.toEqual({ kind: 'completed', created });
  });

  it('stops on recovery-required reported by the journal', async () => {
    const { api } = fakeApi([
      () =>
        Promise.resolve<CreateOperationInspection>({
          operationId,
          kind: 'specification-create',
          status: 'recovery-required',
        }),
    ]);
    const result = submitCreateOperation(api, input);
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(result).resolves.toEqual({ kind: 'recovery-required' });
  });

  it('keeps watching a lost request while the journal says in-progress, then finds the result', async () => {
    const { api, post, raw } = fakeApi([inProgress, inProgress, () => Promise.resolve(created)]);
    const result = submitCreateOperation(api, input);
    await vi.advanceTimersByTimeAsync(15_000);
    post.reject(apiError('network', 'unknown'));
    await vi.advanceTimersByTimeAsync(10_000);
    await expect(result).resolves.toEqual({ kind: 'completed', created });
    expect(raw.inspectOperation.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('ends not-started when the request is lost and the journal has no record', async () => {
    const { api, post } = fakeApi([
      () => Promise.reject(apiError('not-found', 'not-applied', 'CREATE_NOT_FOUND')),
    ]);
    const result = submitCreateOperation(api, input);
    await vi.advanceTimersByTimeAsync(15_000);
    post.reject(apiError('network', 'unknown'));
    await expect(result).resolves.toEqual({ kind: 'not-started' });
  });

  it('does not conclude "not started" while the request is still in flight', async () => {
    const { api, post } = fakeApi([
      () => Promise.reject(apiError('not-found', 'not-applied', 'CREATE_NOT_FOUND')),
      () => Promise.resolve(created),
    ]);
    const result = submitCreateOperation(api, input);
    await vi.advanceTimersByTimeAsync(15_000 + 3_000);
    await expect(result).resolves.toEqual({ kind: 'completed', created });
    post.resolve(created);
  });

  it('keeps polling through unreadable answers', async () => {
    const { api } = fakeApi([
      () => Promise.reject(apiError('network', 'not-applied')),
      () => Promise.resolve(created),
    ]);
    const result = submitCreateOperation(api, input);
    await vi.advanceTimersByTimeAsync(15_000 + 3_000);
    await expect(result).resolves.toEqual({ kind: 'completed', created });
  });

  it('polls every 3 s for the first minute and every 10 s afterwards', async () => {
    const { api, raw } = fakeApi([inProgress]);
    void submitCreateOperation(api, input);
    await vi.advanceTimersByTimeAsync(15_000);
    expect(raw.inspectOperation).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(60_000);
    // 3 s cadence for the first minute of watching: 20 more readings.
    expect(raw.inspectOperation).toHaveBeenCalledTimes(21);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(raw.inspectOperation.mock.calls.length).toBeLessThanOrEqual(25);
  });

  it('gives up after the hard limit with an unresolved outcome', async () => {
    const { api } = fakeApi([inProgress]);
    const result = submitCreateOperation(api, input);
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000 + 10_000);
    await expect(result).resolves.toEqual({ kind: 'unresolved' });
  });

  it('stops watching when aborted', async () => {
    const { api } = fakeApi([inProgress]);
    const controller = new AbortController();
    const result = submitCreateOperation(api, input, { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(16_000);
    controller.abort();
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({ kind: 'unresolved' });
  });
});

describe('resumeCreateOperation', () => {
  it('finishes with the result found in the journal', async () => {
    const { api } = fakeApi([() => Promise.resolve(created)]);
    await expect(resumeCreateOperation(api, operationId)).resolves.toEqual({
      kind: 'completed',
      created,
    });
  });

  it('treats a missing journal record as not started (no request of this page is in flight)', async () => {
    const { api } = fakeApi([
      () => Promise.reject(apiError('not-found', 'not-applied', 'CREATE_NOT_FOUND')),
    ]);
    await expect(resumeCreateOperation(api, operationId)).resolves.toEqual({ kind: 'not-started' });
  });

  it('reads the journal once even when the stored operation is older than the hard limit', async () => {
    const { api, raw } = fakeApi([inProgress]);
    const result = resumeCreateOperation(api, operationId, {
      startedAt: Date.now() - 11 * 60 * 1000,
    });
    await expect(result).resolves.toEqual({ kind: 'unresolved' });
    expect(raw.inspectOperation).toHaveBeenCalledOnce();
  });
});

describe('readOperation', () => {
  it('maps the journal projection and a missing record', async () => {
    const make = (answer: () => Promise<CreateOperationInspection>) =>
      ({ inspectOperation: vi.fn(answer) }) as unknown as Pick<
        ProjectCreationApi,
        'inspectOperation'
      >;
    await expect(
      readOperation(
        make(() => Promise.resolve(created)),
        operationId,
      ),
    ).resolves.toEqual({
      kind: 'completed',
      created,
    });
    await expect(readOperation(make(inProgress), operationId)).resolves.toEqual({
      kind: 'in-progress',
    });
    await expect(
      readOperation(
        make(() => Promise.reject(apiError('not-found', 'not-applied', 'CREATE_NOT_FOUND'))),
        operationId,
      ),
    ).resolves.toEqual({ kind: 'not-started' });
    const failure = apiError('network', 'not-applied');
    await expect(
      readOperation(
        make(() => Promise.reject(failure)),
        operationId,
      ),
    ).resolves.toEqual({ kind: 'unreadable', error: failure });
  });
});

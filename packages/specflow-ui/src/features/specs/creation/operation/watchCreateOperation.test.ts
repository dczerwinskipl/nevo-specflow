import type {
  CreateOperationAccepted,
  CreateOperationInspection,
  CreatedSpec,
} from '@nevo/specflow-contracts/specs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../../../api';
import type { ProjectCreationApi } from '../api/api.project';
import {
  createStreamHints,
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

const accepted: CreateOperationAccepted = {
  operationId,
  kind: 'specification-create',
  status: 'in-progress',
};

function fakeApi(
  inspections: (() => Promise<CreateOperationInspection>)[] = [],
  answer: () => Promise<CreatedSpec | CreateOperationAccepted> = () => Promise.resolve(accepted),
) {
  let call = 0;
  const raw = {
    create: vi.fn(answer),
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
  return { api: raw as unknown as ProjectCreationApi, raw };
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
  it('returns the result of a synchronous 201 (older Runtime) without watching', async () => {
    const { api, raw } = fakeApi([], () => Promise.resolve(created));
    const onAccepted = vi.fn();
    await expect(submitCreateOperation(api, input, { onAccepted })).resolves.toEqual({
      kind: 'completed',
      created,
    });
    expect(onAccepted).not.toHaveBeenCalled();
    expect(raw.inspectOperation).not.toHaveBeenCalled();
  });

  it('reports a definite refusal as a failure', async () => {
    const refusal = apiError('conflict', 'not-applied', 'BRANCH_ALREADY_EXISTS');
    const { api } = fakeApi([], () => Promise.reject(refusal));
    await expect(submitCreateOperation(api, input)).resolves.toEqual({
      kind: 'failed',
      error: refusal,
    });
  });

  it.each([
    ['network', apiError('network', 'unknown')],
    ['timeout', apiError('timeout', 'unknown')],
    ['server error', apiError('server', 'unknown')],
  ])('leaves a %s of the request unresolved and does not poll', async (_name, error) => {
    const { api, raw } = fakeApi([], () => Promise.reject(error));
    await expect(submitCreateOperation(api, input)).resolves.toEqual({
      kind: 'unresolved',
      error,
    });
    expect(raw.inspectOperation).not.toHaveBeenCalled();
  });

  it('reports the acceptance (202), then reads the inspection at once and finds the result', async () => {
    const { api, raw } = fakeApi([() => Promise.resolve(created)]);
    const onAccepted = vi.fn();
    await expect(submitCreateOperation(api, input, { onAccepted })).resolves.toEqual({
      kind: 'completed',
      created,
    });
    expect(onAccepted).toHaveBeenCalledOnce();
    expect(raw.create).toHaveBeenCalledOnce();
    expect(raw.inspectOperation).toHaveBeenCalledWith(operationId, undefined);
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
    await expect(submitCreateOperation(api, input)).resolves.toEqual({
      kind: 'recovery-required',
    });
  });

  it('ends not-started when an accepted operation has no journal record', async () => {
    const { api } = fakeApi([
      () => Promise.reject(apiError('not-found', 'not-applied', 'CREATE_NOT_FOUND')),
    ]);
    await expect(submitCreateOperation(api, input)).resolves.toEqual({ kind: 'not-started' });
  });

  it('keeps polling through unreadable answers', async () => {
    const { api } = fakeApi([
      () => Promise.reject(apiError('network', 'not-applied')),
      () => Promise.resolve(created),
    ]);
    const result = submitCreateOperation(api, input);
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(result).resolves.toEqual({ kind: 'completed', created });
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
    await vi.advanceTimersByTimeAsync(4_000);
    controller.abort();
    await vi.advanceTimersByTimeAsync(1);
    await expect(result).resolves.toEqual({ kind: 'unresolved' });
  });

  it('ends at once with the stable code when the inspection reports the operation failed', async () => {
    const { api, raw } = fakeApi([
      () =>
        Promise.resolve<CreateOperationInspection>({
          operationId,
          kind: 'specification-create',
          status: 'failed',
          code: 'GIT_OPERATION_FAILED',
        }),
    ]);
    await expect(submitCreateOperation(api, input)).resolves.toEqual({
      kind: 'operation-failed',
      code: 'GIT_OPERATION_FAILED',
    });
    expect(raw.inspectOperation).toHaveBeenCalledOnce();
  });

  it.each(['unauthenticated', 'forbidden'] as const)(
    'stops polling when the session or the capability is gone (%s)',
    async (kind) => {
      const error = apiError(kind, 'not-applied');
      const { api, raw } = fakeApi([() => Promise.reject(error)]);
      await expect(submitCreateOperation(api, input)).resolves.toEqual({
        kind: 'unresolved',
        error,
      });
      expect(raw.inspectOperation).toHaveBeenCalledOnce();
    },
  );

  it('backs off for the time a 429 asks for, then keeps watching', async () => {
    const limited = new ApiError({
      kind: 'rate-limited',
      operation: 'specs.create.inspect',
      outcome: 'not-applied',
      retryable: true,
      retryAfterMs: 20_000,
    });
    const { api, raw } = fakeApi([() => Promise.reject(limited), () => Promise.resolve(created)]);
    const result = submitCreateOperation(api, input);
    await vi.advanceTimersByTimeAsync(19_000);
    expect(raw.inspectOperation).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1_000);
    await expect(result).resolves.toEqual({ kind: 'completed', created });
  });

  it('keeps the regular interval after a 429 without Retry-After', async () => {
    const limited = apiError('rate-limited', 'not-applied');
    const { api, raw } = fakeApi([() => Promise.reject(limited), () => Promise.resolve(created)]);
    const result = submitCreateOperation(api, input);
    await vi.advanceTimersByTimeAsync(3_000);
    await expect(result).resolves.toEqual({ kind: 'completed', created });
    expect(raw.inspectOperation).toHaveBeenCalledTimes(2);
  });

  describe('polling follows what the progress stream says', () => {
    it('without a stream: every 3 s for the first minute, every 10 s afterwards', async () => {
      const { api, raw } = fakeApi([inProgress]);
      void submitCreateOperation(api, input);
      await vi.advanceTimersByTimeAsync(0);
      expect(raw.inspectOperation).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60_000);
      // One reading at once, then one every 3 s for the first minute.
      expect(raw.inspectOperation).toHaveBeenCalledTimes(21);
      await vi.advanceTimersByTimeAsync(30_000);
      expect(raw.inspectOperation.mock.calls.length).toBeLessThanOrEqual(25);
    });

    it('with a live stream: a slow 15 s safety net only', async () => {
      const { api, raw } = fakeApi([inProgress]);
      const stream = createStreamHints();
      void submitCreateOperation(api, input, { stream });
      await vi.advanceTimersByTimeAsync(14_000);
      expect(raw.inspectOperation).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(raw.inspectOperation).toHaveBeenCalledTimes(2);
    });

    it('on the completed event: reads the inspection at once instead of waiting', async () => {
      const { api, raw } = fakeApi([inProgress, () => Promise.resolve(created)]);
      const stream = createStreamHints();
      const result = submitCreateOperation(api, input, { stream });
      await vi.advanceTimersByTimeAsync(2_000);
      expect(raw.inspectOperation).toHaveBeenCalledTimes(1);
      stream.set('terminal');
      await expect(result).resolves.toEqual({ kind: 'completed', created });
      expect(raw.inspectOperation).toHaveBeenCalledTimes(2);
    });

    it('on stream loss: switches from the safety net to the regular 3 s backoff', async () => {
      const { api, raw } = fakeApi([inProgress, inProgress, () => Promise.resolve(created)]);
      const stream = createStreamHints();
      const result = submitCreateOperation(api, input, { stream });
      await vi.advanceTimersByTimeAsync(5_000);
      expect(raw.inspectOperation).toHaveBeenCalledTimes(1);
      stream.set('lost');
      await vi.advanceTimersByTimeAsync(0);
      expect(raw.inspectOperation).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(3_000);
      await expect(result).resolves.toEqual({ kind: 'completed', created });
    });

    it('does not sleep when the stream spoke while a reading was in flight', async () => {
      const stream = createStreamHints();
      const { api, raw } = fakeApi([
        () => {
          stream.set('terminal');
          return inProgress();
        },
        () => Promise.resolve(created),
      ]);
      const result = submitCreateOperation(api, input, { stream });
      await expect(result).resolves.toEqual({ kind: 'completed', created });
      expect(raw.inspectOperation).toHaveBeenCalledTimes(2);
    });

    it('a terminal event that the journal does not confirm falls back to the regular backoff', async () => {
      const { api, raw } = fakeApi([inProgress]);
      const stream = createStreamHints();
      void submitCreateOperation(api, input, { stream });
      await vi.advanceTimersByTimeAsync(0);
      stream.set('terminal');
      await vi.advanceTimersByTimeAsync(0);
      expect(raw.inspectOperation).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(2_999);
      expect(raw.inspectOperation).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1);
      expect(raw.inspectOperation).toHaveBeenCalledTimes(3);
    });
  });
});

describe('createStreamHints', () => {
  it('starts live, notifies a change once and ignores a repeated hint', async () => {
    const hints = createStreamHints();
    expect(hints.current()).toBe('live');
    const changed = vi.fn();
    void hints.changed().then(changed);
    hints.set('live');
    await vi.advanceTimersByTimeAsync(0);
    expect(changed).not.toHaveBeenCalled();
    hints.set('lost');
    await vi.advanceTimersByTimeAsync(0);
    expect(changed).toHaveBeenCalledOnce();
    expect(hints.current()).toBe('lost');
  });

  it('releases a waiter when aborted', async () => {
    const hints = createStreamHints();
    const controller = new AbortController();
    const changed = vi.fn();
    void hints.changed(controller.signal).then(changed);
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    expect(changed).toHaveBeenCalledOnce();
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

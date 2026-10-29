import { afterEach, describe, expect, it, vi } from 'vitest';

import { createOperationProgressRegistry, type StoredProgressEvent } from './progress-registry';

const operationId = '3f0a6d4e-8f2a-4b6e-9d0a-1c2b3d4e5f60';
const kind = 'specification-create' as const;
const steps = ['reserving', 'preparing-workspace', 'writing-specification'] as const;

async function collect(
  iterable: AsyncIterable<StoredProgressEvent>,
  limit = 100,
): Promise<StoredProgressEvent[]> {
  const events: StoredProgressEvent[] = [];
  for await (const event of iterable) {
    events.push(event);
    if (events.length >= limit) {
      break;
    }
  }

  return events;
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.useRealTimers();
});

describe('operation progress registry', () => {
  it('starts a fresh run when begin() follows a finished run of the same id inside the grace window', async () => {
    const registry = createOperationProgressRegistry();
    const first = registry.begin({ operationId, kind, steps });
    first.step('reserving', 'running');
    first.fail('CONTROL_LOCK_BUSY');

    const second = registry.begin({ operationId, kind, steps });
    second.step('reserving', 'running');
    const watching = collect(registry.watch(operationId, kind));
    await tick();
    second.complete({ ok: true });
    const events = await watching;

    expect(events[0]?.event).toMatchObject({ type: 'snapshot', status: 'running' });
    expect(events.map((item) => item.event.type)).not.toContain('failed');
    expect(events.at(-1)?.event).toMatchObject({ type: 'completed' });
    expect(registry.size()).toBe(1);
  });

  it('keeps a still running entry when begin() is called again (a concurrent replay)', async () => {
    const registry = createOperationProgressRegistry();
    const original = registry.begin({ operationId, kind, steps });
    original.step('reserving', 'running');
    registry.begin({ operationId, kind, steps }).fail('IGNORED');

    original.complete({ ok: true });
    const events = await collect(registry.watch(operationId, kind));
    expect(events.at(-1)?.event).toMatchObject({ type: 'completed' });
  });

  it('reports the outcome of a retained operation through peek()', () => {
    const registry = createOperationProgressRegistry();
    expect(registry.peek(operationId, kind)).toBeUndefined();
    const reporter = registry.begin({ operationId, kind, steps });
    expect(registry.peek(operationId, kind)).toEqual({ status: 'running' });
    reporter.fail('BASE_REF_NOT_FOUND');
    expect(registry.peek(operationId, kind)).toEqual({
      status: 'failed',
      code: 'BASE_REF_NOT_FOUND',
    });
  });

  it('replays the current snapshot to a late subscriber and then streams live events to the end', async () => {
    const registry = createOperationProgressRegistry();
    const reporter = registry.begin({ operationId, kind, steps });
    reporter.step('reserving', 'running');
    reporter.step('reserving', 'done');
    reporter.step('preparing-workspace', 'running');

    const watching = collect(registry.watch(operationId, kind));
    await tick();
    reporter.step('preparing-workspace', 'done');
    reporter.complete({ ok: true });
    const events = await watching;

    expect(events[0]?.event).toMatchObject({
      type: 'snapshot',
      status: 'running',
      currentStep: 'preparing-workspace',
      steps: [
        { id: 'reserving', status: 'done' },
        { id: 'preparing-workspace', status: 'running' },
        { id: 'writing-specification', status: 'pending' },
      ],
    });
    expect(events.map((item) => item.event.type)).toEqual([
      'snapshot',
      'step',
      'step',
      'completed',
    ]);
    expect(events.at(-1)?.event).toMatchObject({ type: 'completed', result: { ok: true } });
  });

  it('marks unfinished steps done before completing and ignores late reports after a terminal event', async () => {
    const registry = createOperationProgressRegistry();
    const reporter = registry.begin({ operationId, kind, steps });
    reporter.complete({ ok: 1 });
    reporter.step('reserving', 'running');
    reporter.fail('X');
    const events = await collect(registry.watch(operationId, kind));
    expect(events.map((item) => item.event.type)).toEqual(['snapshot', 'completed']);
    expect(events[0]?.event).toMatchObject({
      status: 'completed',
      steps: steps.map((id) => ({ id, status: 'done' })),
    });
  });

  it('uses strictly monotonic ids and resumes from Last-Event-ID without repeating events', async () => {
    const registry = createOperationProgressRegistry();
    const reporter = registry.begin({ operationId, kind, steps });
    reporter.step('reserving', 'running');
    const first = await collect(registry.watch(operationId, kind), 1);
    const lastId = first[0]!.id!;
    reporter.step('reserving', 'done');
    reporter.step('preparing-workspace', 'running');
    reporter.recoveryRequired();

    const resumed = await collect(registry.watch(operationId, kind, { lastEventId: lastId }));
    expect(resumed.map((item) => item.event.type)).toEqual(['step', 'step', 'recovery-required']);
    const ids = resumed.map((item) => item.id!);
    expect(ids[0]).toBeGreaterThan(lastId);
    expect(ids).toEqual([...ids].sort((a, b) => a - b));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('falls back to a snapshot when the resume id is unknown to the operation', async () => {
    const registry = createOperationProgressRegistry();
    const reporter = registry.begin({ operationId, kind, steps });
    reporter.fail('BRANCH_ALREADY_EXISTS');
    const events = await collect(registry.watch(operationId, kind, { lastEventId: 9999 }));
    expect(events.map((item) => item.event.type)).toEqual(['snapshot', 'failed']);
    expect(events[1]?.event).toMatchObject({ code: 'BRANCH_ALREADY_EXISTS' });
  });

  it('holds a subscription for an operation that is not reserved yet and starts when it is', async () => {
    const registry = createOperationProgressRegistry();
    const watching = collect(registry.watch(operationId, kind, { waitMs: 5000 }));
    await tick();
    const reporter = registry.begin({ operationId, kind, steps });
    reporter.step('reserving', 'running');
    reporter.complete({});
    const events = await watching;
    expect(events[0]?.event.type).toBe('snapshot');
    expect(events.at(-1)?.event.type).toBe('completed');
  });

  it('gives up on an operation that never starts with a code-only failure', async () => {
    vi.useFakeTimers();
    const registry = createOperationProgressRegistry();
    const watching = collect(registry.watch(operationId, kind, { waitMs: 30_000 }));
    await vi.advanceTimersByTimeAsync(30_001);
    const events = await watching;
    expect(events).toHaveLength(1);
    expect(events[0]?.event).toMatchObject({ type: 'failed', code: 'OPERATION_NOT_FOUND' });
    expect(events[0]?.id).toBeUndefined();
  });

  it('does not reveal an operation of a different kind', async () => {
    const registry = createOperationProgressRegistry();
    registry.begin({ operationId, kind, steps });
    const events = await collect(registry.watch(operationId, 'other-kind', { waitMs: 0 }));
    expect(events.map((item) => item.event)).toMatchObject([
      { type: 'failed', code: 'OPERATION_NOT_FOUND' },
    ]);
  });

  it('keys operations by (kind, operationId): the same id of two kinds is independent', async () => {
    const registry = createOperationProgressRegistry();
    const first = registry.begin({ operationId, kind, steps });
    const second = registry.begin({ operationId, kind: 'other-kind', steps: ['one'] });
    first.complete({ from: 'first' });
    second.fail('OTHER');
    expect(registry.size()).toBe(2);
    const a = await collect(registry.watch(operationId, kind));
    const b = await collect(registry.watch(operationId, 'other-kind'));
    expect(a.at(-1)?.event).toMatchObject({ type: 'completed', result: { from: 'first' } });
    expect(b.at(-1)?.event).toMatchObject({ type: 'failed', code: 'OTHER' });
  });

  it('stops a waiting subscriber when aborted', async () => {
    const registry = createOperationProgressRegistry();
    registry.begin({ operationId, kind, steps });
    const controller = new AbortController();
    const watching = collect(registry.watch(operationId, kind, { signal: controller.signal }));
    await tick();
    controller.abort();
    const events = await watching;
    expect(events.map((item) => item.event.type)).toEqual(['snapshot']);
  });

  it('keeps a finished operation for the grace period and then forgets it', async () => {
    vi.useFakeTimers();
    const registry = createOperationProgressRegistry({ graceMs: 1000 });
    registry.begin({ operationId, kind, steps }).complete({});
    expect(registry.size()).toBe(1);
    await vi.advanceTimersByTimeAsync(1001);
    expect(registry.size()).toBe(0);
  });

  it('treats a second begin of a known operation as a no-op owned by the first', async () => {
    const registry = createOperationProgressRegistry();
    const owner = registry.begin({ operationId, kind, steps });
    const replay = registry.begin({ operationId, kind, steps });
    replay.fail('CREATE_RECOVERY_REQUIRED');
    owner.step('reserving', 'running');
    owner.complete({});
    const events = await collect(registry.watch(operationId, kind));
    expect(events.at(-1)?.event.type).toBe('completed');
  });

  it('ignores unknown step ids and repeated statuses', async () => {
    const registry = createOperationProgressRegistry();
    const reporter = registry.begin({ operationId, kind, steps });
    reporter.step('git-initiated', 'running');
    reporter.step('reserving', 'running');
    reporter.step('reserving', 'running');
    const events = await collect(registry.watch(operationId, kind, { lastEventId: 0 }), 1);
    expect(events.map((item) => item.event.type)).toEqual(['step']);
  });
});

describe('operation progress registry listing', () => {
  function clock(start = '2026-10-20T10:00:00.000Z') {
    let at = Date.parse(start);

    return {
      now: () => new Date(at),
      advance: (ms: number) => {
        at += ms;
      },
    };
  }

  const id = (n: number) => `3f0a6d4e-8f2a-4b6e-9d0a-1c2b3d4e5f${String(n).padStart(2, '0')}`;

  it('lists a running operation with timestamps, steps and current step', () => {
    const time = clock();
    const registry = createOperationProgressRegistry({ now: time.now });
    const reporter = registry.begin({ operationId, kind, steps });
    reporter.step('reserving', 'running');
    time.advance(5000);
    reporter.step('reserving', 'done');
    reporter.step('preparing-workspace', 'running');

    expect(registry.list()).toEqual([
      {
        operationId,
        kind,
        status: 'running',
        steps: [
          { id: 'reserving', status: 'done' },
          { id: 'preparing-workspace', status: 'running' },
          { id: 'writing-specification', status: 'pending' },
        ],
        currentStep: 'preparing-workspace',
        startedAt: '2026-10-20T10:00:00.000Z',
        updatedAt: '2026-10-20T10:00:05.000Z',
      },
    ]);
  });

  it('keeps finished operations listed after the replay window, completed 10 min and failed 60 min', async () => {
    vi.useFakeTimers();
    const time = clock();
    const registry = createOperationProgressRegistry({ now: time.now, graceMs: 60_000 });
    registry.begin({ operationId: id(1), kind, steps }).complete({ ok: true });
    registry.begin({ operationId: id(2), kind, steps }).fail('COMMIT_BLOCKED');
    registry.begin({ operationId: id(3), kind, steps }).recoveryRequired();

    time.advance(61_000);
    await vi.advanceTimersByTimeAsync(61_000);
    // The replay window is over: peek and watch forget it, the listing does not.
    expect(registry.peek(id(1), kind)).toBeUndefined();
    expect(registry.size()).toBe(0);
    expect(registry.list().map((item) => [item.operationId, item.status, item.code])).toEqual([
      [id(1), 'completed', undefined],
      [id(2), 'failed', 'COMMIT_BLOCKED'],
      [id(3), 'recovery-required', undefined],
    ]);
    expect(registry.list()[0]?.finishedAt).toBe('2026-10-20T10:00:00.000Z');

    time.advance(10 * 60_000);
    expect(registry.list().map((item) => item.operationId)).toEqual([id(2), id(3)]);
    time.advance(50 * 60_000);
    expect(registry.list()).toEqual([]);
  });

  it('caps the finished operations kept for the listing, dropping the oldest', () => {
    const registry = createOperationProgressRegistry({ listCap: 3 });
    for (let n = 1; n <= 5; n += 1) {
      registry.begin({ operationId: id(n), kind, steps }).fail('X');
    }

    expect(registry.list().map((item) => item.operationId)).toEqual([id(3), id(4), id(5)]);
  });

  it('replaces the finished record when the same id runs again, and keeps kinds apart', () => {
    const registry = createOperationProgressRegistry();
    registry.begin({ operationId, kind, steps }).fail('X');
    registry.begin({ operationId, kind: 'other-kind', steps }).complete(1);
    const again = registry.begin({ operationId, kind, steps });
    expect(registry.list().map((item) => [item.kind, item.status])).toEqual([
      [kind, 'running'],
      ['other-kind', 'completed'],
    ]);
    again.complete(1);
    expect(registry.list().filter((item) => item.kind === kind)).toHaveLength(1);
  });

  it('returns copies: callers cannot change the registry', () => {
    const registry = createOperationProgressRegistry();
    registry.begin({ operationId, kind, steps }).step('reserving', 'running');
    const [item] = registry.list();
    (item!.steps as unknown as { status: string }[])[0]!.status = 'done';
    expect(registry.list()[0]?.steps[0]?.status).toBe('running');
  });
});

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
    if (events.length >= limit) break;
  }
  return events;
}

const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

afterEach(() => {
  vi.useRealTimers();
});

describe('operation progress registry', () => {
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

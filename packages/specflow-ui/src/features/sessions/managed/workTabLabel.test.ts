import { describe, expect, it } from 'vitest';
import type { ManagedSessionsApi } from './api';
import type { SessionFeed } from './feed';
import { createWorkInspector } from './WorkInspector';
import { workTurnNumber } from './workTabLabel';

const entries = ['t1', 't1', 't1', 't2', 't2', 't3'].map((turnId) => ({ turnId }));

describe('Work history tab identity', () => {
  it('numbers the Turns of the loaded conversation in order', () => {
    expect(workTurnNumber(entries, 't1')).toBe(1);
    expect(workTurnNumber(entries, 't2')).toBe(2);
    expect(workTurnNumber(entries, 't3')).toBe(3);
  });

  it('has no number for a Turn outside the loaded window (the tab keeps its plain name)', () => {
    expect(workTurnNumber(entries, 'older')).toBeUndefined();
    expect(workTurnNumber([], 't1')).toBeUndefined();
  });

  it('is one tab per Turn: the instance is the Turn, so every entry point of a Turn shares it', () => {
    const stack = createWorkInspector(
      {} as ManagedSessionsApi,
      { getSnapshot: () => ({}) } as unknown as SessionFeed,
      'owner',
    );

    expect(stack.instanceId?.({ sessionId: 's', turnId: 't1' })).toBe('t1');
    expect(stack.instanceId?.({ sessionId: 's', turnId: 't2' })).toBe('t2');
  });
});

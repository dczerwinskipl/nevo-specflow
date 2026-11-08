import { describe, expect, it } from 'vitest';
import {
  countActionOpened,
  countActionTransition,
  countWorkOpened,
  countWorkTransition,
  emptyWorkAggregate,
  hasToolActions,
} from './work-aggregate';

describe('Turn Work aggregate', () => {
  it('counts every opened Work by kind and only active Work as in progress', () => {
    let aggregate = emptyWorkAggregate();
    aggregate = countWorkOpened(aggregate, 'tool');
    aggregate = countWorkOpened(aggregate, 'reasoning');
    aggregate = countWorkOpened(aggregate, 'interaction');
    expect(aggregate.counts).toEqual({
      total: 3,
      inProgress: 3,
      byKind: { commentary: 0, reasoning: 1, interaction: 1, tool: 1 },
    });
    aggregate = countWorkTransition(aggregate, 'active', 'completed');
    aggregate = countWorkTransition(aggregate, 'active', 'waiting');
    expect(aggregate.counts.inProgress).toBe(1);
    aggregate = countWorkTransition(aggregate, 'waiting', 'active');
    expect(aggregate.counts.inProgress).toBe(2);
    const unchanged = countWorkTransition(aggregate, 'waiting', 'completed');
    expect(unchanged).toBe(aggregate);
    aggregate = countWorkTransition(aggregate, 'active', 'interrupted');
    aggregate = countWorkTransition(aggregate, 'active', 'failed');
    expect(aggregate.counts).toMatchObject({ total: 3, inProgress: 0 });
  });
  it('tallies every opened ToolAction as done and failures additionally, once', () => {
    let aggregate = emptyWorkAggregate();
    expect(hasToolActions(aggregate.digest)).toBe(false);
    aggregate = countActionOpened(aggregate, 'read');
    aggregate = countActionOpened(aggregate, 'read');
    aggregate = countActionOpened(aggregate, 'command');
    expect(hasToolActions(aggregate.digest)).toBe(true);
    const completed = countActionTransition(aggregate, 'read', 'active', 'completed');
    expect(completed).toBe(aggregate);
    aggregate = countActionTransition(aggregate, 'command', 'active', 'failed');
    expect(countActionTransition(aggregate, 'command', 'failed', 'failed')).toBe(aggregate);
    expect(aggregate.digest).toEqual({ done: { read: 2, command: 1 }, failed: { command: 1 } });
  });
});

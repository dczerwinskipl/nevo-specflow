import { describe, expect, it } from 'vitest';
import { isCurrentEntry, popEntry, pushEntry, replaceEntry, startFlow } from './secondaryNavigationModel';

const entry = (instanceKey: number) => ({ instanceKey });

describe('Secondary navigation model', () => {
  it('starts a new flow at one root, independent of the previous one', () => {
    const previous = pushEntry(startFlow(1, entry(1), 'spec-A'), entry(2));
    const next = startFlow(2, entry(3), 'spec-A');
    expect(next.entries).toEqual([entry(3)]);
    expect(previous.entries).toHaveLength(2);
  });

  it('pushes, replaces and pops without mutating old snapshots', () => {
    const root = startFlow(5, entry(1));
    const second = pushEntry(root, entry(2));
    const replaced = replaceEntry(second, entry(3));
    expect(root.entries).toEqual([entry(1)]);
    expect(second.entries).toEqual([entry(1), entry(2)]);
    expect(replaced.entries).toEqual([entry(1), entry(3)]);
    expect(popEntry(replaced)?.entries).toEqual([entry(1)]);
  });

  it('popping root closes the flow', () => {
    expect(popEntry(startFlow(5, entry(1)))).toBeNull();
  });

  it('does not accept an old callback after a new page or flow', () => {
    const previous = startFlow(5, entry(1));
    const next = pushEntry(previous, entry(2));
    expect(isCurrentEntry(next, 5, 1)).toBe(false);
    expect(isCurrentEntry(next, 5, 2)).toBe(true);
    expect(isCurrentEntry(startFlow(6, entry(3)), 5, 2)).toBe(false);
  });
});

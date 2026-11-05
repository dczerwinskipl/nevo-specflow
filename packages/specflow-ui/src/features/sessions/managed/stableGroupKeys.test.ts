import { describe, expect, it } from 'vitest';
import { assignGroupKeys } from './stableGroupKeys';
import { initialWorkViewState, isGroupOpen, setGroupOpen } from './workInspectorStore';

function rerender(
  first: readonly (readonly string[])[],
  next: readonly (readonly string[])[],
): string[] {
  return assignGroupKeys(next, assignGroupKeys(first, new Map()).byMember).keys;
}

describe('assignGroupKeys', () => {
  it('keys a new group by its first member', () => {
    expect(assignGroupKeys([['a', 'b'], ['c']], new Map()).keys).toEqual(['a', 'c']);
  });

  it('keeps a group key when an older page joins it at the front', () => {
    expect(rerender([['a', 'b'], ['c']], [['old-1', 'old-2', 'a', 'b'], ['c']])).toEqual([
      'a',
      'c',
    ]);
  });

  it('keeps a group key when items arrive at its end', () => {
    expect(rerender([['a', 'b']], [['a', 'b', 'c']])).toEqual(['a']);
  });

  it('gives the second half of a split group a key of its own', () => {
    expect(
      rerender(
        [['a', 'b', 'c', 'd']],
        [
          ['a', 'b'],
          ['c', 'd'],
        ],
      ),
    ).toEqual(['a', 'c']);
  });

  it('keeps keys unique among siblings when a fresh key is already taken', () => {
    // `x` keeps the split group's key `c`, so `c` itself cannot take its own id as a fresh key.
    expect(rerender([['c', 'x']], [['x'], ['c']])).toEqual(['c', 'c#1']);
  });
});

describe('tool group open state', () => {
  it('stays open while any of its tools was in an opened group', () => {
    const opened = setGroupOpen(initialWorkViewState(), ['a', 'b'], true);

    expect(isGroupOpen(opened, ['old', 'a', 'b'])).toBe(true);
    expect(isGroupOpen(opened, ['c', 'd'])).toBe(false);
  });

  it('forgets every tool of a group when it is closed', () => {
    const opened = setGroupOpen(initialWorkViewState(), ['a', 'b'], true);
    const closed = setGroupOpen(opened, ['old', 'a', 'b'], false);

    expect(isGroupOpen(closed, ['a'])).toBe(false);
    expect(closed.openGroups.size).toBe(0);
  });
});

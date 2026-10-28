import { describe, expect, it } from 'vitest';

import {
  BACKOFF_MAX_MS,
  ATTEMPT_COUNTER_CAP,
  backoffMs,
  countFailedAttempt,
  nextAttemptAt,
} from './backoff';
import { splitBatch } from './split';

describe('the retry schedule', () => {
  it('doubles from one second and stops at one minute', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(backoffMs)).toEqual([
      1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000, 60000, 60000,
    ]);
    expect(backoffMs(0)).toBe(1000);
    expect(backoffMs(500)).toBe(BACKOFF_MAX_MS);
  });

  it('never ends the retries: the counter saturates', () => {
    expect(countFailedAttempt(0)).toBe(1);
    expect(countFailedAttempt(ATTEMPT_COUNTER_CAP - 1)).toBe(ATTEMPT_COUNTER_CAP);
    expect(countFailedAttempt(ATTEMPT_COUNTER_CAP)).toBe(ATTEMPT_COUNTER_CAP);
  });

  it('adds the wait to the failure time', () => {
    expect(nextAttemptAt('2026-10-27T10:00:00.000Z', 3)).toBe('2026-10-27T10:00:04.000Z');
  });
});

describe('splitting a batch', () => {
  const member = (id: string, ...paths: string[]) => ({ operationId: id, paths });

  it('fails the members that touch a failing path and commits the rest', () => {
    const split = splitBatch([member('a', 'x'), member('b', 'y'), member('c', 'z')], ['y']);
    expect(split).toEqual({ failed: ['b'], rest: ['a', 'c'] });
  });

  it('fails every member that shares a path with a failed one, transitively', () => {
    const split = splitBatch(
      [member('a', 'x', 'y'), member('b', 'y', 'z'), member('c', 'z'), member('d', 'w')],
      ['x'],
    );
    expect(split).toEqual({ failed: ['a', 'b', 'c'], rest: ['d'] });
  });

  it('compares paths case-insensitively', () => {
    expect(splitBatch([member('a', 'Dir/A.md'), member('b', 'other.md')], ['dir/a.md'])).toEqual({
      failed: ['a'],
      rest: ['b'],
    });
  });

  it('does not split when nothing would be left, or nothing is touched', () => {
    expect(splitBatch([member('a', 'x'), member('b', 'x')], ['x'])).toBeUndefined();
    expect(splitBatch([member('a', 'x')], ['nope'])).toBeUndefined();
  });
});

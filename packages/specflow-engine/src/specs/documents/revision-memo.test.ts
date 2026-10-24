import { describe, expect, it } from 'vitest';

import { RevisionMemo, memoKey } from './revision-memo';

describe('RevisionMemo', () => {
  it('evicts the least recently used entry beyond its size', () => {
    const memo = new RevisionMemo<string>(3);
    memo.set('a', '1');
    memo.set('b', '2');
    memo.set('c', '3');
    expect(memo.get('a')).toBe('1'); // a is now the most recently used
    memo.set('d', '4');
    expect(memo.size).toBe(3);
    expect(memo.get('b')).toBeUndefined();
    expect(memo.get('a')).toBe('1');
    expect(memo.get('c')).toBe('3');
    expect(memo.get('d')).toBe('4');
  });

  it('replaces a value without growing', () => {
    const memo = new RevisionMemo<string>(2);
    memo.set('a', '1');
    memo.set('a', '2');
    expect(memo.size).toBe(1);
    expect(memo.get('a')).toBe('2');
  });

  it('keeps at most 5000 entries by default', () => {
    const memo = new RevisionMemo<number>();
    for (let index = 0; index < 5100; index += 1) memo.set(String(index), index);
    expect(memo.size).toBe(5000);
    expect(memo.get('0')).toBeUndefined();
    expect(memo.get('5099')).toBe(5099);
  });

  it('refuses an unusable size', () => {
    expect(() => new RevisionMemo(0)).toThrow(RangeError);
  });

  it('keys by path, size, mtime, ctime and inode', () => {
    const base = { size: 1n, mtimeNs: 2n, ctimeNs: 5n, ino: 3n };
    const key = memoKey('/p', base);
    expect(memoKey('/p', { ...base })).toBe(key);
    expect(memoKey('/q', base)).not.toBe(key);
    expect(memoKey('/p', { ...base, size: 2n })).not.toBe(key);
    expect(memoKey('/p', { ...base, mtimeNs: 3n })).not.toBe(key);
    expect(memoKey('/p', { ...base, ctimeNs: 6n })).not.toBe(key);
    expect(memoKey('/p', { ...base, ino: 4n })).not.toBe(key);
  });
});

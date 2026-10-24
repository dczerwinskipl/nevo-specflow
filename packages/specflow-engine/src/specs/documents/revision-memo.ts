import { REVISION_MEMO_MAX_ENTRIES } from './limits';

/**
 * Bounded LRU memo of file analyses (architecture "Limits", content-hash revision): keyed by
 * path+size+mtimeNs+ino, at most {@link REVISION_MEMO_MAX_ENTRIES} entries. Lets a repeated tree
 * read skip re-hashing files that did not change.
 */
export class RevisionMemo<T> {
  private readonly entries = new Map<string, T>();

  constructor(private readonly maxEntries: number = REVISION_MEMO_MAX_ENTRIES) {
    if (!Number.isInteger(maxEntries) || maxEntries < 1) {
      throw new RangeError('The revision memo needs a positive size.');
    }
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: string): T | undefined {
    const value = this.entries.get(key);
    if (value === undefined) return undefined;
    // Re-insert: a Map iterates in insertion order, so the first key is the least recently used.
    this.entries.delete(key);
    this.entries.set(key, value);
    return value;
  }

  set(key: string, value: T): void {
    this.entries.delete(key);
    this.entries.set(key, value);
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done) break;
      this.entries.delete(oldest.value);
    }
  }

  clear(): void {
    this.entries.clear();
  }
}

export function memoKey(
  path: string,
  stat: { readonly size: bigint; readonly mtimeNs: bigint; readonly ino: bigint },
): string {
  return `${path}\0${stat.size}\0${stat.mtimeNs}\0${stat.ino}`;
}

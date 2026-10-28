import type { BigIntStats } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import type { VerifiedFs } from '../../document-rules/verified-file';
import type { DocumentChangePlan, PlannedPath } from '../changes/plan/model';
import { planRemovesAnAliasedEntry } from './physical-aliases';

const SPEC = join('root', 'specs', 'active', 'demo');
const DIRECTORY = 'specs/active/demo';
const STATE = { sha256: 'a'.repeat(64), bytes: 1 };

/** A case-only rename `readme.md` -> `README.md`, as the planner makes it off Windows. */
const rename: Pick<DocumentChangePlan, 'directory' | 'paths'> = {
  directory: DIRECTORY,
  paths: [
    {
      path: `${DIRECTORY}/README.md`,
      role: 'document',
      pre: null,
      post: STATE,
      source: { kind: 'moved-from', path: `${DIRECTORY}/readme.md` },
    },
    {
      path: `${DIRECTORY}/readme.md`,
      role: 'document',
      pre: STATE,
      post: null,
      source: { kind: 'none' },
    },
  ] satisfies PlannedPath[],
};

function stat(ino: bigint, dev = 7n): BigIntStats {
  return { dev, ino, isFile: () => true, isSymbolicLink: () => false } as unknown as BigIntStats;
}

/** A fake file system: each listed name (relative to the Specification) has the stat given. */
function fakeFs(entries: Record<string, BigIntStats>): VerifiedFs & { readonly asked: string[] } {
  const asked: string[] = [];
  const byPath = new Map(Object.entries(entries).map(([name, value]) => [join(SPEC, name), value]));
  return {
    asked,
    lstat: (path) => {
      asked.push(path);
      const found = byPath.get(path);
      return found !== undefined
        ? Promise.resolve(found)
        : Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    },
    realpath: () => Promise.reject(new Error('not used')),
    open: () => Promise.reject(new Error('not used')),
  };
}

describe('planRemovesAnAliasedEntry', () => {
  it('accepts a case-only rename where the two spellings are different entries (case-sensitive)', async () => {
    // Before the rename only `readme.md` exists; the new spelling is absent.
    expect(await planRemovesAnAliasedEntry(fakeFs({ 'readme.md': stat(11n) }), SPEC, rename)).toBe(
      false,
    );
    // Both spellings exist as two files (distinct inodes): not one entry either.
    expect(
      await planRemovesAnAliasedEntry(
        fakeFs({ 'readme.md': stat(11n), 'README.md': stat(12n) }),
        SPEC,
        rename,
      ),
    ).toBe(false);
  });

  it('refuses when both spellings are one entry (a volume that ignores case, as on macOS)', async () => {
    const one = stat(11n);
    expect(
      await planRemovesAnAliasedEntry(fakeFs({ 'readme.md': one, 'README.md': one }), SPEC, rename),
    ).toBe(true);
  });

  it('compares the device too: the same inode on another device is another entry', async () => {
    expect(
      await planRemovesAnAliasedEntry(
        fakeFs({ 'readme.md': stat(11n, 1n), 'README.md': stat(11n, 2n) }),
        SPEC,
        rename,
      ),
    ).toBe(false);
  });

  it('falls back to a case-swapped probe where the volume reports no inode', async () => {
    // Inode 0 on both: the swapped spelling of the removed name is found, so the directory ignores case.
    const insensitive = fakeFs({
      'readme.md': stat(0n),
      'README.md': stat(0n),
      'README.MD': stat(0n),
    });
    expect(await planRemovesAnAliasedEntry(insensitive, SPEC, rename)).toBe(true);
    expect(insensitive.asked).toContain(join(SPEC, 'README.MD'));

    // Same names, but the swapped probe finds nothing: two entries of a case-sensitive directory.
    const sensitive = fakeFs({ 'readme.md': stat(0n), 'README.md': stat(0n) });
    expect(await planRemovesAnAliasedEntry(sensitive, SPEC, rename)).toBe(false);
    expect(sensitive.asked).toContain(join(SPEC, 'README.MD'));
  });

  it('does not probe paths that differ by more than their case', async () => {
    const plan: Pick<DocumentChangePlan, 'directory' | 'paths'> = {
      directory: DIRECTORY,
      paths: [{ ...rename.paths[0]!, path: `${DIRECTORY}/other.md` }, rename.paths[1]!],
    };
    const fs = fakeFs({ 'readme.md': stat(0n), 'other.md': stat(0n) });
    expect(await planRemovesAnAliasedEntry(fs, SPEC, plan)).toBe(false);
  });
});

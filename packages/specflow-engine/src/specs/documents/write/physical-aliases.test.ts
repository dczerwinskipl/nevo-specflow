import type { BigIntStats } from 'node:fs';
import { link, mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { nodeVerifiedFs } from '../../document-rules/verified-file';
import type { DocumentChangePlan, PlannedPath } from '../changes/plan/model';
import { nodeDocumentFileOps } from './file-effects';
import { planRemovesAnAliasedEntry, type AliasProbeFs } from './physical-aliases';

const SPEC = join('root', 'specs', 'active', 'demo');
const DIRECTORY = 'specs/active/demo';
const STATE = { sha256: 'a'.repeat(64), bytes: 1 };

type Plan = Pick<DocumentChangePlan, 'directory' | 'paths'>;

const write = (to: string, from: string): PlannedPath => ({
  path: `${DIRECTORY}/${to}`,
  role: 'document',
  pre: null,
  post: STATE,
  source: { kind: 'moved-from', path: `${DIRECTORY}/${from}` },
});
const removal = (path: string): PlannedPath => ({
  path: `${DIRECTORY}/${path}`,
  role: 'document',
  pre: STATE,
  post: null,
  source: { kind: 'none' },
});
const moves = (pairs: [string, string][]): Plan => ({
  directory: DIRECTORY,
  paths: [...pairs.map(([from, to]) => write(to, from)), ...pairs.map(([from]) => removal(from))],
});

/** A case-only rename `readme.md` -> `README.md`, as the planner makes it off Windows. */
const rename = moves([['readme.md', 'README.md']]);

function stat(ino: bigint, dev = 7n): BigIntStats {
  return { dev, ino, isFile: () => true, isSymbolicLink: () => false } as unknown as BigIntStats;
}

/**
 * A fake file system. `files` maps every spelling `lstat` finds (relative to the Specification) to its
 * stat; `stored` are the names the directories list (default: the keys of `files`). Directories are
 * the Specification and the parents of the files; each has its own inode unless `dirs` says otherwise.
 */
function fakeFs(
  files: Record<string, BigIntStats>,
  options: { stored?: string[]; dirs?: Record<string, BigIntStats> } = {},
): AliasProbeFs & { readonly asked: string[] } {
  const asked: string[] = [];
  const byPath = new Map(Object.entries(files).map(([name, value]) => [join(SPEC, name), value]));
  const dirs = new Map<string, BigIntStats>([[SPEC, stat(1n)]]);
  let next = 100n;
  for (const name of Object.keys(files)) {
    const parent = name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : '';
    if (parent !== '' && !dirs.has(join(SPEC, parent))) {
      dirs.set(join(SPEC, parent), options.dirs?.[parent] ?? stat((next += 1n)));
    }
  }

  const stored = options.stored ?? Object.keys(files);

  return {
    asked,
    lstat: (path) => {
      asked.push(path);
      const found = byPath.get(path) ?? dirs.get(path);

      return found !== undefined
        ? Promise.resolve(found)
        : Promise.reject(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    },
    list: (path) =>
      Promise.resolve(
        stored
          .filter(
            (name) =>
              join(SPEC, name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : '') === path,
          )
          .map((name) => name.slice(name.lastIndexOf('/') + 1)),
      ),
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
    const fs = fakeFs({ 'readme.md': one, 'README.md': one }, { stored: ['readme.md'] });
    expect(await planRemovesAnAliasedEntry(fs, SPEC, rename)).toBe(true);
  });

  it('refuses a folder rename that only changes case: every file is one entry under two names', async () => {
    const plan = moves([['Notes/a.md', 'notes/a.md']]);
    const one = stat(21n);
    const folder = stat(20n);
    const fs = fakeFs(
      { 'Notes/a.md': one, 'notes/a.md': one },
      { stored: ['Notes/a.md'], dirs: { Notes: folder, notes: folder } },
    );
    expect(await planRemovesAnAliasedEntry(fs, SPEC, plan)).toBe(true);
  });

  it('accepts a folder move of two hard links: one inode, two entries, nothing kept is removed', async () => {
    const plan = moves([
      ['docs/a.md', 'guides/a.md'],
      ['docs/b.md', 'guides/b.md'],
    ]);
    const shared = stat(31n);
    expect(
      await planRemovesAnAliasedEntry(
        fakeFs({ 'docs/a.md': shared, 'docs/b.md': shared }),
        SPEC,
        plan,
      ),
    ).toBe(false);
  });

  it('accepts removing one hard link while its twin is written: two entries in one directory', async () => {
    // `b.md` is a hard link of `a.md` and is saved (kept); `a.md` is renamed away.
    const shared = stat(41n);
    const plan: Plan = {
      directory: DIRECTORY,
      paths: [
        write('c.md', 'a.md'),
        { ...removal('b.md'), post: STATE, pre: STATE, source: { kind: 'payload' } },
        removal('a.md'),
      ],
    };
    expect(
      await planRemovesAnAliasedEntry(fakeFs({ 'a.md': shared, 'b.md': shared }), SPEC, plan),
    ).toBe(false);
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
    const plan: Plan = {
      directory: DIRECTORY,
      paths: [write('other.md', 'readme.md'), removal('readme.md')],
    };
    const fs = fakeFs({ 'readme.md': stat(0n), 'other.md': stat(0n) });
    expect(await planRemovesAnAliasedEntry(fs, SPEC, plan)).toBe(false);
  });
});

describe('planRemovesAnAliasedEntry on the real file system', () => {
  const roots: string[] = [];
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('accepts a folder move of two hard links (where the file system has hard links)', async () => {
    const root = await mkdtemp(join(tmpdir(), 'nevo-aliases-'));
    roots.push(root);
    const spec = join(root, ...DIRECTORY.split('/'));
    await mkdir(join(spec, 'docs'), { recursive: true });
    await writeFile(join(spec, 'docs', 'a.md'), 'x');
    try {
      await link(join(spec, 'docs', 'a.md'), join(spec, 'docs', 'b.md'));
    } catch {
      return; // No hard links here: nothing to prove.
    }

    const probe: AliasProbeFs = {
      lstat: (path) => nodeVerifiedFs.lstat(path),
      list: (path) => nodeDocumentFileOps.list(path),
    };
    const plan = moves([
      ['docs/a.md', 'guides/a.md'],
      ['docs/b.md', 'guides/b.md'],
    ]);
    expect(await planRemovesAnAliasedEntry(probe, spec, plan)).toBe(false);
    // The same folder renamed by its case alone is refused where the file system ignores case.
    const recased = moves([
      ['docs/a.md', 'Docs/a.md'],
      ['docs/b.md', 'Docs/b.md'],
    ]);
    const ignoresCase =
      (await nodeVerifiedFs.lstat(join(spec, 'DOCS')).catch(() => undefined)) !== undefined;
    expect(await planRemovesAnAliasedEntry(probe, spec, recased)).toBe(ignoresCase);
  });
});

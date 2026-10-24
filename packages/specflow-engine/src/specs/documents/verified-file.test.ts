import type { BigIntStats } from 'node:fs';
import type { FileHandle } from 'node:fs/promises';
import { join, sep } from 'node:path';

import { describe, expect, it } from 'vitest';

import { DocumentError } from './errors';
import {
  assertContainedRelativePath,
  inspectEntry,
  openVerifiedFile,
  type VerifiedFs,
} from './verified-file';

type Kind = 'file' | 'dir' | 'symlink' | 'fifo';

function stat(kind: Kind, ino: number, dev = 1): BigIntStats {
  return {
    isFile: () => kind === 'file',
    isDirectory: () => kind === 'dir',
    isSymbolicLink: () => kind === 'symlink',
    dev: BigInt(dev),
    ino: BigInt(ino),
    size: 5n,
    mtimeNs: 7n,
  } as unknown as BigIntStats;
}

function errno(code: string): NodeJS.ErrnoException {
  return Object.assign(new Error(code), { code });
}

const SPEC = join('/', 'ws', 'specs', 'active', 'demo');
const DOC = join(SPEC, 'a', 'doc.md');

interface Harness {
  readonly fs: VerifiedFs;
  readonly events: string[];
  readonly closed: { value: boolean };
  /** Mutable world: what lstat answers right now. */
  readonly world: Map<string, BigIntStats>;
  /** Mutable world: what realpath answers right now (identity when absent). */
  readonly real: Map<string, string>;
  /** Runs between the first check and the open, and after the open: lets a test swap the file. */
  readonly hooks: {
    beforeOpen?: () => void;
    afterOpen?: () => void;
    handleStat?: () => BigIntStats;
    open?: () => Promise<FileHandle>;
    realpath?: (path: string) => string;
  };
}

function harness(): Harness {
  const events: string[] = [];
  const closed = { value: false };
  const world = new Map<string, BigIntStats>([
    [SPEC, stat('dir', 1)],
    [join(SPEC, 'a'), stat('dir', 2)],
    [DOC, stat('file', 3)],
  ]);
  const real = new Map<string, string>();
  const hooks: Harness['hooks'] = {};
  const fs: VerifiedFs = {
    lstat(path) {
      events.push('lstat ' + path.slice(SPEC.length + 1).replaceAll(sep, '/'));
      const found = world.get(path);
      return found ? Promise.resolve(found) : Promise.reject(errno('ENOENT'));
    },
    realpath(path) {
      events.push('realpath');
      return Promise.resolve(hooks.realpath ? hooks.realpath(path) : (real.get(path) ?? path));
    },
    open(path) {
      events.push('open');
      if (hooks.open) return hooks.open();
      hooks.beforeOpen?.();
      if (!world.get(path)) return Promise.reject(errno('ENOENT'));
      const handle = {
        stat() {
          events.push('fstat');
          return Promise.resolve(hooks.handleStat ? hooks.handleStat() : world.get(path)!);
        },
        close() {
          closed.value = true;
          return Promise.resolve();
        },
      } as unknown as FileHandle;
      hooks.afterOpen?.();
      return Promise.resolve(handle);
    },
  };
  return { fs, events, closed, world, real, hooks };
}

describe('assertContainedRelativePath', () => {
  it.each([
    ['', 'empty'],
    ['/abs.md', 'absolute'],
    ['../x.md', 'traversal'],
    ['a/../x.md', 'inner traversal'],
    ['a//x.md', 'empty segment'],
    ['./x.md', 'dot segment'],
    ['a\\b.md', 'backslash'],
    ['a' + String.fromCharCode(0) + 'b.md', 'NUL'],
  ])('refuses %j (%s) as leaving the directory', (path) => {
    let thrown: unknown;
    try {
      assertContainedRelativePath(path);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(DocumentError);
    expect((thrown as DocumentError).code).toBe('SPEC_SOURCE_UNAVAILABLE');
    expect((thrown as DocumentError).message).not.toContain('ws');
  });

  it('returns the segments of a contained path', () => {
    expect(assertContainedRelativePath('a/b/c.md')).toEqual(['a', 'b', 'c.md']);
  });
});

describe('inspectEntry', () => {
  it('classifies a regular file, an absent path, a final symlink and a redirected ancestor', async () => {
    const h = harness();
    expect((await inspectEntry(h.fs, SPEC, 'a/doc.md')).state).toBe('file');
    expect((await inspectEntry(h.fs, SPEC, 'a/none.md')).state).toBe('absent');
    expect((await inspectEntry(h.fs, SPEC, 'nodir/doc.md')).state).toBe('absent');
    h.world.set(DOC, stat('symlink', 9));
    expect((await inspectEntry(h.fs, SPEC, 'a/doc.md')).state).toBe('not-regular');
    h.world.set(join(SPEC, 'a'), stat('symlink', 8));
    expect((await inspectEntry(h.fs, SPEC, 'a/doc.md')).state).toBe('redirected');
    h.world.set(join(SPEC, 'a'), stat('file', 8));
    expect((await inspectEntry(h.fs, SPEC, 'a/doc.md')).state).toBe('absent');
  });

  it('treats a directory or a special file at the final component as not regular', async () => {
    const h = harness();
    h.world.set(DOC, stat('dir', 4));
    expect((await inspectEntry(h.fs, SPEC, 'a/doc.md')).state).toBe('not-regular');
    h.world.set(DOC, stat('fifo', 4));
    expect((await inspectEntry(h.fs, SPEC, 'a/doc.md')).state).toBe('not-regular');
  });
});

describe('openVerifiedFile', () => {
  it('checks before opening and again after: lstat chain, realpath, open, fstat, lstat chain, realpath', async () => {
    const h = harness();
    const outcome = await openVerifiedFile(h.fs, SPEC, 'a/doc.md');
    expect(outcome.state).toBe('opened');
    expect(h.events).toEqual([
      'lstat a',
      'lstat a/doc.md',
      'realpath',
      'open',
      'fstat',
      'lstat a',
      'lstat a/doc.md',
      'realpath',
    ]);
    expect(h.closed.value).toBe(false);
  });

  it('never opens a symlinked entry', async () => {
    const h = harness();
    h.world.set(DOC, stat('symlink', 3));
    expect((await openVerifiedFile(h.fs, SPEC, 'a/doc.md')).state).toBe('not-regular');
    expect(h.events).not.toContain('open');
  });

  it('refuses a path whose ancestor is a symlink as leaving the directory, without opening', async () => {
    const h = harness();
    h.world.set(join(SPEC, 'a'), stat('symlink', 2));
    await expect(openVerifiedFile(h.fs, SPEC, 'a/doc.md')).rejects.toMatchObject({
      code: 'SPEC_SOURCE_UNAVAILABLE',
    });
    expect(h.events).not.toContain('open');
  });

  it('refuses a physical path different from the expected one, without opening', async () => {
    const h = harness();
    h.real.set(DOC, join('/', 'elsewhere', 'doc.md'));
    await expect(openVerifiedFile(h.fs, SPEC, 'a/doc.md')).rejects.toMatchObject({
      code: 'SPEC_SOURCE_UNAVAILABLE',
    });
    expect(h.events).not.toContain('open');
  });

  it('detects a file replaced by another file between the check and the open', async () => {
    const h = harness();
    h.hooks.handleStat = () => stat('file', 99); // a different inode answers fstat
    await expect(openVerifiedFile(h.fs, SPEC, 'a/doc.md')).rejects.toMatchObject({
      code: 'SPEC_SOURCE_UNAVAILABLE',
    });
    expect(h.closed.value).toBe(true);
  });

  it('detects a symlink swapped in after the open (second lstat)', async () => {
    const h = harness();
    h.hooks.afterOpen = () => h.world.set(DOC, stat('symlink', 3));
    await expect(openVerifiedFile(h.fs, SPEC, 'a/doc.md')).rejects.toMatchObject({
      code: 'SPEC_SOURCE_UNAVAILABLE',
    });
    expect(h.closed.value).toBe(true);
  });

  it('detects an ancestor swapped for a symlink after the open', async () => {
    const h = harness();
    h.hooks.afterOpen = () => h.world.set(join(SPEC, 'a'), stat('symlink', 2));
    await expect(openVerifiedFile(h.fs, SPEC, 'a/doc.md')).rejects.toMatchObject({
      code: 'SPEC_SOURCE_UNAVAILABLE',
    });
    expect(h.closed.value).toBe(true);
  });

  it('detects the physical path changing after the open', async () => {
    const h = harness();
    let calls = 0;
    h.hooks.realpath = (path) => {
      calls += 1;
      return calls === 1 ? path : join('/', 'elsewhere', 'doc.md');
    };
    await expect(openVerifiedFile(h.fs, SPEC, 'a/doc.md')).rejects.toMatchObject({
      code: 'SPEC_SOURCE_UNAVAILABLE',
    });
    expect(h.closed.value).toBe(true);
  });

  it('reports a failed open on a swapped symlink (O_NOFOLLOW, ELOOP) as a changed document', async () => {
    const h = harness();
    h.hooks.open = () => Promise.reject(errno('ELOOP'));
    await expect(openVerifiedFile(h.fs, SPEC, 'a/doc.md')).rejects.toMatchObject({
      code: 'SPEC_SOURCE_UNAVAILABLE',
    });
  });

  it('refuses a descriptor that is not a regular file (a FIFO swapped in)', async () => {
    const h = harness();
    h.hooks.handleStat = () => stat('fifo', 3);
    await expect(openVerifiedFile(h.fs, SPEC, 'a/doc.md')).rejects.toMatchObject({
      code: 'SPEC_SOURCE_UNAVAILABLE',
    });
    expect(h.closed.value).toBe(true);
  });

  it('reports a file removed before the open as absent', async () => {
    const h = harness();
    h.hooks.beforeOpen = () => h.world.delete(DOC);
    expect((await openVerifiedFile(h.fs, SPEC, 'a/doc.md')).state).toBe('absent');
  });

  it('reads a file with several hard links like any regular file', async () => {
    const h = harness();
    // A hard link is a regular directory entry: lstat reports a file, whatever nlink is.
    h.world.set(DOC, { ...stat('file', 3), nlink: 3n });
    expect((await openVerifiedFile(h.fs, SPEC, 'a/doc.md')).state).toBe('opened');
  });
});

describe('filesystem failures the layer cannot act on', () => {
  it('maps an errno failure (EACCES, EMFILE) to an unavailable source and leaves defects alone', async () => {
    for (const code of ['EACCES', 'EMFILE', 'EIO']) {
      const h = harness();
      h.fs.lstat = () => Promise.reject(errno(code));
      await expect(inspectEntry(h.fs, SPEC, 'a/doc.md')).rejects.toMatchObject({
        code: 'SPEC_SOURCE_UNAVAILABLE',
      });
      await expect(openVerifiedFile(h.fs, SPEC, 'a/doc.md')).rejects.toMatchObject({
        code: 'SPEC_SOURCE_UNAVAILABLE',
      });
    }
    const h = harness();
    h.fs.lstat = () => Promise.reject(new TypeError('defect'));
    await expect(inspectEntry(h.fs, SPEC, 'a/doc.md')).rejects.toBeInstanceOf(TypeError);
  });

  it('maps an EACCES on the open itself to an unavailable source', async () => {
    const h = harness();
    h.hooks.open = () => Promise.reject(errno('EACCES'));
    await expect(openVerifiedFile(h.fs, SPEC, 'a/doc.md')).rejects.toMatchObject({
      code: 'SPEC_SOURCE_UNAVAILABLE',
    });
  });
});

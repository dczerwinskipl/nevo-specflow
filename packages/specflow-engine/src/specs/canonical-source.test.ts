import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readTextPrefix } from './canonical-source';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function directory(): Promise<string> {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'overview-prefix-')));
  dirs.push(dir);

  return dir;
}

/** Symlinks need a privilege on Windows hosts; the check then runs on Linux CI only. */
async function trySymlink(target: string, path: string, type?: 'dir'): Promise<boolean> {
  try {
    await symlink(target, path, type);

    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EPERM') {
      return false;
    }

    throw error;
  }
}

describe('readTextPrefix (overview prefix)', () => {
  it('reads at most the bound and never the whole file', async () => {
    const dir = await directory();
    await writeFile(join(dir, 'overview.md'), 'a'.repeat(40_000));

    expect(await readTextPrefix(join(dir, 'overview.md'), 32 * 1024)).toHaveLength(32 * 1024);
  });

  it('drops a multi-byte character cut by the bound instead of decoding a replacement', async () => {
    const dir = await directory();
    const limit = 32 * 1024;
    // "ą" is two bytes: its first byte is the last byte inside the bound.
    await writeFile(join(dir, 'overview.md'), 'a'.repeat(limit - 1) + 'ą' + 'tail');
    const prefix = await readTextPrefix(join(dir, 'overview.md'), limit);

    expect(prefix).toBe('a'.repeat(limit - 1));
    expect(prefix).not.toContain('�');
  });

  it('is undefined for a missing file or a directory', async () => {
    const dir = await directory();
    await mkdir(join(dir, 'folder'));

    expect(await readTextPrefix(join(dir, 'missing.md'), 1024)).toBeUndefined();
    expect(await readTextPrefix(join(dir, 'folder'), 1024)).toBeUndefined();
  });

  it('is undefined for a symlinked or redirected overview', async () => {
    const dir = await directory();
    await writeFile(join(dir, 'elsewhere.md'), 'Secret text.');
    await mkdir(join(dir, 'real'));
    await writeFile(join(dir, 'real', 'overview.md'), 'Through a linked folder.');
    if (
      !(await trySymlink(join(dir, 'elsewhere.md'), join(dir, 'overview.md'))) ||
      !(await trySymlink(join(dir, 'real'), join(dir, 'linked'), 'dir'))
    ) {
      return;
    }

    expect(await readTextPrefix(join(dir, 'overview.md'), 1024)).toBeUndefined();
    expect(await readTextPrefix(join(dir, 'linked', 'overview.md'), 1024)).toBeUndefined();
  });
});

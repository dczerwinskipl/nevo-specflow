import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { readCheckedOutBranch } from './advisory-policy';

const dirs: string[] = [];
afterEach(async () => {
  await Promise.all(dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function temp(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'advisory-policy-'));
  dirs.push(dir);
  return dir;
}

describe('readCheckedOutBranch', () => {
  it('reads the branch of a primary checkout from .git/HEAD without a Git process', async () => {
    const root = await temp();
    await mkdir(join(root, '.git'));
    await writeFile(join(root, '.git', 'HEAD'), 'ref: refs/heads/feature/x-1\n');
    expect(await readCheckedOutBranch(root)).toBe('feature/x-1');
  });

  it('follows the gitdir file of a linked worktree (absolute and relative)', async () => {
    const root = await temp();
    const gitdir = join(root, 'main', '.git', 'worktrees', 'w');
    await mkdir(gitdir, { recursive: true });
    await writeFile(join(gitdir, 'HEAD'), 'ref: refs/heads/develop\n');
    const linked = join(root, 'linked');
    await mkdir(linked);
    await writeFile(join(linked, '.git'), `gitdir: ${gitdir}\n`);
    expect(await readCheckedOutBranch(linked)).toBe('develop');

    const relative = join(root, 'relative');
    await mkdir(relative);
    await writeFile(join(relative, '.git'), 'gitdir: ../main/.git/worktrees/w\n');
    expect(await readCheckedOutBranch(relative)).toBe('develop');
  });

  it('reports nothing for a detached HEAD, a missing HEAD or no .git at all', async () => {
    const detached = await temp();
    await mkdir(join(detached, '.git'));
    await writeFile(join(detached, '.git', 'HEAD'), '0123456789abcdef0123456789abcdef01234567\n');
    expect(await readCheckedOutBranch(detached)).toBeUndefined();

    const missing = await temp();
    await mkdir(join(missing, '.git'));
    expect(await readCheckedOutBranch(missing)).toBeUndefined();

    expect(await readCheckedOutBranch(await temp())).toBeUndefined();
  });

  it.skipIf(process.platform === 'win32')(
    'does not hang on a FIFO .git/HEAD or a FIFO .git file',
    async () => {
      const fifoHead = await temp();
      await mkdir(join(fifoHead, '.git'));
      execFileSync('mkfifo', [join(fifoHead, '.git', 'HEAD')]);
      expect(await readCheckedOutBranch(fifoHead)).toBeUndefined();

      const fifoDotGit = await temp();
      execFileSync('mkfifo', [join(fifoDotGit, '.git')]);
      expect(await readCheckedOutBranch(fifoDotGit)).toBeUndefined();
    },
    5000,
  );

  it('ignores an oversized HEAD', async () => {
    const root = await temp();
    await mkdir(join(root, '.git'));
    await writeFile(join(root, '.git', 'HEAD'), 'ref: refs/heads/' + 'a'.repeat(10_000));
    expect(await readCheckedOutBranch(root)).toBeUndefined();
  });
});

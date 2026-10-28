// Integration (real Git): the write preflight signature of a LINKED worktree covers the ignore rules
// and configuration that live in the common Git directory, not in the worktree's own one.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { SLOW_GIT_TEST_TIMEOUT_MS } from '../support/platform';

import type { ResolvedProjectHome } from '../../src/project/home/home';
import { readPreflightSignature } from '../../src/specs/documents/write/preflight-cache';
import { git } from '../support/git-project';

vi.setConfig({ testTimeout: SLOW_GIT_TEST_TIMEOUT_MS });

const bases: string[] = [];
afterEach(async () => {
  await Promise.all(bases.splice(0).map((base) => rm(base, { recursive: true, force: true })));
});

describe('the preflight signature of a linked worktree', () => {
  it('changes with the common info/exclude and per-worktree merge state, not only its own directory', async () => {
    const base = await mkdtemp(join(tmpdir(), 'preflight-worktree-'));
    bases.push(base);
    const main = join(base, 'main');
    const linked = join(base, 'linked');
    await mkdir(main, { recursive: true });
    git(main, 'init', '-q', '-b', 'main');
    git(
      main,
      '-c',
      'user.name=T',
      '-c',
      'user.email=t@example.invalid',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'init',
    );
    git(main, 'worktree', 'add', '-q', '-b', 'side', linked);
    const context = {
      project: { projectConfigPath: join(base, 'a'), localConfigPath: join(base, 'b') },
    } as unknown as ResolvedProjectHome;

    const before = await readPreflightSignature(context, linked);
    expect(before.branchRef).toBe('side');

    // The exclude file of the shared directory changes what the linked worktree ignores.
    const common = git(linked, 'rev-parse', '--path-format=absolute', '--git-common-dir');
    await mkdir(join(common, 'info'), { recursive: true });
    await writeFile(join(common, 'info', 'exclude'), 'specs/\n');
    const excluded = await readPreflightSignature(context, linked);
    expect(excluded.token).not.toBe(before.token);

    // Merge state is the worktree's own.
    const own = git(linked, 'rev-parse', '--path-format=absolute', '--git-dir');
    await writeFile(join(own, 'MERGE_HEAD'), 'a'.repeat(40) + '\n');
    expect((await readPreflightSignature(context, linked)).token).not.toBe(excluded.token);
  });
});

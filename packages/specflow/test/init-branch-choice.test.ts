import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import type { RuntimeSetupUi } from '@nevo/specflow-runtime';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  chooseBranchPattern,
  chooseIntegrationTargetBranch,
  chooseWorktreesRoot,
  expandHomeFolder,
} from '../src/init/prompts';

function git(root: string, ...args: string[]): void {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' });
}

function fakeUi(): { ui: RuntimeSetupUi; calls: { choices: string[]; initial?: string }[] } {
  const calls: { choices: string[]; initial?: string }[] = [];
  const ui = {
    select: (_message: string, choices: readonly { value: string }[], initial?: string) => {
      calls.push({ choices: choices.map((choice) => choice.value), initial });
      return Promise.resolve(initial ?? choices[0]!.value);
    },
  } as unknown as RuntimeSetupUi;
  return { ui, calls };
}

describe('chooseIntegrationTargetBranch', () => {
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'nevo-init-branch-'));
    git(root, 'init', '-b', 'trunk');
    git(root, 'config', 'user.email', 'test@example.com');
    git(root, 'config', 'user.name', 'Test');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('explains how to continue when the repository has no commits', async () => {
    const { ui, calls } = fakeUi();

    await expect(chooseIntegrationTargetBranch(ui, root)).rejects.toThrow(
      /unborn branch 'trunk'.*first commit/,
    );
    expect(calls).toEqual([]);
  });

  it('offers the existing local branches and preselects the current one', async () => {
    await writeFile(join(root, 'README.md'), '# test\n');
    git(root, 'add', '-A');
    git(root, 'commit', '-m', 'init');
    git(root, 'branch', 'develop');
    const { ui, calls } = fakeUi();

    const chosen = await chooseIntegrationTargetBranch(ui, root);

    expect(chosen).toBe('trunk');
    expect(calls).toHaveLength(1);
    expect([...calls[0]!.choices].sort()).toEqual(['develop', 'trunk']);
    expect(calls[0]!.initial).toBe('trunk');
  });
});

describe('chooseBranchPattern', () => {
  function scripted(answers: string[]): { ui: RuntimeSetupUi; notes: string[]; choices: string[] } {
    const notes: string[] = [];
    const choices: string[] = [];
    const ui = {
      select: (_m: string, c: readonly { value: string }[], initial?: string) => {
        choices.push(...c.map((item) => item.value));
        return Promise.resolve(answers.shift() ?? initial!);
      },
      input: () => Promise.resolve(answers.shift()!),
      note: (message: string) => notes.push(message),
    } as unknown as RuntimeSetupUi;
    return { ui, notes, choices };
  }

  it('preselects feature/{slug} and offers the presets', async () => {
    const { ui, choices } = scripted([]);
    expect(await chooseBranchPattern(ui)).toBe('feature/{slug}');
    expect(choices).toEqual([
      'feature/{slug}',
      'feature/{slug}-{shortId}',
      'spec/{slug}-{shortId}',
      '__custom__',
    ]);
  });

  it('returns a chosen preset', async () => {
    expect(await chooseBranchPattern(scripted(['spec/{slug}-{shortId}']).ui)).toBe(
      'spec/{slug}-{shortId}',
    );
  });

  it('re-asks a custom pattern until the Engine validator accepts it', async () => {
    const { ui, notes } = scripted(['__custom__', 'static-name', 'topic/{slug}']);
    expect(await chooseBranchPattern(ui)).toBe('topic/{slug}');
    expect(notes).toHaveLength(1);
  });

  it('gives up after repeated invalid custom patterns', async () => {
    const { ui } = scripted(['__custom__', 'a', 'b', 'c']);
    await expect(chooseBranchPattern(ui)).rejects.toThrow(/No valid branch pattern/);
  });
});

describe('chooseWorktreesRoot', () => {
  const root = join(tmpdir(), 'nevo-init-root', 'repo');
  const fallback = join(tmpdir(), 'nevo-init-root', 'repo-worktrees');

  function scripted(answers: string[]): {
    ui: RuntimeSetupUi;
    notes: string[];
    defaults: unknown[];
  } {
    const notes: string[] = [];
    const defaults: unknown[] = [];
    const ui = {
      input: (_m: string, def?: string) => {
        defaults.push(def);
        return Promise.resolve(answers.shift() ?? def!);
      },
      note: (message: string) => notes.push(message),
    } as unknown as RuntimeSetupUi;
    return { ui, notes, defaults };
  }

  it('shows <repo>-worktrees as the default and stores nothing when it is kept', async () => {
    const { ui, defaults } = scripted([]);
    expect(await chooseWorktreesRoot(ui, root)).toBeUndefined();
    expect(defaults).toEqual([fallback]);
  });

  it('accepts a relative or an absolute folder outside the repository', async () => {
    expect(await chooseWorktreesRoot(scripted(['../trees']).ui, root)).toBe('../trees');
    const absolute = join(tmpdir(), 'elsewhere-trees');
    expect(await chooseWorktreesRoot(scripted([absolute]).ui, root)).toBe(absolute);
  });

  it('expands ~ to the home folder instead of treating it as a folder inside the repository', async () => {
    const stored = await chooseWorktreesRoot(scripted(['~/nevo-trees']).ui, root);
    expect(stored).toBe(join(homedir(), 'nevo-trees'));
    expect(expandHomeFolder('~', '/home/me')).toBe('/home/me');
    expect(expandHomeFolder('~x/a', '/home/me')).toBe('~x/a');
  });

  it('rejects a folder inside the working tree or .git and asks again', async () => {
    const { ui, notes } = scripted(['inside', '.git/trees', '../ok']);
    expect(await chooseWorktreesRoot(ui, root)).toBe('../ok');
    expect(notes).toHaveLength(2);
  });

  it('gives up after repeated invalid folders', async () => {
    await expect(chooseWorktreesRoot(scripted(['a', 'b', 'c']).ui, root)).rejects.toThrow(
      /No valid worktree folder/,
    );
  });
});

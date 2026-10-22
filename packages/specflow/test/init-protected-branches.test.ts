import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { parseCommitsPolicy } from '@nevo/specflow-engine';
import type { RuntimeSetupUi } from '@nevo/specflow-runtime';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createProjectInitCommand } from '../src/init/cli';
import {
  chooseProtectedBranches,
  integrationTargetProtectedNote,
  protectedBranchPatternProblem,
} from '../src/init/prompts';

function git(root: string, ...args: string[]): void {
  execFileSync('git', args, { cwd: root, stdio: 'ignore' });
}

interface Scripted {
  readonly ui: RuntimeSetupUi;
  readonly confirms: string[];
  readonly inputs: string[];
  readonly notes: { message: string; title?: string }[];
}

/** The fake UI approach of the other init tests: answers are queued per prompt kind, in order. */
function scripted(answers: { confirm?: boolean[]; input?: string[]; select?: string[] }): Scripted {
  const confirm = [...(answers.confirm ?? [])];
  const input = [...(answers.input ?? [])];
  const select = [...(answers.select ?? [])];
  const confirms: string[] = [];
  const inputs: string[] = [];
  const notes: { message: string; title?: string }[] = [];
  const ui = {
    confirm: (message: string, initial?: boolean) => {
      confirms.push(message);
      return Promise.resolve(confirm.shift() ?? initial ?? false);
    },
    input: (message: string, def?: string) => {
      inputs.push(message);
      return Promise.resolve(input.shift() ?? def ?? '');
    },
    select: (_message: string, choices: readonly { value: string }[], initial?: string) =>
      Promise.resolve(select.shift() ?? initial ?? choices[0]!.value),
    note: (message: string, title?: string) => notes.push({ message, title }),
  } as unknown as RuntimeSetupUi;
  return { ui, confirms, inputs, notes };
}

let root: string;

async function repository(...branches: string[]): Promise<void> {
  root = await mkdtemp(join(tmpdir(), 'nevo-init-protected-'));
  git(root, 'init', '-b', branches[0] ?? 'trunk');
  git(root, 'config', 'user.email', 'test@example.com');
  git(root, 'config', 'user.name', 'Test');
  await writeFile(join(root, 'README.md'), '# test\n');
  git(root, 'add', '-A');
  git(root, 'commit', '-m', 'init');
  for (const branch of branches.slice(1)) git(root, 'branch', branch);
}

beforeEach(() => {
  root = '';
});
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
});

describe('protectedBranchPatternProblem', () => {
  it.each(['main', 'release/**', 'feature/*', 'v?.x', 'rel-[0-9]*', '**'])(
    'accepts %s',
    (pattern) => {
      expect(protectedBranchPatternProblem(pattern)).toBeUndefined();
    },
  );
  it.each([
    ['', /Enter a branch name/],
    ['bad name', /characters that are not allowed/],
    ['/main', /layout that is not allowed/],
    ['a//b', /layout that is not allowed/],
    ['refs/heads/main', /layout that is not allowed/],
    ['release/[', /layout that is not allowed/],
    ['x'.repeat(201), /too long/],
  ])('rejects %j with a plain reason', (pattern, reason) => {
    expect(protectedBranchPatternProblem(pattern)).toMatch(reason);
  });

  it.each(['.release', '_x', '-x', 'v1.', 'a/.b'])(
    'rejects the wildcard-free entry %j that the Engine policy parser would reject',
    (pattern) => {
      expect(protectedBranchPatternProblem(pattern)).toMatch(/valid branch name/);
      expect(() => parseCommitsPolicy({ protectedBranches: [pattern] })).toThrow();
    },
  );

  it('round trip: every pattern init accepts parses as a git.commits policy', () => {
    const candidates = [
      'main',
      'release/**',
      'feature/*',
      'v?.x',
      'rel-[0-9]*',
      '**',
      '.release',
      '_x',
      '-x',
      'v1.',
      'a/.b',
      'a.b',
      'a-b/c_d',
      '*.x',
      '.*',
      'x'.repeat(200),
    ];
    const accepted = candidates.filter(
      (pattern) => protectedBranchPatternProblem(pattern) === undefined,
    );
    expect(accepted).toContain('main');
    expect(() => parseCommitsPolicy({ protectedBranches: accepted })).not.toThrow();
  });
});

describe('chooseProtectedBranches', () => {
  it('offers main and master only when they exist locally and keeps them by default', async () => {
    await repository('main', 'master', 'develop');
    const { ui, confirms } = scripted({});
    const result = await chooseProtectedBranches(ui, root);
    expect(result).toEqual(['main', 'master']);
    expect(confirms).toHaveLength(3);
    expect(confirms[0]).toContain("'main'");
    expect(confirms[1]).toContain("'master'");
    // The last question is the custom one, defaulting to "no".
    expect(confirms[2]).toContain('Protect another branch or pattern');
  });

  it('does not offer a suggestion that does not exist', async () => {
    await repository('trunk', 'develop');
    const { ui, confirms } = scripted({});
    expect(await chooseProtectedBranches(ui, root)).toEqual([]);
    expect(confirms).toHaveLength(1);
    expect(confirms[0]).toContain('nothing is protected yet');
  });

  it('protects nothing when the owner declines everything', async () => {
    await repository('main');
    expect(await chooseProtectedBranches(scripted({ confirm: [false, false] }).ui, root)).toEqual(
      [],
    );
  });

  it('collects custom patterns, validating each with the Engine rule', async () => {
    await repository('main');
    const { ui, notes, inputs } = scripted({
      confirm: [true, true, true, true, true, false],
      input: ['release/**', 'bad name', 'release/**', '  hotfix-[0-9]*  '],
    });
    const result = await chooseProtectedBranches(ui, root);
    expect(result).toEqual(['main', 'release/**', 'hotfix-[0-9]*']);
    expect(inputs).toHaveLength(4);
    expect(notes.map((note) => note.title)).toEqual(['Invalid pattern', 'Already listed']);
  });
});

describe('integrationTargetProtectedNote', () => {
  it('explains the consequence when the integration target is protected', () => {
    expect(integrationTargetProtectedNote('main', ['main'])).toMatch(
      /cannot commit specifications directly on it/,
    );
    expect(integrationTargetProtectedNote('release/1', ['release/**'])).toBeDefined();
  });
  it('says nothing when the target is not protected', () => {
    expect(integrationTargetProtectedNote('develop', ['main', 'release/**'])).toBeUndefined();
    expect(integrationTargetProtectedNote('main', [])).toBeUndefined();
  });
});

describe('init command', { timeout: 120_000 }, () => {
  async function runInit(ui: Scripted, stdout: string[] = []): Promise<void> {
    const command = createProjectInitCommand({
      cwd: root,
      stdout: (line) => stdout.push(line),
      ui: ui.ui,
      initRuntime: () => Promise.resolve({ projectConfig: {}, localConfig: {}, summary: [] }),
    });
    await command.parseAsync([], { from: 'user' });
  }

  it('asks the Git questions in order and writes protected branches to the PROJECT config', async () => {
    await repository('main', 'develop');
    const ui = scripted({
      // git enabled; protect main; custom pattern yes; (second custom: no); write configuration.
      confirm: [true, true, true, false, true],
      select: ['develop'],
      input: ['', 'release/**'],
    });
    // Worktrees root keeps its default answer (the first input), then the custom pattern.
    await runInit(ui);

    const project = await readFile(join(root, '.nevo', 'config.yaml'), 'utf8');
    expect(project).toContain('commits:');
    expect(project).toContain('protectedBranches:');
    expect(project).toContain('- main');
    expect(project).toContain('- release/**');
    const local = await readFile(join(root, '.nevo', 'local', 'config.yaml'), 'utf8');
    expect(local).not.toContain('protectedBranches');

    const review = ui.notes.find((note) => note.title === 'Review')!.message;
    expect(review).toContain('Protected branches: main, release/**');
    // The integration target (develop) is not protected: no extra note.
    expect(review).not.toContain('cannot commit specifications directly');
  });

  it('writes no commits block when nothing is protected and says so in the review', async () => {
    await repository('trunk');
    const ui = scripted({ confirm: [true, false, true], select: ['trunk'] });
    await runInit(ui);

    const project = await readFile(join(root, '.nevo', 'config.yaml'), 'utf8');
    expect(project).not.toContain('commits');
    expect(project).not.toContain('protectedBranches');
    expect(ui.notes.find((note) => note.title === 'Review')!.message).toContain(
      'Protected branches: none',
    );
  });

  it('allows a protected integration target and explains what that means', async () => {
    await repository('main');
    const ui = scripted({ confirm: [true, true, false, true], select: ['main'] });
    await runInit(ui);

    const project = await readFile(join(root, '.nevo', 'config.yaml'), 'utf8');
    expect(project).toContain('integrationTargetBranch: main');
    expect(project).toContain('- main');
    expect(ui.notes.find((note) => note.title === 'Review')!.message).toContain(
      "The integration branch 'main' is protected: Nevo cannot commit specifications directly on it",
    );
  });

  it('asks nothing about protection when Git is not enabled', async () => {
    await repository('main');
    const ui = scripted({ confirm: [false, true] });
    await runInit(ui);

    const project = await readFile(join(root, '.nevo', 'config.yaml'), 'utf8');
    expect(project).not.toContain('commits');
    expect(ui.confirms.some((message) => message.includes('Protect'))).toBe(false);
  });
});

import { channel } from 'node:diagnostics_channel';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  bootstrapProjectHome,
  createSpecificationForTesting as createSpecification,
  inspectCreateSpecification,
  type CreateSpecificationInput,
  type SpecFlowEngine,
  installDefinitionsForTesting,
} from '../../src/testing';
import { CREATE_JOURNAL_RELATIVE_DIR } from '../../src/specs/create/journal';
import { commitStaged, createGitTestProject, git } from '../support/git-project';

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })),
  );
});

const BASE_CONFIG = 'runtime: {}\ngit:\n  enabled: true\n';

async function project(
  config = BASE_CONFIG,
  branch = 'develop',
): Promise<{ root: string; engine: SpecFlowEngine }> {
  const root = await createGitTestProject('specflow-create-commit-', config);
  roots.push(root, root + '-worktrees');
  git(root, 'checkout', '-q', '-b', branch);
  const engine = await bootstrapProjectHome(root);
  // The definitions are installed (and committed) up front, so a test that notes HEAD before its first
  // Create sees the commit of the Create alone. A refusal (protected branch) surfaces from the Create.
  await installDefinitionsForTesting(engine).catch(() => undefined);
  return { root, engine };
}

const existing = (engine: SpecFlowEngine, title = 'Commit scaffold'): CreateSpecificationInput => ({
  operationId: randomUUID(),
  title,
  created: '2026-10-14',
  archetype: { id: 'minimal', version: 1 },
  target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
});

const linked = (title = 'Linked commit', branch?: string): CreateSpecificationInput => ({
  operationId: randomUUID(),
  title,
  created: '2026-10-14',
  archetype: { id: 'minimal', version: 1 },
  target: { kind: 'new-worktree', baseRef: 'HEAD', ...(branch ? { branch } : {}) },
});

const committedPaths = (root: string, sha: string): string[] =>
  git(root, 'diff-tree', '--no-commit-id', '--name-only', '-r', sha).split('\n').sort();

async function journalFiles(engine: SpecFlowEngine): Promise<string[]> {
  return readdir(join(engine.context.project.stateRoot, CREATE_JOURNAL_RELATIVE_DIR)).catch(
    () => [],
  );
}

class Crash extends Error {}

describe('Create commits the scaffold when Git is enabled', () => {
  it('commits exactly the scaffold on the current branch and leaves a clean checkout', async () => {
    const { root, engine } = await project();
    const parent = git(root, 'rev-parse', 'HEAD');
    const input = existing(engine);
    const stages: string[] = [];
    const created = await createSpecification(engine, input, {
      onStage: ({ stage }) => stages.push(stage),
    });

    expect(git(root, 'rev-list', '--count', parent + '..HEAD')).toBe('1');
    const sha = git(root, 'rev-parse', 'HEAD');
    expect(committedPaths(root, sha)).toEqual([
      'specs/active/commit-scaffold/overview.md',
      'specs/active/commit-scaffold/specification.yaml',
    ]);
    expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');
    expect(git(root, 'log', '-1', '--format=%s', sha)).toBe('spec(create): commit-scaffold');
    expect(git(root, 'log', '-1', '--format=%B', sha)).toContain(
      'Nevo-Operation: ' + input.operationId,
    );
    const journal = await inspectCreateSpecification(engine, input.operationId);
    expect(journal?.stage).toBe('completed');
    expect(journal?.commit).toMatchObject({
      required: true,
      branch: 'develop',
      parentHead: parent,
      commitSha: sha,
    });
    expect(stages).toEqual(
      expect.arrayContaining(['manifest-written', 'commit-writing', 'commit-written']),
    );
    expect(stages.indexOf('commit-written')).toBeLessThan(stages.indexOf('registry-writing'));

    // A completed Create retried later never touches Git.
    expect(await createSpecification(engine, input)).toEqual(created);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(sha);
  }, 240000);

  it('does not sweep the user staged, unstaged or untracked work into the commit', async () => {
    const { root, engine } = await project();
    await writeFile(join(root, 'notes.txt'), 'one\n');
    git(root, 'add', 'notes.txt');
    git(root, '-c', 'user.name=T', '-c', 'user.email=t@e.invalid', 'commit', '-qm', 'notes');
    await writeFile(join(root, 'notes.txt'), 'one\nstaged\n');
    git(root, 'add', 'notes.txt');
    await writeFile(join(root, 'notes.txt'), 'one\nstaged\nunstaged\n');
    await writeFile(join(root, 'scratch.txt'), 'untracked\n');

    const sha = (await commitOf(root, engine)).sha;

    expect(committedPaths(root, sha)).not.toContain('notes.txt');
    expect(git(root, 'diff', '--cached', '--name-only')).toBe('notes.txt');
    expect(
      git(root, 'status', '--porcelain=v1', '--untracked-files=all').split('\n').sort(),
    ).toEqual(['?? scratch.txt', 'MM notes.txt'].sort());
  }, 240000);

  it('authors with the configured user and commits as the Engine', async () => {
    const { root, engine } = await project();
    git(root, 'config', 'user.name', 'Grace Hopper');
    git(root, 'config', 'user.email', 'grace@example.invalid');
    const { sha } = await commitOf(root, engine);
    expect(git(root, 'log', '-1', '--format=%an <%ae>|%cn <%ce>', sha)).toBe(
      'Grace Hopper <grace@example.invalid>|Nevo SpecFlow Engine <engine@nevo.invalid>',
    );
  }, 240000);

  it('commits the new-worktree scaffold on the new branch, one commit on top of the base', async () => {
    const { root, engine } = await project();
    const base = git(root, 'rev-parse', 'HEAD');
    const input = linked();
    const created = await createSpecification(engine, input);
    roots.push(dirname(created.workspaceRoot));

    // The default pattern feature/{key}-{slug} carries the Specification key.
    expect(git(created.workspaceRoot, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(
      'feature/nevo-1-linked-commit',
    );
    expect(git(created.workspaceRoot, 'rev-parse', 'HEAD~1')).toBe(base);
    expect(committedPaths(created.workspaceRoot, 'HEAD')).toEqual([
      'specs/active/linked-commit/overview.md',
      'specs/active/linked-commit/specification.yaml',
    ]);
    expect(git(created.workspaceRoot, 'status', '--porcelain', '--untracked-files=all')).toBe('');
    // The origin checkout is untouched.
    expect(git(root, 'rev-parse', 'HEAD')).toBe(base);
    expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');
    const journal = await inspectCreateSpecification(engine, created.operationId);
    expect(journal?.commit).toMatchObject({
      branch: 'feature/nevo-1-linked-commit',
      parentHead: base,
      commitSha: git(created.workspaceRoot, 'rev-parse', 'HEAD'),
    });
    // A later retry still verifies the advanced worktree.
    expect((await createSpecification(engine, input)).specId).toBe(created.specId);
  }, 240000);

  it('lets two Creates in one checkout both commit', async () => {
    const { root, engine } = await project();
    const parent = git(root, 'rev-parse', 'HEAD');
    await Promise.all([
      createSpecification(engine, existing(engine, 'First parallel')),
      createSpecification(engine, existing(engine, 'Second parallel')),
    ]);
    expect(git(root, 'rev-list', '--count', parent + '..HEAD')).toBe('2');
    expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');
  }, 240000);
});

async function commitOf(root: string, engine: SpecFlowEngine): Promise<{ sha: string }> {
  await createSpecification(engine, existing(engine));
  return { sha: git(root, 'rev-parse', 'HEAD') };
}

describe('protected branches', () => {
  const protect = (patterns: string) =>
    BASE_CONFIG + '  commits:\n    protectedBranches: ' + patterns + '\n';

  it.each([
    ['protected', protect('[develop]')],
    ['protected by pattern', protect('["dev*"]')],
    ['not on the allow-list', BASE_CONFIG + '  commits:\n    allowedBranches: ["release/**"]\n'],
  ])(
    'refuses a current branch that is %s before anything is written',
    async (_name, config) => {
      const { root, engine } = await project(config);
      const parent = git(root, 'rev-parse', 'HEAD');
      await expect(createSpecification(engine, existing(engine))).rejects.toMatchObject({
        code: 'BRANCH_PROTECTED',
      });
      expect(git(root, 'rev-parse', 'HEAD')).toBe(parent);
      expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');
      expect(await journalFiles(engine)).toEqual([]);
      expect((await engine.readRegistry()).specBindings).toHaveLength(0);
    },
    240000,
  );

  it('refuses a protected generated new-worktree branch name, never renames, and accepts a typed one', async () => {
    const { root, engine } = await project(protect('["feature/**"]'));
    await expect(createSpecification(engine, linked())).rejects.toMatchObject({
      code: 'BRANCH_PROTECTED',
    });
    expect(await journalFiles(engine)).toEqual([]);
    expect(git(root, 'worktree', 'list', '--porcelain').match(/worktree /gu)).toHaveLength(1);
    expect(git(root, 'branch', '--list', 'feature/*')).toBe('');
    // A typed protected name is refused the same way; another name works.
    await expect(
      createSpecification(engine, linked('Typed protected', 'feature/typed')),
    ).rejects.toMatchObject({ code: 'BRANCH_PROTECTED' });
    const created = await createSpecification(engine, linked('Typed free', 'topic/typed'));
    roots.push(dirname(created.workspaceRoot));
    expect(git(created.workspaceRoot, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('topic/typed');
  }, 240000);

  it('does not evaluate the base ref: a new worktree from a protected branch is fine', async () => {
    // The definitions are installed while the branch is still free; the owner protects it afterwards.
    const { engine, root } = await project();
    await writeFile(join(root, '.nevo/config.yaml'), protect('[develop]'));
    git(root, 'add', '.nevo/config.yaml');
    commitStaged(root, 'protect develop');
    const created = await createSpecification(engine, linked());
    roots.push(dirname(created.workspaceRoot));
    expect(git(created.workspaceRoot, 'rev-list', '--count', 'develop..HEAD')).toBe('1');
    expect(git(root, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('develop');
  }, 240000);

  it('answers COMMIT_BLOCKED for a detached HEAD without writing anything', async () => {
    const { root, engine } = await project();
    git(root, 'checkout', '-q', '--detach');
    await expect(createSpecification(engine, existing(engine))).rejects.toMatchObject({
      code: 'COMMIT_BLOCKED',
    });
    expect(await journalFiles(engine)).toEqual([]);
    expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');
  }, 240000);

  it('answers COMMIT_BLOCKED when the scaffold path is ignored', async () => {
    const { root, engine } = await project();
    await writeFile(join(root, '.git/info/exclude'), 'specs/\n');
    await expect(createSpecification(engine, existing(engine))).rejects.toMatchObject({
      code: 'COMMIT_BLOCKED',
    });
    expect(await journalFiles(engine)).toEqual([]);
  }, 240000);
});

describe('crash recovery and replay at commit-writing', () => {
  const crashAfter =
    (effect: 'manifest' | 'commit') =>
    (current: string): Promise<void> =>
      current === effect
        ? Promise.reject(new Crash('simulated crash after ' + effect))
        : Promise.resolve();

  it('resumes after a crash between the Git commit and the journal and does not commit twice', async () => {
    const { root, engine } = await project();
    const parent = git(root, 'rev-parse', 'HEAD');
    const input = existing(engine);
    await expect(
      createSpecification(engine, input, { afterEffect: crashAfter('commit') }),
    ).rejects.toBeInstanceOf(Crash);

    const stuck = await inspectCreateSpecification(engine, input.operationId);
    expect(stuck?.stage).toBe('commit-writing');
    expect(stuck?.commit?.parentHead).toBe(parent);
    expect(stuck?.commit?.commitSha).toBeUndefined();
    expect(git(root, 'rev-list', '--count', parent + '..HEAD')).toBe('1');
    // A normal re-submit is only a reader: a clear recovery code, no new work.
    await expect(createSpecification(engine, input)).rejects.toMatchObject({
      code: 'CREATE_RECOVERY_REQUIRED',
    });
    expect(git(root, 'rev-list', '--count', parent + '..HEAD')).toBe('1');

    const resumed = await createSpecification(engine, input, { resumeInterruptedOperation: true });
    expect(resumed.operationId).toBe(input.operationId);
    expect(git(root, 'rev-list', '--count', parent + '..HEAD')).toBe('1');
    const done = await inspectCreateSpecification(engine, input.operationId);
    expect(done?.stage).toBe('completed');
    expect(done?.commit?.commitSha).toBe(git(root, 'rev-parse', 'HEAD'));
  }, 240000);

  it('commits exactly once when the crash happened before the Git commit', async () => {
    const { root, engine } = await project();
    const parent = git(root, 'rev-parse', 'HEAD');
    const input = existing(engine);
    await expect(
      createSpecification(engine, input, { afterEffect: crashAfter('manifest') }),
    ).rejects.toBeInstanceOf(Crash);
    expect(git(root, 'rev-list', '--count', parent + '..HEAD')).toBe('0');
    await createSpecification(engine, input, { resumeInterruptedOperation: true });
    expect(git(root, 'rev-list', '--count', parent + '..HEAD')).toBe('1');
  }, 240000);

  it('accepts a scaffold the user committed by hand while the operation was stuck', async () => {
    const { root, engine } = await project();
    const parent = git(root, 'rev-parse', 'HEAD');
    const input = existing(engine);
    await expect(
      createSpecification(engine, input, { afterEffect: crashAfter('manifest') }),
    ).rejects.toBeInstanceOf(Crash);
    git(root, 'add', 'specs');
    git(root, '-c', 'user.name=Human', '-c', 'user.email=h@e.invalid', 'commit', '-qm', 'by hand');
    const manual = git(root, 'rev-parse', 'HEAD');

    await createSpecification(engine, input, { resumeInterruptedOperation: true });

    expect(git(root, 'rev-list', '--count', parent + '..HEAD')).toBe('1');
    expect((await inspectCreateSpecification(engine, input.operationId))?.commit?.commitSha).toBe(
      manual,
    );
  }, 240000);

  it('leaves the operation recovery-required when the commit fails after the files exist, then resumes', async () => {
    const { root, engine } = await project();
    const parent = git(root, 'rev-parse', 'HEAD');
    const input = existing(engine);
    const configPath = join(root, '.nevo/config.yaml');
    const original = await readFile(configPath, 'utf8');
    await expect(
      createSpecification(engine, input, {
        // The branch becomes protected after reservation: the commit stage must refuse.
        afterEffect: async (effect) => {
          if (effect === 'manifest') {
            await writeFile(
              configPath,
              original + '  commits:\n    protectedBranches: [develop]\n',
            );
          }
        },
      }),
    ).rejects.toMatchObject({ code: 'COMMIT_FAILED' });

    const stuck = await inspectCreateSpecification(engine, input.operationId);
    expect(stuck?.stage).toBe('commit-writing');
    expect(git(root, 'rev-parse', 'HEAD')).toBe(parent);
    await expect(readFile(join(root, stuck!.files[0]!.relativePath), 'utf8')).resolves.toContain(
      stuck!.specId,
    );
    await expect(createSpecification(engine, input)).rejects.toMatchObject({
      code: 'CREATE_RECOVERY_REQUIRED',
    });

    await writeFile(configPath, original);
    await createSpecification(engine, input, { resumeInterruptedOperation: true });
    expect(git(root, 'rev-list', '--count', parent + '..HEAD')).toBe('1');
    expect((await inspectCreateSpecification(engine, input.operationId))?.stage).toBe('completed');
  }, 240000);

  it('refuses to resume when the committed scaffold is partly modified', async () => {
    const { root, engine } = await project();
    const input = existing(engine);
    await expect(
      createSpecification(engine, input, { afterEffect: crashAfter('manifest') }),
    ).rejects.toBeInstanceOf(Crash);
    // Only one scaffold file is committed by hand: neither untouched nor fully committed.
    git(root, 'add', 'specs/active/commit-scaffold/overview.md');
    git(root, '-c', 'user.name=H', '-c', 'user.email=h@e.invalid', 'commit', '-qm', 'partial');
    await expect(
      createSpecification(engine, input, { resumeInterruptedOperation: true }),
    ).rejects.toMatchObject({ code: 'CREATE_RECOVERY_REQUIRED' });
  }, 240000);

  it('resumes a new worktree crashed after the commit without a second commit', async () => {
    const { engine } = await project();
    const input = linked('Linked crash');
    await expect(
      createSpecification(engine, input, { afterEffect: crashAfter('commit') }),
    ).rejects.toBeInstanceOf(Crash);
    const stuck = (await inspectCreateSpecification(engine, input.operationId))!;
    roots.push(dirname(stuck.target.workspaceRoot));
    expect(stuck.stage).toBe('commit-writing');
    const root = stuck.target.workspaceRoot;
    expect(git(root, 'rev-list', '--count', stuck.commit!.parentHead + '..HEAD')).toBe('1');

    await createSpecification(engine, input, { resumeInterruptedOperation: true });
    expect(git(root, 'rev-list', '--count', stuck.commit!.parentHead + '..HEAD')).toBe('1');
    expect((await inspectCreateSpecification(engine, input.operationId))?.stage).toBe('completed');
  }, 240000);
});

describe('Git disabled keeps Create exactly as it was', () => {
  it.each([
    [
      'enabled: false',
      'runtime: {}\ngit:\n  enabled: false\n  commits:\n    protectedBranches: [develop]\n',
    ],
    ['git absent', 'runtime: {}\n'],
  ])(
    '%s: no commit, no check, no Git process, former stage graph',
    async (_name, config) => {
      const { root, engine } = await project(config);
      const parent = git(root, 'rev-parse', 'HEAD');
      const input = existing(engine);
      const stages: string[] = [];
      const spawned: unknown[] = [];
      const listener = (message: unknown): void => {
        spawned.push(message);
      };
      const processChannel = channel('nevo.specflow.engine.git-process');
      processChannel.subscribe(listener);
      try {
        await createSpecification(engine, input, { onStage: ({ stage }) => stages.push(stage) });
      } finally {
        processChannel.unsubscribe(listener);
      }

      expect(spawned).toEqual([]);
      expect(git(root, 'rev-parse', 'HEAD')).toBe(parent);
      expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toContain('?? specs/');
      expect(stages.filter((stage) => stage.startsWith('commit'))).toEqual([]);
      expect(stages.indexOf('manifest-written')).toBe(stages.indexOf('registry-writing') - 1);
      const journal = await inspectCreateSpecification(engine, input.operationId);
      expect(journal?.stage).toBe('completed');
      expect(journal?.commit).toBeUndefined();
    },
    240000,
  );

  it('finishes an in-flight journal reserved without a commit block unchanged, with Git enabled', async () => {
    const { root, engine } = await project();
    const parent = git(root, 'rev-parse', 'HEAD');
    const input = existing(engine);
    await expect(
      createSpecification(engine, input, {
        afterEffect: (effect) =>
          effect === 'reservation'
            ? Promise.reject(new Crash('after reservation'))
            : Promise.resolve(),
      }),
    ).rejects.toBeInstanceOf(Crash);
    // Simulates a journal reserved before commits existed.
    const path = join(
      engine.context.project.stateRoot,
      CREATE_JOURNAL_RELATIVE_DIR,
      input.operationId + '.json',
    );
    const journal = JSON.parse(await readFile(path, 'utf8')) as Record<string, unknown>;
    delete journal.commit;
    await writeFile(path, JSON.stringify(journal));

    await createSpecification(engine, input, { resumeInterruptedOperation: true });
    expect(git(root, 'rev-parse', 'HEAD')).toBe(parent);
    expect((await inspectCreateSpecification(engine, input.operationId))?.stage).toBe('completed');
  }, 240000);
});

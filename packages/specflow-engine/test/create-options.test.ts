import { randomUUID } from 'node:crypto';
import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { inspectCreateOptions } from '../src/specs/create/inspect/options';
import {
  bootstrapProjectHome,
  createSpecificationForTesting,
  workspaceRegistryPath,
} from '../src/testing';
import { createGitTestProject, git } from './support/git-project';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })),
  );
});

describe('E2.I01 authorized create-options Engine read model', () => {
  it('shows the real primary branch, local ref candidates and project policy without mutations', async () => {
    const root = await createGitTestProject(
      'specflow-create-options-',
      'runtime: {}\ngit:\n  enabled: true\n  worktrees:\n    baseRef: develop\n  integrationTargetBranch: develop\n',
    );
    roots.push(root);
    git(root, 'branch', '-m', 'develop');
    git(root, 'branch', 'feature/x');
    const engine = await bootstrapProjectHome(root);
    const registryBefore = await readFile(workspaceRegistryPath(engine.context), 'utf8');
    const headBefore = git(root, 'rev-parse', 'HEAD');
    const refsBefore = git(root, 'show-ref', '--heads');

    const options = await inspectCreateOptions(engine);
    expect(options.primaryWorkspaceId).toBe(engine.workspace.workspaceId);
    expect(options.workspaces).toEqual([
      {
        workspaceId: engine.workspace.workspaceId,
        kind: 'primary',
        managed: false,
        specCount: 0,
        state: 'available',
        selectable: true,
        integrationSelectable: true,
        branch: 'develop',
        name: basename(root),
        path: root,
      },
    ]);
    expect(options.branchPattern).toBe('feature/{slug}');
    expect(options.worktreesRoot).toEqual({ path: root + '-worktrees', exists: false });
    expect(options.defaultBaseRef).toBe('develop');
    expect(options.integrationTargetBranch).toBe('develop');
    expect(options.newWorktree).toEqual({ status: 'available' });
    expect(options.baseRefs).toEqual(
      expect.arrayContaining([
        { ref: 'refs/heads/develop', checkedOutWorkspaceId: engine.workspace.workspaceId },
        { ref: 'refs/heads/feature/x' },
      ]),
    );
    expect(await readFile(workspaceRegistryPath(engine.context), 'utf8')).toBe(registryBefore);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(headBefore);
    expect(git(root, 'show-ref', '--heads')).toBe(refsBefore);
    expect(git(root, 'status', '--porcelain')).toBe('');

    // A selector returned by GET must be directly accepted as Create baseRef.
    const feature = options.baseRefs.find((item) => item.ref === 'refs/heads/feature/x');
    if (!feature) throw new Error('Missing selectable feature/x base.');
    const created = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'From feature branch option',
      created: '2026-10-20',
      target: { kind: 'new-worktree', baseRef: feature.ref },
    });
    roots.push(root + '-worktrees');
    expect(git(created.workspaceRoot, 'rev-parse', 'HEAD~1')).toBe(headBefore);
    // Git is enabled: the Engine commits scaffolds, nothing is protected by default.
    expect(options.commits).toEqual({ protectedBranches: [] });
    expect(options.newWorktree).toEqual({ status: 'available' });
  }, 150000);

  it('counts three canonical Specs in one registered linked worktree and reports dirty state', async () => {
    const root = await createGitTestProject(
      'specflow-create-options-linked-',
      'runtime: {}\ngit:\n  enabled: true\n',
    );
    roots.push(root, root + '-worktrees');
    const engine = await bootstrapProjectHome(root);
    const first = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Linked one',
      created: '2026-10-20',
      target: { kind: 'new-worktree', baseRef: 'HEAD' },
    });
    for (const title of ['Linked two', 'Linked three']) {
      await createSpecificationForTesting(engine, {
        operationId: randomUUID(),
        title,
        created: '2026-10-20',
        target: { kind: 'existing', workspaceId: first.workspaceId },
      });
    }
    const before = await readFile(workspaceRegistryPath(engine.context), 'utf8');
    const options = await inspectCreateOptions(engine);
    const linked = options.workspaces.find((item) => item.workspaceId === first.workspaceId);
    // The Engine committed every scaffold, so the checkout is clean (and a valid merge destination).
    expect(linked).toMatchObject({
      kind: 'linked',
      managed: true,
      specCount: 3,
      state: 'available',
      selectable: true,
      integrationSelectable: true,
    });
    expect(linked?.reason).toBeUndefined();
    expect(options.workspaces).toHaveLength(2);
    expect(linked).toMatchObject({
      name: basename(first.workspaceRoot),
      path: first.workspaceRoot,
    });
    expect(options.worktreesRoot).toEqual({ path: root + '-worktrees', exists: true });
    const linkedRef = git(first.workspaceRoot, 'symbolic-ref', 'HEAD');
    expect(options.baseRefs).toContainEqual({
      ref: linkedRef,
      checkedOutWorkspaceId: first.workspaceId,
    });
    expect(await readFile(workspaceRegistryPath(engine.context), 'utf8')).toBe(before);
  }, 420000);

  it('does not offer unavailable registered worktrees or invent replacement checkouts', async () => {
    const root = await createGitTestProject(
      'specflow-create-options-unavailable-',
      'runtime: {}\ngit:\n  enabled: true\n',
    );
    roots.push(root, root + '-worktrees');
    const engine = await bootstrapProjectHome(root);
    const linked = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Unavailable linked checkout',
      created: '2026-10-20',
      target: { kind: 'new-worktree', baseRef: 'HEAD' },
    });
    const linkedRef = git(linked.workspaceRoot, 'symbolic-ref', 'HEAD');
    const registryBefore = await readFile(workspaceRegistryPath(engine.context), 'utf8');
    await rm(linked.workspaceRoot, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 250,
    });

    const options = await inspectCreateOptions(engine);
    expect(
      options.workspaces.find((item) => item.workspaceId === linked.workspaceId),
    ).toMatchObject({
      state: 'unavailable',
      selectable: false,
    });
    expect(
      options.baseRefs.find((item) => item.ref === linkedRef)?.checkedOutWorkspaceId,
    ).toBeUndefined();
    expect(await readFile(workspaceRegistryPath(engine.context), 'utf8')).toBe(registryBefore);
  }, 150000);

  it('does not offer a detached linked worktree as a selectable checkout', async () => {
    const root = await createGitTestProject(
      'specflow-create-options-detached-',
      'runtime: {}\ngit:\n  enabled: true\n',
    );
    roots.push(root, root + '-worktrees');
    const engine = await bootstrapProjectHome(root);
    const linked = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Detached linked checkout',
      created: '2026-10-20',
      target: { kind: 'new-worktree', baseRef: 'HEAD' },
    });
    const linkedRef = git(linked.workspaceRoot, 'symbolic-ref', 'HEAD');
    const registryBefore = await readFile(workspaceRegistryPath(engine.context), 'utf8');
    git(linked.workspaceRoot, 'checkout', '--detach', 'HEAD');

    const options = await inspectCreateOptions(engine);
    expect(
      options.workspaces.find((item) => item.workspaceId === linked.workspaceId),
    ).toMatchObject({
      state: 'detached',
      selectable: false,
      reason: 'detached',
    });
    expect(
      options.baseRefs.find((item) => item.ref === linkedRef)?.checkedOutWorkspaceId,
    ).toBeUndefined();
    expect(await readFile(workspaceRegistryPath(engine.context), 'utf8')).toBe(registryBefore);
  }, 150000);

  it('exposes Git-disabled state without fabricating new-worktree availability', async () => {
    const root = await createGitTestProject(
      'specflow-create-options-disabled-',
      'runtime: {}\ngit:\n  enabled: false\n',
    );
    roots.push(root);
    const engine = await bootstrapProjectHome(root);
    const options = await inspectCreateOptions(engine);
    expect(options.newWorktree).toEqual({ status: 'disabled', reason: 'git-disabled' });
    expect(options.workspaces[0]?.state).toBe('available');
    // Git off: byte-identical to before, no commit-related field or reason at all.
    expect(options.commits).toBeUndefined();
    expect('commits' in options).toBe(false);
    expect('branchProtected' in options.newWorktree).toBe(false);
  }, 90000);

  it('degrades instead of failing when the Git policy is invalid, and Create stays fail-closed', async () => {
    const root = await createGitTestProject(
      'specflow-create-options-invalid-',
      'runtime: {}\ngit:\n  enabled: true\n',
    );
    roots.push(root);
    const engine = await bootstrapProjectHome(root);
    await writeFile(
      join(root, '.nevo/config.yaml'),
      'runtime: {}\ngit:\n  enabled: true\n  bogusKey: 1\n',
    );
    const problems: string[] = [];
    const spawns: unknown[] = [];
    const listener = (message: unknown): void => void spawns.push(message);
    subscribe('nevo.specflow.engine.git-process', listener);
    let options;
    try {
      options = await inspectCreateOptions(engine, { onPolicyProblem: (p) => problems.push(p) });
    } finally {
      unsubscribe('nevo.specflow.engine.git-process', listener);
    }

    // Nothing needs Git for this answer: no process, workspaces from disk checks only.
    expect(spawns).toEqual([]);
    expect(options.newWorktree).toEqual({ status: 'unavailable', reason: 'git-policy-invalid' });
    expect(options.workspaces).toEqual([
      expect.objectContaining({
        workspaceId: engine.workspace.workspaceId,
        kind: 'primary',
        state: 'unavailable',
        selectable: false,
        integrationSelectable: false,
        reason: 'git-policy-invalid',
      }),
    ]);
    expect(options.workspaces[0]?.branch).toBeUndefined();
    expect(options.baseRefs).toEqual([]);
    expect(options.commits).toBeUndefined();
    expect(options.integrationTargetBranch).toBeUndefined();
    // The cause reaches the caller log hook only, and carries no path.
    expect(problems).toHaveLength(1);
    expect(problems[0]).not.toContain(root);

    // Create reads the policy for every target (to know whether it commits): fail closed.
    await expect(
      createSpecificationForTesting(engine, {
        operationId: randomUUID(),
        title: 'Must fail closed',
        created: '2026-10-20',
        target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
      }),
    ).rejects.toMatchObject({ code: 'GIT_POLICY_INVALID' });

    // The same with Git disabled: an invalid section is invalid whatever `enabled` says.
    await writeFile(
      join(root, '.nevo/config.yaml'),
      'runtime: {}\ngit:\n  enabled: false\n  bogusKey: 1\n',
    );
    expect((await inspectCreateOptions(engine)).newWorktree.reason).toBe('git-policy-invalid');
  }, 120000);

  it('marks protected and not-allowed branches unselectable and lists the policy', async () => {
    const root = await createGitTestProject(
      'specflow-create-options-protected-',
      [
        'runtime: {}',
        'git:',
        '  enabled: true',
        '  worktrees:',
        '    branchPattern: "release/{slug}"',
        '  commits:',
        '    protectedBranches: ["release/**", develop]',
        '    allowedBranches: ["topic/**"]',
        '',
      ].join('\n'),
    );
    roots.push(root);
    git(root, 'branch', '-m', 'develop');
    await writeFile(join(root, 'dirty.txt'), 'x\n');
    const engine = await bootstrapProjectHome(root);
    const options = await inspectCreateOptions(engine);
    expect(options.commits).toEqual({
      protectedBranches: ['release/**', 'develop'],
      allowedBranches: ['topic/**'],
    });
    expect(options.workspaces[0]).toMatchObject({
      state: 'dirty',
      selectable: false,
      branch: 'develop',
      reason: 'branch-protected',
    });
    // The generated branch (release/<slug>) is protected: advisory flag, tile stays available.
    expect(options.newWorktree).toEqual({ status: 'available', branchProtected: true });

    git(root, 'checkout', '-q', '-b', 'scratch');
    const other = await inspectCreateOptions(engine);
    expect(other.workspaces[0]).toMatchObject({
      selectable: false,
      reason: 'branch-not-allowed',
    });
    git(root, 'checkout', '-q', '-b', 'topic/a');
    expect((await inspectCreateOptions(engine)).workspaces[0]).toMatchObject({
      selectable: true,
      reason: 'dirty',
    });
  }, 420000);

  it('reads the worktree folder from the local config and reports whether it exists', async () => {
    const root = await createGitTestProject(
      'specflow-create-options-root-',
      'runtime: {}\ngit:\n  enabled: true\n',
    );
    const custom = root + '-custom-trees';
    roots.push(root, custom);
    await mkdir(join(root, '.nevo/local'), { recursive: true });
    await writeFile(
      join(root, '.nevo/local/config.yaml'),
      'git:\n  worktreesRoot: ' + JSON.stringify(custom) + '\n',
    );
    const engine = await bootstrapProjectHome(root);
    expect((await inspectCreateOptions(engine)).worktreesRoot).toEqual({
      path: custom,
      exists: false,
    });
    await mkdir(custom);
    expect((await inspectCreateOptions(engine)).worktreesRoot).toEqual({
      path: custom,
      exists: true,
    });
  }, 120000);

  it('degrades instead of failing when the local worktree folder is inside the repository', async () => {
    const root = await createGitTestProject(
      'specflow-create-options-inside-',
      'runtime: {}\ngit:\n  enabled: true\n',
    );
    roots.push(root);
    await mkdir(join(root, '.nevo/local'), { recursive: true });
    await writeFile(join(root, '.nevo/local/config.yaml'), 'git:\n  worktreesRoot: ./wt\n');
    const engine = await bootstrapProjectHome(root);
    const problems: string[] = [];
    const options = await inspectCreateOptions(engine, {
      onPolicyProblem: (problem) => problems.push(problem),
    });
    expect(options.newWorktree).toEqual({ status: 'unavailable', reason: 'git-policy-invalid' });
    expect(options.worktreesRoot).toEqual({ path: root + '-worktrees', exists: false });
    // Existing-workspace Creates do not depend on the worktree folder.
    expect(options.workspaces[0]).toMatchObject({ selectable: true });
    expect(problems).toHaveLength(1);
  }, 120000);

  it('treats an unreadable worktree folder as not existing', async () => {
    const root = await createGitTestProject(
      'specflow-create-options-stat-',
      'runtime: {}\ngit:\n  enabled: true\n',
    );
    const custom = root + '-file-not-dir';
    roots.push(root, custom);
    await writeFile(custom, 'a file, not a folder');
    await mkdir(join(root, '.nevo/local'), { recursive: true });
    await writeFile(
      join(root, '.nevo/local/config.yaml'),
      'git:\n  worktreesRoot: ' + JSON.stringify(custom + '/child') + '\n',
    );
    const engine = await bootstrapProjectHome(root);
    // stat answers ENOTDIR on POSIX and ENOENT on Windows; any failure to stat the folder as a
    // directory is "does not exist yet", never an untyped failure. The path is platform-normalized.
    expect((await inspectCreateOptions(engine)).worktreesRoot).toEqual({
      path: join(custom, 'child'),
      exists: false,
    });
  }, 120000);
});

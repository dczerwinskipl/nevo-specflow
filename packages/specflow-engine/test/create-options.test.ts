import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { inspectCreateOptions } from '../src/specs/create-options';
import {
  bootstrapProjectHome,
  createSpecificationForTesting,
  workspaceRegistryPath,
} from '../src/testing';
import { createGitTestProject, git } from './support/git-project';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
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
    await rm(linked.workspaceRoot, { recursive: true, force: true });

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
});

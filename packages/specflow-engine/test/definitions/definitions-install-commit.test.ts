// Linux-only integration (real Git, real files): installing definitions commits them through the
// Engine commit capability, refuses on a protected branch before writing, and leaves a worktree that
// Close accepts.
import { randomUUID } from 'node:crypto';
import { readdir, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  archiveSpecificationWithCommit,
  assertInitialDefinitionsCommittable,
  bootstrapProjectHome,
  createSpecificationForTesting,
  installProjectDefinitionFiles,
  installProjectDefinitions,
  reserveCloseOperation,
} from '../../src/testing';
import { createGitTestProject, git, commitStaged } from '../support/git-project';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0).reverse()) {
    await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
  }
});

async function project(config: string) {
  const root = await createGitTestProject('definitions-commit-', config);
  roots.push(root);
  return { root, engine: await bootstrapProjectHome(root) };
}

const GIT_ON = 'runtime: {}\ngit:\n  enabled: true\n';
const GIT_OFF = 'runtime: {}\ngit:\n  enabled: false\n';

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

describe('installing definitions with Git enabled', () => {
  it('commits exactly the written files in one Engine commit with the operation trailer', async () => {
    const { root, engine } = await project(GIT_ON);
    const parent = git(root, 'rev-parse', 'HEAD');

    const result = await installProjectDefinitions(engine);

    expect(result.written).toHaveLength(13);
    expect(result.commit?.paths).toHaveLength(13);
    expect(git(root, 'rev-list', '--count', parent + '..HEAD')).toBe('1');
    const changed = git(root, 'diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD')
      .split('\n')
      .sort();
    expect(changed).toEqual([...(result.commit?.paths ?? [])].sort());
    expect(changed.every((path) => path.startsWith('.nevo/definitions/'))).toBe(true);
    expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');
    expect(git(root, 'log', '-1', '--format=%B')).toMatch(/^Nevo-Operation: [0-9a-f-]{36}$/mu);
    expect(git(root, 'log', '-1', '--format=%s')).toBe('definitions(install): 13 files');
  });

  it('is idempotent: a second add-missing run changes and commits nothing', async () => {
    const { root, engine } = await project(GIT_ON);
    await installProjectDefinitions(engine);
    const head = git(root, 'rev-parse', 'HEAD');
    const again = await installProjectDefinitions(engine, { addMissing: true });
    expect(again.written).toEqual([]);
    expect(again.commit).toBeUndefined();
    expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
  });

  it('commits files an earlier interrupted install left in the worktree', async () => {
    const { root, engine } = await project(GIT_ON);
    // An interrupted run: the files were written and the commit never happened.
    await installProjectDefinitionFiles(root);
    expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toContain(
      '.nevo/definitions/',
    );
    const again = await installProjectDefinitions(engine, { addMissing: true });
    expect(again.written).toEqual([]);
    expect(again.commit?.paths).toHaveLength(13);
    expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');
  });

  it('refuses on a protected branch before writing anything', async () => {
    const branch = 'main-protected';
    const { root, engine } = await project(
      GIT_ON + '  commits:\n    protectedBranches: [' + branch + ']\n',
    );
    git(root, 'checkout', '-q', '-b', branch);
    const head = git(root, 'rev-parse', 'HEAD');

    await expect(installProjectDefinitions(engine)).rejects.toMatchObject({
      code: 'BRANCH_PROTECTED',
    });

    expect(await exists(join(root, '.nevo/definitions'))).toBe(false);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
  });

  it('lets Close archive a Specification created after the install, with a clean worktree', async () => {
    const { root, engine } = await project(GIT_ON);
    const branch = git(root, 'symbolic-ref', '--short', 'HEAD');
    await writeFile(
      join(root, '.nevo/config.yaml'),
      GIT_ON + '  integrationTargetBranch: ' + branch + '\n',
    );
    git(root, 'add', '.nevo/config.yaml');
    commitStaged(root, 'target branch');
    await installProjectDefinitions(engine);
    const registry = await engine.readRegistry();
    const spec = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Close after install',
      created: '2026-10-18',
      archetype: { id: 'minimal', version: 1 },
      target: { kind: 'existing', workspaceId: registry.primaryWorkspaceId },
    });
    expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');
    const operationId = randomUUID();
    await reserveCloseOperation(engine, {
      kind: 'specification-close',
      operationId,
      specId: spec.specId,
    });
    await archiveSpecificationWithCommit(engine, operationId);
    expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');
    expect((await readdir(join(root, 'specs'))).sort()).toContain('archive');
  });
});

describe('installing definitions with Git disabled', () => {
  it('is a plain write: nothing is committed and the files stay in the worktree', async () => {
    const { root, engine } = await project(GIT_OFF);
    const head = git(root, 'rev-parse', 'HEAD');
    const result = await installProjectDefinitions(engine);
    expect(result.written).toHaveLength(13);
    expect(result.commit).toBeUndefined();
    expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
    expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toContain(
      '.nevo/definitions/',
    );
  });
});

describe('the init pre-check', () => {
  it('refuses a protected current branch and a detached HEAD, and accepts Git disabled', async () => {
    const { root } = await project(GIT_OFF);
    const branch = git(root, 'symbolic-ref', '--short', 'HEAD');
    await expect(
      assertInitialDefinitionsCommittable(root, {
        enabled: true,
        commits: { protectedBranches: [branch] },
      }),
    ).rejects.toMatchObject({ code: 'BRANCH_PROTECTED' });
    await expect(
      assertInitialDefinitionsCommittable(root, { enabled: true }),
    ).resolves.toBeUndefined();
    await expect(
      assertInitialDefinitionsCommittable(root, {
        enabled: false,
        commits: { protectedBranches: [branch] },
      }),
    ).resolves.toBeUndefined();
    git(root, 'checkout', '-q', '--detach');
    await expect(
      assertInitialDefinitionsCommittable(root, { enabled: true }),
    ).rejects.toMatchObject({ code: 'COMMIT_BLOCKED' });
  });
});

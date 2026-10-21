import { randomUUID } from 'node:crypto';
import { rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  archiveSpecificationWithCommit,
  bootstrapProjectHome,
  closeSpecification,
  closeWorktree,
  createSpecificationForTesting,
  inspectCloseOperation,
  readWorkspaceSpecification,
  reserveCloseOperation,
} from '../src/testing';
import { createGitTestProject, git } from './support/git-project';

const cleanup: string[] = [];
afterEach(async () => {
  for (const root of cleanup.splice(0).reverse())
    await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
});

async function fixture(linked: boolean) {
  const root = await createGitTestProject(
    'specification-close-t15-Ż ',
    'runtime: {}\ngit:\n  enabled: true\n',
  );
  cleanup.push(root);
  const branch = git(root, 'symbolic-ref', '--short', 'HEAD');
  await writeFile(
    join(root, '.nevo/config.yaml'),
    'runtime: {}\ngit:\n  enabled: true\n  integrationTargetBranch: ' + branch + '\n',
  );
  git(root, 'add', '.nevo/config.yaml');
  git(
    root,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.invalid',
    'commit',
    '-qm',
    'pin integration target',
  );
  const engine = await bootstrapProjectHome(root);
  const registry = await engine.readRegistry();
  const spec = await createSpecificationForTesting(engine, {
    operationId: randomUUID(),
    title: 'Lifecycle archive test',
    created: '2026-10-18',
    target: linked
      ? { kind: 'new-worktree' as const, baseRef: 'HEAD' }
      : { kind: 'existing' as const, workspaceId: registry.primaryWorkspaceId },
  });
  if (linked) cleanup.push(dirname(spec.workspaceRoot));
  git(
    spec.workspaceRoot,
    'add',
    '--',
    spec.relativeManifestPath,
    'specs/active/' + spec.slug + '/overview.md',
  );
  git(
    spec.workspaceRoot,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.invalid',
    'commit',
    '-qm',
    'commit authored specification',
  );
  return { root, engine, spec };
}

describe('E2.T15 Specification Close (real Git filesystem)', () => {
  it('archives once in primary without merging or changing registry binding', async () => {
    const { root, engine, spec } = await fixture(false);
    const registry = await engine.readRegistry();
    const operationId = randomUUID();
    const result = await closeSpecification(engine, { operationId, specId: spec.specId });
    expect(result).toMatchObject({
      status: 'completed',
      journal: {
        stage: 'completed',
        outcome: 'archived-in-primary',
      },
    });
    const archivedCommit = git(root, 'rev-parse', 'HEAD');
    expect((await readWorkspaceSpecification(root, spec.specId)).location).toBe('archive');
    expect((await engine.readRegistry()).revision).toBe(registry.revision);
    expect((await closeSpecification(engine, { operationId, specId: spec.specId })).status).toBe(
      'completed',
    );
    expect(git(root, 'rev-parse', 'HEAD')).toBe(archivedCommit);
    await expect(
      closeSpecification(engine, {
        operationId: randomUUID(),
        specId: spec.specId,
      }),
    ).rejects.toMatchObject({ code: 'CLOSE_PREFLIGHT' });
  }, 120000);

  it('keeps a linked canonical archive and worktree after archive-only close', async () => {
    const { root, engine, spec } = await fixture(true);
    const initial = await engine.readRegistry();
    const primaryHead = git(root, 'rev-parse', 'HEAD');
    const operationId = randomUUID();
    const closed = await closeSpecification(engine, {
      operationId,
      specId: spec.specId,
      integrateToTargetBranch: false,
    });
    expect(closed).toMatchObject({
      status: 'completed',
      journal: {
        stage: 'completed',
        outcome: 'archive-only-closed',
      },
    });
    expect((await readWorkspaceSpecification(spec.workspaceRoot, spec.specId)).location).toBe(
      'archive',
    );
    expect(git(root, 'rev-parse', 'HEAD')).toBe(primaryHead);
    expect((await engine.readRegistry()).specBindings).toEqual(initial.specBindings);
    expect(
      (
        await closeSpecification(engine, {
          operationId,
          specId: spec.specId,
          integrateToTargetBranch: false,
        })
      ).status,
    ).toBe('completed');
    await expect(
      closeSpecification(engine, {
        operationId,
        specId: spec.specId,
        integrateToTargetBranch: true,
      }),
    ).rejects.toMatchObject({ code: 'CLOSE_CONFLICT' });
  }, 120000);

  it('LC38: archives linked source without integration, then closes that worktree separately', async () => {
    const { root, engine, spec } = await fixture(true);
    const archiveOperationId = randomUUID();
    const archived = await closeSpecification(engine, {
      operationId: archiveOperationId,
      specId: spec.specId,
      integrateToTargetBranch: false,
    });
    expect(archived).toMatchObject({
      status: 'completed',
      journal: { outcome: 'archive-only-closed' },
    });
    const afterArchive = await engine.readRegistry();
    expect(afterArchive.specBindings.find((x) => x.specId === spec.specId)?.workspaceId).not.toBe(
      afterArchive.primaryWorkspaceId,
    );
    const worktreeClosed = await closeWorktree(engine, {
      operationId: randomUUID(),
      specId: spec.specId,
    });
    expect(worktreeClosed.status).toBe('completed');
    expect((await readWorkspaceSpecification(root, spec.specId)).location).toBe('archive');
    const registry = await engine.readRegistry();
    expect(registry.specBindings.find((x) => x.specId === spec.specId)?.workspaceId).toBe(
      registry.primaryWorkspaceId,
    );
    expect(registry.workspaces.some((x) => x.root === spec.workspaceRoot)).toBe(false);
    expect(git(root, 'status', '--porcelain')).toBe('');
  }, 120000);

  it('LC37: refuses direct primary archive on a branch different from configured target', async () => {
    const { root, engine, spec } = await fixture(false);
    const originalSpec = await readWorkspaceSpecification(root, spec.specId);
    await writeFile(
      join(root, '.nevo/config.yaml'),
      'runtime: {}\ngit:\n  enabled: true\n  integrationTargetBranch: other-ref\n',
    );
    git(root, 'add', '.nevo/config.yaml');
    git(
      root,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'change configured integration branch',
    );
    const head = git(root, 'rev-parse', 'HEAD');
    const operationId = randomUUID();
    await expect(
      closeSpecification(engine, { operationId, specId: spec.specId }),
    ).rejects.toMatchObject({ code: 'CLOSE_PREFLIGHT' });
    expect(await inspectCloseOperation(engine, operationId)).toBeUndefined();
    expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
    expect((await readWorkspaceSpecification(root, spec.specId)).location).toBe(
      originalSpec.location,
    );
  }, 120000);

  it('archives linked source before fast-forward integration, CAS rebind and disposal', async () => {
    const { root, engine, spec } = await fixture(true);
    const operationId = randomUUID();
    const closed = await closeSpecification(engine, { operationId, specId: spec.specId });
    expect(closed).toMatchObject({
      status: 'completed',
      journal: {
        stage: 'completed',
        outcome: 'integrated-and-removed',
      },
    });
    expect((await readWorkspaceSpecification(root, spec.specId)).location).toBe('archive');
    const registry = await engine.readRegistry();
    expect(registry.specBindings.find((x) => x.specId === spec.specId)?.workspaceId).toBe(
      registry.primaryWorkspaceId,
    );
    expect(registry.workspaces.some((x) => x.root === spec.workspaceRoot)).toBe(false);
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect((await closeSpecification(engine, { operationId, specId: spec.specId })).status).toBe(
      'completed',
    );
  }, 120000);

  it('resumes a proved archived source commit without issuing a duplicate commit', async () => {
    const { root, engine, spec } = await fixture(false);
    const operationId = randomUUID();
    await reserveCloseOperation(engine, {
      kind: 'specification-close',
      operationId,
      specId: spec.specId,
    });
    const committed = await archiveSpecificationWithCommit(engine, operationId);
    expect(committed.stage).toBe('archive-committed');
    const sha = git(root, 'rev-parse', 'HEAD');
    const result = await closeSpecification(engine, { operationId, specId: spec.specId });
    expect(result).toMatchObject({
      status: 'completed',
      journal: {
        stage: 'completed',
        outcome: 'archived-in-primary',
      },
    });
    expect(git(root, 'rev-parse', 'HEAD')).toBe(sha);
    expect((await inspectCloseOperation(engine, operationId))?.archive?.committedHead).toBe(sha);
  }, 120000);
});

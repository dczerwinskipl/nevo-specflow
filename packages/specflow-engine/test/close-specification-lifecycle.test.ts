import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  archiveSpecificationWithCommit,
  bootstrapProjectHome,
  closeSpecification,
  closeWorktree,
  closeWorkspace,
  previewCloseOperation,
  prepareCloseGitIntegration,
  publishCloseGitFastForward,
  rebindVerifiedClose,
  disposeReboundWorktree,
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

  it('I03: archives B without changing A/C or shared linked worktree ownership', async () => {
    const { root, engine, spec: a } = await fixture(true);
    const sourceRegistry = await engine.readRegistry();
    const sourceWorkspaceId = sourceRegistry.specBindings.find(
      (x) => x.specId === a.specId,
    )!.workspaceId;
    const b = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Independent sibling B',
      created: '2026-10-20',
      target: { kind: 'existing', workspaceId: sourceWorkspaceId },
    });
    const c = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Independent sibling C',
      created: '2026-10-20',
      target: { kind: 'existing', workspaceId: sourceWorkspaceId },
    });
    git(
      a.workspaceRoot,
      'add',
      '--',
      b.relativeManifestPath,
      c.relativeManifestPath,
      'specs/active/' + b.slug + '/overview.md',
      'specs/active/' + c.slug + '/overview.md',
    );
    git(
      a.workspaceRoot,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'commit sibling specifications',
    );
    const before = await engine.readRegistry();
    const primaryHead = git(root, 'rev-parse', 'HEAD');
    const op = randomUUID();
    const result = await closeSpecification(engine, {
      operationId: op,
      specId: b.specId,
      integrateToTargetBranch: false,
    });
    expect(result).toMatchObject({
      status: 'completed',
      journal: { outcome: 'archive-only-closed' },
    });
    expect((await readWorkspaceSpecification(a.workspaceRoot, a.specId)).status).toBe('draft');
    expect((await readWorkspaceSpecification(a.workspaceRoot, b.specId)).status).toBe('archived');
    expect((await readWorkspaceSpecification(a.workspaceRoot, c.specId)).status).toBe('draft');
    const after = await engine.readRegistry();
    expect(after.specBindings).toEqual(before.specBindings);
    expect(after.revision).toBe(before.revision);
    expect(after.workspaces).toEqual(before.workspaces);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(primaryHead);
    const archivedHead = git(a.workspaceRoot, 'rev-parse', 'HEAD');
    expect(
      (
        await closeSpecification(engine, {
          operationId: op,
          specId: b.specId,
          integrateToTargetBranch: false,
        })
      ).status,
    ).toBe('completed');
    expect(git(a.workspaceRoot, 'rev-parse', 'HEAD')).toBe(archivedHead);
    const refusedOp = randomUUID();
    const blocked = await closeSpecification(engine, {
      operationId: refusedOp,
      specId: a.specId,
      integrateToTargetBranch: true,
    }).catch((error: unknown) => error);
    expect(blocked).toMatchObject({ code: 'CLOSE_SHARED_WORKTREE' });
    expect(blocked).toBeInstanceOf(Error);
    if (blocked instanceof Error) expect(blocked.message).toContain('workspace-scoped Close');
    expect(await inspectCloseOperation(engine, refusedOp)).toBeUndefined();
    expect(git(a.workspaceRoot, 'rev-parse', 'HEAD')).toBe(archivedHead);
    expect((await engine.readRegistry()).specBindings).toEqual(before.specBindings);
  }, 120000);

  it('I03: verifies registered incarnation before reading workspace manifests', async () => {
    const { root, engine, spec } = await fixture(true);
    const registry = await engine.readRegistry();
    const workspaceId = registry.specBindings.find((x) => x.specId === spec.specId)!.workspaceId;
    const markerPath = join(spec.workspaceRoot, '.nevo/local/state/workspace-identity.json');
    const marker = await readFile(markerPath, 'utf8');
    const originalSource = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    const originalPrimary = git(root, 'rev-parse', 'HEAD');
    const op = randomUUID();
    const parsed = JSON.parse(marker) as Record<string, unknown>;
    try {
      await writeFile(markerPath, JSON.stringify({ ...parsed, instanceId: randomUUID() }) + '\n');
      await expect(
        previewCloseOperation(engine, {
          kind: 'workspace-close',
          workspaceId,
          operationId: op,
        }),
      ).rejects.toMatchObject({ code: 'REGISTRY_WORKSPACE_MISMATCH' });
      expect(await inspectCloseOperation(engine, op)).toBeUndefined();
      expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).toBe(originalSource);
      expect(git(root, 'rev-parse', 'HEAD')).toBe(originalPrimary);
      expect((await engine.readRegistry()).specBindings).toEqual(registry.specBindings);
      // The identity mismatch must be caught even if a changed checkout
      // contains a plausible canonical manifest with the same specId.
      expect((await readWorkspaceSpecification(spec.workspaceRoot, spec.specId)).specId).toBe(
        spec.specId,
      );
    } finally {
      await writeFile(markerPath, marker);
    }
  }, 120000);

  it('I03: workspace-scoped integration transfers all A/B/C atomically and preserves statuses', async () => {
    const { root, engine, spec: a } = await fixture(true);
    const primaryHead = git(root, 'rev-parse', 'HEAD');
    const registry = await engine.readRegistry();
    const workspaceId = registry.specBindings.find((x) => x.specId === a.specId)!.workspaceId;
    const b = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Workspace sibling B',
      created: '2026-10-20',
      target: { kind: 'existing', workspaceId },
    });
    const c = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Workspace sibling C',
      created: '2026-10-20',
      target: { kind: 'existing', workspaceId },
    });
    git(
      a.workspaceRoot,
      'add',
      '--',
      b.relativeManifestPath,
      c.relativeManifestPath,
      'specs/active/' + b.slug + '/overview.md',
      'specs/active/' + c.slug + '/overview.md',
    );
    git(
      a.workspaceRoot,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'add sibling Specs',
    );
    await closeSpecification(engine, {
      operationId: randomUUID(),
      specId: b.specId,
      integrateToTargetBranch: false,
    });
    const revision = (await engine.readRegistry()).revision;
    const operationId = randomUUID();
    const plan = await previewCloseOperation(engine, {
      kind: 'workspace-close',
      workspaceId,
      operationId,
    });
    expect(plan.kind).toBe('workspace-close');
    expect(plan.occupants?.map((x) => x.specId)).toEqual([a.specId, b.specId, c.specId].sort());
    expect(plan.target?.workspaceId).toBe(registry.primaryWorkspaceId);
    const result = await closeWorkspace(engine, { operationId, workspaceId });
    expect(result).toMatchObject({
      status: 'completed',
      journal: { outcome: 'worktree-integrated-and-removed', stage: 'completed' },
    });
    const current = await engine.readRegistry();
    expect(current.revision).toBe(revision + 2);
    expect(current.workspaces.some((x) => x.workspaceId === workspaceId)).toBe(false);
    for (const { specId, status } of [
      { specId: a.specId, status: 'draft' },
      { specId: b.specId, status: 'archived' },
      { specId: c.specId, status: 'draft' },
    ]) {
      const binding = current.specBindings.find((x) => x.specId === specId);
      expect(binding?.workspaceId).toBe(registry.primaryWorkspaceId);
      expect(binding?.generation).toBe(revision + 1);
      expect((await readWorkspaceSpecification(root, specId)).status).toBe(status);
    }
    expect(git(root, 'rev-parse', 'HEAD')).not.toBe(primaryHead);
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect((await closeWorkspace(engine, { operationId, workspaceId })).status).toBe('completed');
    expect((await engine.readRegistry()).revision).toBe(current.revision);
  }, 120000);

  it('I03: recovers a crashed multi-binding CAS without repeating Git or registry rebind', async () => {
    const { root, engine, spec: a } = await fixture(true);
    const before = await engine.readRegistry();
    const workspaceId = before.specBindings.find((x) => x.specId === a.specId)!.workspaceId;
    const b = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Atomic CAS sibling B',
      created: '2026-10-20',
      target: { kind: 'existing', workspaceId },
    });
    git(
      a.workspaceRoot,
      'add',
      '--',
      b.relativeManifestPath,
      'specs/active/' + b.slug + '/overview.md',
    );
    git(
      a.workspaceRoot,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'sibling before CAS crash',
    );
    const revision = (await engine.readRegistry()).revision;
    const operationId = randomUUID();
    await reserveCloseOperation(engine, { kind: 'workspace-close', operationId, workspaceId });
    await prepareCloseGitIntegration(engine, operationId);
    await publishCloseGitFastForward(engine, operationId);
    const published = git(root, 'rev-parse', 'HEAD');
    await expect(
      rebindVerifiedClose(engine, operationId, () =>
        Promise.reject(new Error('injected crash after atomic multi-binding CAS')),
      ),
    ).rejects.toThrow('injected crash');
    const moved = await engine.readRegistry();
    expect(moved.revision).toBe(revision + 1);
    for (const specId of [a.specId, b.specId]) {
      expect(moved.specBindings.find((x) => x.specId === specId)).toMatchObject({
        workspaceId: moved.primaryWorkspaceId,
        generation: revision + 1,
      });
    }
    expect((await inspectCloseOperation(engine, operationId))?.stage).toBe('integration-verified');
    const resumed = await rebindVerifiedClose(engine, operationId);
    expect(resumed.stage).toBe('binding-rebound');
    expect((await engine.readRegistry()).revision).toBe(revision + 1);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(published);
    const disposed = await disposeReboundWorktree(engine, operationId);
    expect(disposed.stage).toBe('completed');
    expect((await engine.readRegistry()).revision).toBe(revision + 2);
    expect((await closeWorkspace(engine, { operationId, workspaceId })).status).toBe('completed');
    expect(git(root, 'rev-parse', 'HEAD')).toBe(published);
  }, 120000);

  it('I03: refuses to delete shared source containing unknown ignored user data', async () => {
    const { root, engine, spec: a } = await fixture(true);
    const initial = await engine.readRegistry();
    const workspaceId = initial.specBindings.find((x) => x.specId === a.specId)!.workspaceId;
    const b = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Ignored data sibling B',
      created: '2026-10-20',
      target: { kind: 'existing', workspaceId },
    });
    git(
      a.workspaceRoot,
      'add',
      '--',
      b.relativeManifestPath,
      'specs/active/' + b.slug + '/overview.md',
    );
    git(
      a.workspaceRoot,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'commit shared source before ignored user file',
    );
    const unknown = join(a.workspaceRoot, '.nevo/local/state/notes-not-owned.txt');
    await mkdir(dirname(unknown), { recursive: true });
    await writeFile(unknown, 'preserve me exactly');
    const operationId = randomUUID();
    await expect(closeWorkspace(engine, { operationId, workspaceId })).rejects.toMatchObject({
      code: 'CLOSE_RECOVERY_REQUIRED',
    });
    expect(await readFile(unknown, 'utf8')).toBe('preserve me exactly');
    expect((await inspectCloseOperation(engine, operationId))?.stage).toBe('binding-rebound');
    const registry = await engine.readRegistry();
    expect(registry.workspaces.some((x) => x.workspaceId === workspaceId)).toBe(true);
    expect(registry.specBindings.every((x) => x.workspaceId !== workspaceId)).toBe(true);
    for (const specId of [a.specId, b.specId]) {
      expect((await readWorkspaceSpecification(root, specId)).status).toBe('draft');
    }
  }, 120000);

  it('I03: divergent shared Workspace Close preserves three canonical statuses', async () => {
    const { root, engine, spec: a } = await fixture(true);
    const registry = await engine.readRegistry();
    const workspaceId = a.workspaceId;
    const siblings = [];
    for (const title of ['Divergent shared B', 'Divergent shared C']) {
      const item = await createSpecificationForTesting(engine, {
        operationId: randomUUID(),
        title,
        created: '2026-10-20',
        target: { kind: 'existing', workspaceId },
      });
      git(
        a.workspaceRoot,
        'add',
        '--',
        item.relativeManifestPath,
        'specs/active/' + item.slug + '/overview.md',
      );
      siblings.push(item);
    }
    git(
      a.workspaceRoot,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'committed shared siblings',
    );
    await closeSpecification(engine, {
      operationId: randomUUID(),
      specId: siblings[0]!.specId,
      integrateToTargetBranch: false,
    });
    await writeFile(join(root, 'target-independent.txt'), 'diverge destination\n');
    git(root, 'add', '--', 'target-independent.txt');
    git(
      root,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'advance target without touching Specs',
    );
    const targetHead = git(root, 'rev-parse', 'HEAD');
    const sourceHead = git(a.workspaceRoot, 'rev-parse', 'HEAD');
    const oldRevision = (await engine.readRegistry()).revision;
    const operationId = randomUUID();
    const result = await closeWorkspace(engine, { operationId, workspaceId });
    expect(result.status).toBe('completed');
    const merged = git(root, 'rev-parse', 'HEAD');
    expect(git(root, 'rev-list', '--parents', '-n', '1', merged)).toBe(
      [merged, targetHead, sourceHead].join(' '),
    );
    const current = await engine.readRegistry();
    expect(current.revision).toBe(oldRevision + 2);
    for (const { specId, status } of [
      { specId: a.specId, status: 'draft' },
      { specId: siblings[0]!.specId, status: 'archived' },
      { specId: siblings[1]!.specId, status: 'draft' },
    ]) {
      expect(current.specBindings.find((x) => x.specId === specId)?.workspaceId).toBe(
        registry.primaryWorkspaceId,
      );
      expect((await readWorkspaceSpecification(root, specId)).status).toBe(status);
    }
    expect(git(root, 'status', '--porcelain')).toBe('');
  }, 180000);

  it('I03: divergent conflict retains all shared bindings, source and target unchanged', async () => {
    const { root, engine, spec: a } = await fixture(true);
    const workspaceId = a.workspaceId;
    const b = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Conflict retained shared B',
      created: '2026-10-20',
      target: { kind: 'existing', workspaceId },
    });
    git(
      a.workspaceRoot,
      'add',
      '--',
      b.relativeManifestPath,
      'specs/active/' + b.slug + '/overview.md',
    );
    git(
      a.workspaceRoot,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'shared conflict siblings',
    );
    await writeFile(join(root, 'shared-conflict.txt'), 'target owns text\n');
    git(root, 'add', '--', 'shared-conflict.txt');
    git(
      root,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'target introduces conflict',
    );
    await writeFile(join(a.workspaceRoot, 'shared-conflict.txt'), 'source owns different text\n');
    git(a.workspaceRoot, 'add', '--', 'shared-conflict.txt');
    git(
      a.workspaceRoot,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'source introduces conflict',
    );
    const targetHead = git(root, 'rev-parse', 'HEAD');
    const sourceHead = git(a.workspaceRoot, 'rev-parse', 'HEAD');
    const before = await engine.readRegistry();
    const operationId = randomUUID();
    const result = await closeWorkspace(engine, { operationId, workspaceId });
    expect(result.status).toBe('requires-resolution');
    expect((await inspectCloseOperation(engine, operationId))?.stage).toBe(
      'integration-scratch-conflict',
    );
    expect(git(root, 'rev-parse', 'HEAD')).toBe(targetHead);
    expect(git(a.workspaceRoot, 'rev-parse', 'HEAD')).toBe(sourceHead);
    expect((await engine.readRegistry()).specBindings).toEqual(before.specBindings);
    expect((await engine.readRegistry()).revision).toBe(before.revision);
    expect((await readWorkspaceSpecification(a.workspaceRoot, a.specId)).status).toBe('draft');
    expect((await readWorkspaceSpecification(a.workspaceRoot, b.specId)).status).toBe('draft');
    await expect(
      closeWorkspace(engine, { operationId: randomUUID(), workspaceId }),
    ).rejects.toMatchObject({ code: 'CLOSE_CONFLICT' });
  }, 180000);

  it('I03: prevents disposal when shared checkout incarnation changes after CAS', async () => {
    const { root, engine, spec: a } = await fixture(true);
    const b = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Incarnation sibling B',
      created: '2026-10-20',
      target: { kind: 'existing', workspaceId: a.workspaceId },
    });
    git(
      a.workspaceRoot,
      'add',
      '--',
      b.relativeManifestPath,
      'specs/active/' + b.slug + '/overview.md',
    );
    git(
      a.workspaceRoot,
      '-c',
      'user.name=Test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '-qm',
      'shared identity sources',
    );
    const operationId = randomUUID();
    await reserveCloseOperation(engine, {
      kind: 'workspace-close',
      operationId,
      workspaceId: a.workspaceId,
    });
    await prepareCloseGitIntegration(engine, operationId);
    await publishCloseGitFastForward(engine, operationId);
    await rebindVerifiedClose(engine, operationId);
    const registryBefore = await engine.readRegistry();
    const markerPath = join(a.workspaceRoot, '.nevo/local/state/workspace-identity.json');
    const oldMarker = await readFile(markerPath, 'utf8');
    try {
      const marker = JSON.parse(oldMarker) as Record<string, unknown>;
      await writeFile(markerPath, JSON.stringify({ ...marker, instanceId: randomUUID() }) + '\n');
      await expect(disposeReboundWorktree(engine, operationId)).rejects.toMatchObject({
        code: 'CLOSE_RECOVERY_REQUIRED',
      });
      expect((await inspectCloseOperation(engine, operationId))?.stage).toBe('binding-rebound');
      expect((await engine.readRegistry()).revision).toBe(registryBefore.revision);
      expect(
        (await engine.readRegistry()).workspaces.some((x) => x.workspaceId === a.workspaceId),
      ).toBe(true);
      expect(git(a.workspaceRoot, 'status', '--porcelain')).toBe('');
      expect((await readWorkspaceSpecification(root, a.specId)).status).toBe('draft');
      expect((await readWorkspaceSpecification(root, b.specId)).status).toBe('draft');
    } finally {
      await writeFile(markerPath, oldMarker);
    }
  }, 180000);

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

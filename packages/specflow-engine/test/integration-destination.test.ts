import { randomUUID } from 'node:crypto';
import { lstat, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  bootstrapProjectHome,
  closeWorktree,
  closeWorkspace,
  createSpecificationForTesting,
  inspectCreateOptions,
  inspectCloseOperation,
  previewCloseOperation,
  reserveCloseOperation,
  prepareCloseGitIntegration,
  publishCloseGitFastForward,
  reconcileCloseGitPublication,
  reconcileDisposedWorktree,
  rebindVerifiedClose,
  disposeReboundWorktree,
  inspectPendingDisposal,
  readWorkspaceSpecification,
  closeSpecification,
} from '../src/testing';
import { createGitTestProject, git, commitStaged } from './support/git-project';

const cleanup: string[] = [];
afterEach(async () => {
  for (const root of cleanup.splice(0).reverse()) {
    await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
  }
});

async function fixture() {
  const root = await createGitTestProject(
    'specflow-integration-destination-',
    'runtime: {}\ngit:\n  enabled: true\n  integrationTargetBranch: develop\n',
  );
  cleanup.push(root);
  git(root, 'branch', '-m', 'develop');
  const engine = await bootstrapProjectHome(root);
  const feature = await createSpecificationForTesting(engine, {
    operationId: randomUUID(),
    title: 'Platform feature',
    created: '2026-10-20',
    target: { kind: 'new-worktree', branch: 'feature/x', baseRef: 'refs/heads/develop' },
  });
  cleanup.push(dirname(feature.workspaceRoot));
  git(
    feature.workspaceRoot,
    'add',
    '--',
    feature.relativeManifestPath,
    'specs/active/' + feature.slug + '/overview.md',
  );
  commitStaged(feature.workspaceRoot, 'feature workspace baseline');
  return { root, engine, feature };
}

async function createCommittedChild(
  engine: Awaited<ReturnType<typeof bootstrapProjectHome>>,
  feature: { readonly workspaceId: string },
  title: string,
) {
  const child = await createSpecificationForTesting(engine, {
    operationId: randomUUID(),
    title,
    created: '2026-10-20',
    target: {
      kind: 'new-worktree',
      baseRef: 'refs/heads/feature/x',
      integrationTargetWorkspaceId: feature.workspaceId,
    },
  });
  git(
    child.workspaceRoot,
    'add',
    '--',
    child.relativeManifestPath,
    'specs/active/' + child.slug + '/overview.md',
  );
  commitStaged(child.workspaceRoot, 'source spec commit');
  return child;
}

describe('E2.I02 workspace-owned integration destination', () => {
  it('integrates spec/y into the registered feature/x checkout, leaving develop untouched', async () => {
    const { root, engine, feature } = await fixture();
    const developHead = git(root, 'rev-parse', 'HEAD');
    const created = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Destination-specific Spec',
      created: '2026-10-20',
      target: {
        kind: 'new-worktree',
        baseRef: 'refs/heads/feature/x',
        integrationTargetWorkspaceId: feature.workspaceId,
      },
    });
    const record = (await engine.readRegistry()).workspaces.find(
      (item) => item.workspaceId === created.workspaceId,
    );
    expect(record?.kind).toBe('linked');
    if (record?.kind !== 'linked') throw new Error('New workspace is not registered.');
    expect(record.integrationDestination).toEqual({
      workspaceId: feature.workspaceId,
      instanceId: (await engine.readRegistry()).workspaces.find(
        (item) => item.workspaceId === feature.workspaceId,
      )?.instanceId,
      branch: 'feature/x',
    });
    const options = await inspectCreateOptions(engine);
    expect(
      options.workspaces.find((item) => item.workspaceId === created.workspaceId),
    ).toMatchObject({
      integrationDestination: { workspaceId: feature.workspaceId, branch: 'feature/x' },
    });
    git(
      created.workspaceRoot,
      'add',
      '--',
      created.relativeManifestPath,
      'specs/active/' + created.slug + '/overview.md',
    );
    await mkdir(join(created.workspaceRoot, 'src'), { recursive: true });
    await writeFile(join(created.workspaceRoot, 'src/feature-y.txt'), 'published to feature/x\n');
    git(created.workspaceRoot, 'add', '--', 'src/feature-y.txt');
    commitStaged(created.workspaceRoot, 'complete destination-specific Spec');
    const sourceHead = git(created.workspaceRoot, 'rev-parse', 'HEAD');
    const closed = await closeWorktree(engine, {
      operationId: randomUUID(),
      specId: created.specId,
    });
    expect(closed.status).toBe('completed');
    expect(git(feature.workspaceRoot, 'rev-parse', 'HEAD')).toBe(sourceHead);
    expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('develop');
    expect(git(root, 'rev-parse', 'HEAD')).toBe(developHead);
    expect(git(root, 'status', '--porcelain')).toBe('');
    const current = await engine.readRegistry();
    expect(current.specBindings.find((item) => item.specId === created.specId)?.workspaceId).toBe(
      feature.workspaceId,
    );
    expect(current.workspaces.some((item) => item.workspaceId === created.workspaceId)).toBe(false);
    expect(git(feature.workspaceRoot, 'status', '--porcelain')).toBe('');
    expect(git(root, 'branch', '--list', 'feature/x')).not.toBe('');
  }, 180000);

  it('I03: closes a shared child worktree into feature/x without mutating develop', async () => {
    const { root, engine, feature } = await fixture();
    const developHead = git(root, 'rev-parse', 'HEAD');
    const originalFeatureHead = git(feature.workspaceRoot, 'rev-parse', 'HEAD');
    const child = await createCommittedChild(engine, feature, 'Shared child A');
    cleanup.push(dirname(child.workspaceRoot));
    const sibling = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Shared child B',
      created: '2026-10-20',
      target: { kind: 'existing', workspaceId: child.workspaceId },
    });
    git(
      child.workspaceRoot,
      'add',
      '--',
      sibling.relativeManifestPath,
      'specs/active/' + sibling.slug + '/overview.md',
    );
    commitStaged(child.workspaceRoot, 'shared child sibling');
    const sourceCommit = git(child.workspaceRoot, 'rev-parse', 'HEAD');
    const operationId = randomUUID();
    const result = await closeWorkspace(engine, {
      operationId,
      workspaceId: child.workspaceId,
    });
    expect(result.status).toBe('completed');
    expect(git(feature.workspaceRoot, 'rev-parse', 'HEAD')).toBe(sourceCommit);
    expect(git(feature.workspaceRoot, 'rev-parse', 'HEAD')).not.toBe(originalFeatureHead);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(developHead);
    expect((await readWorkspaceSpecification(feature.workspaceRoot, child.specId)).status).toBe(
      'draft',
    );
    expect((await readWorkspaceSpecification(feature.workspaceRoot, sibling.specId)).status).toBe(
      'draft',
    );
    const registry = await engine.readRegistry();
    for (const id of [child.specId, sibling.specId]) {
      expect(registry.specBindings.find((x) => x.specId === id)?.workspaceId).toBe(
        feature.workspaceId,
      );
    }
    expect(registry.workspaces.some((x) => x.workspaceId === child.workspaceId)).toBe(false);
    expect(registry.workspaces.some((x) => x.workspaceId === feature.workspaceId)).toBe(true);
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect(git(feature.workspaceRoot, 'status', '--porcelain')).toBe('');
    expect(
      (await closeWorkspace(engine, { operationId, workspaceId: child.workspaceId })).status,
    ).toBe('completed');
    expect(git(root, 'rev-parse', 'HEAD')).toBe(developHead);
  }, 180000);

  it('retains project-default primary target when the selector is omitted', async () => {
    const { engine } = await fixture();
    const created = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Default target Spec',
      created: '2026-10-20',
      target: { kind: 'new-worktree', baseRef: 'refs/heads/develop' },
    });
    const entry = (await engine.readRegistry()).workspaces.find(
      (item) => item.workspaceId === created.workspaceId,
    );
    expect(entry?.kind).toBe('linked');
    if (entry?.kind !== 'linked') throw new Error('Missing linked registration.');
    expect(entry.integrationDestination).toBeUndefined();
    git(
      created.workspaceRoot,
      'add',
      '--',
      created.relativeManifestPath,
      'specs/active/' + created.slug + '/overview.md',
    );
    commitStaged(created.workspaceRoot, 'default target source commit');
    const preview = await previewCloseOperation(engine, {
      kind: 'worktree-close',
      specId: created.specId,
      operationId: randomUUID(),
    });
    expect(preview.target?.workspaceId).toBe((await engine.readRegistry()).primaryWorkspaceId);
    expect(preview.target?.branch).toBe('develop');
  }, 180000);

  it('refuses dirty or detached explicit targets without creating a replacement worktree', async () => {
    const { engine, feature } = await fixture();
    const registryBefore = await engine.readRegistry();
    const operationId = randomUUID();
    await writeFile(join(feature.workspaceRoot, 'unexpected.txt'), 'dirty');
    await expect(
      createSpecificationForTesting(engine, {
        operationId,
        title: 'Unsafe destination',
        created: '2026-10-20',
        target: {
          kind: 'new-worktree',
          baseRef: 'HEAD',
          integrationTargetWorkspaceId: feature.workspaceId,
        },
      }),
    ).rejects.toMatchObject({ code: 'CREATE_OPERATION_INVALID' });
    await rm(join(feature.workspaceRoot, 'unexpected.txt'));
    git(feature.workspaceRoot, 'checkout', '--detach', 'HEAD');
    await expect(
      createSpecificationForTesting(engine, {
        operationId: randomUUID(),
        title: 'Detached destination',
        created: '2026-10-20',
        target: {
          kind: 'new-worktree',
          baseRef: 'HEAD',
          integrationTargetWorkspaceId: feature.workspaceId,
        },
      }),
    ).rejects.toMatchObject({ code: 'CREATE_OPERATION_INVALID' });
    expect(await engine.readRegistry()).toEqual(registryBefore);
  }, 180000);
  it('merges a divergent destination through detached scratch without changing primary', async () => {
    const { root, engine, feature } = await fixture();
    const primaryHead = git(root, 'rev-parse', 'HEAD');
    const child = await createCommittedChild(engine, feature, 'Divergent linked destination');
    await writeFile(join(feature.workspaceRoot, 'target-only.txt'), 'target branch change\n');
    git(feature.workspaceRoot, 'add', '--', 'target-only.txt');
    commitStaged(feature.workspaceRoot, 'advance target independently');
    const targetHead = git(feature.workspaceRoot, 'rev-parse', 'HEAD');
    const sourceHead = git(child.workspaceRoot, 'rev-parse', 'HEAD');
    const result = await closeWorktree(engine, {
      operationId: randomUUID(),
      specId: child.specId,
    });
    expect(result.status).toBe('completed');
    const merged = git(feature.workspaceRoot, 'rev-parse', 'HEAD');
    expect(merged).not.toBe(targetHead);
    expect(git(feature.workspaceRoot, 'rev-list', '--parents', '-n', '1', merged)).toBe(
      [merged, targetHead, sourceHead].join(' '),
    );
    expect(git(root, 'rev-parse', 'HEAD')).toBe(primaryHead);
    const bound = (await engine.readRegistry()).specBindings.find(
      (item) => item.specId === child.specId,
    );
    expect(bound?.workspaceId).toBe(feature.workspaceId);
  }, 180000);

  it('preserves a known conflicting linked target without publishing it or rebinding', async () => {
    const { root, engine, feature } = await fixture();
    await writeFile(join(feature.workspaceRoot, 'shared.txt'), 'baseline\n');
    git(feature.workspaceRoot, 'add', '--', 'shared.txt');
    commitStaged(feature.workspaceRoot, 'shared base');
    const child = await createCommittedChild(engine, feature, 'Conflicting linked destination');
    await writeFile(join(feature.workspaceRoot, 'shared.txt'), 'changed by target\n');
    git(feature.workspaceRoot, 'add', '--', 'shared.txt');
    commitStaged(feature.workspaceRoot, 'target edit');
    const targetHead = git(feature.workspaceRoot, 'rev-parse', 'HEAD');
    await writeFile(join(child.workspaceRoot, 'shared.txt'), 'changed by source\n');
    git(child.workspaceRoot, 'add', '--', 'shared.txt');
    commitStaged(child.workspaceRoot, 'source edit');
    const result = await closeWorktree(engine, {
      operationId: randomUUID(),
      specId: child.specId,
    });
    expect(result.status).toBe('requires-resolution');
    expect(git(feature.workspaceRoot, 'rev-parse', 'HEAD')).toBe(targetHead);
    expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('develop');
    const bound = (await engine.readRegistry()).specBindings.find(
      (item) => item.specId === child.specId,
    );
    expect(bound?.workspaceId).toBe(child.workspaceId);
  }, 180000);

  it('recovers publication to linked target after an injected crash without replaying Git merge', async () => {
    const { root, engine, feature } = await fixture();
    const primaryHead = git(root, 'rev-parse', 'HEAD');
    const child = await createCommittedChild(
      engine,
      feature,
      'Crash-reconciled linked destination',
    );
    const sourceHead = git(child.workspaceRoot, 'rev-parse', 'HEAD');
    const operationId = randomUUID();
    await reserveCloseOperation(engine, {
      kind: 'worktree-close',
      operationId,
      specId: child.specId,
    });
    await prepareCloseGitIntegration(engine, operationId);
    await expect(
      publishCloseGitFastForward(engine, operationId, undefined, () =>
        Promise.reject(new Error('injected crash after successful target publication')),
      ),
    ).rejects.toThrow('injected crash');
    expect((await inspectCloseOperation(engine, operationId))?.stage).toBe(
      'integration-publish-initiated',
    );
    expect(git(feature.workspaceRoot, 'rev-parse', 'HEAD')).toBe(sourceHead);
    await reconcileCloseGitPublication(engine, operationId, true);
    await rebindVerifiedClose(engine, operationId);
    const completed = await disposeReboundWorktree(engine, operationId);
    expect(completed.stage).toBe('completed');
    expect(git(root, 'rev-parse', 'HEAD')).toBe(primaryHead);
    const bound = (await engine.readRegistry()).specBindings.find(
      (item) => item.specId === child.specId,
    );
    expect(bound?.workspaceId).toBe(feature.workspaceId);
  }, 180000);

  it('recovers a linked-destination CAS rebind crash without a second CAS or Git integration', async () => {
    const { root, engine, feature } = await fixture();
    const primaryHead = git(root, 'rev-parse', 'HEAD');
    const child = await createCommittedChild(engine, feature, 'CAS-crash linked destination');
    const sourceHead = git(child.workspaceRoot, 'rev-parse', 'HEAD');
    const operationId = randomUUID();
    const initialRevision = (await engine.readRegistry()).revision;

    await reserveCloseOperation(engine, {
      kind: 'worktree-close',
      operationId,
      specId: child.specId,
    });
    await prepareCloseGitIntegration(engine, operationId);
    await publishCloseGitFastForward(engine, operationId);
    expect(git(feature.workspaceRoot, 'rev-parse', 'HEAD')).toBe(sourceHead);
    await expect(
      rebindVerifiedClose(engine, operationId, () =>
        Promise.reject(new Error('injected crash after linked-destination CAS')),
      ),
    ).rejects.toThrow('injected crash after linked-destination CAS');

    const afterCrash = await engine.readRegistry();
    expect((await inspectCloseOperation(engine, operationId))?.stage).toBe('integration-verified');
    expect(afterCrash.revision).toBe(initialRevision + 1);
    expect(afterCrash.specBindings.find((item) => item.specId === child.specId)).toMatchObject({
      workspaceId: feature.workspaceId,
      generation: afterCrash.revision,
    });
    expect(afterCrash.workspaces.some((item) => item.workspaceId === child.workspaceId)).toBe(true);

    const rebound = await rebindVerifiedClose(engine, operationId);
    expect(rebound.stage).toBe('binding-rebound');
    expect(rebound.reboundRevision).toBe(afterCrash.revision);
    expect((await engine.readRegistry()).revision).toBe(afterCrash.revision);
    expect(await rebindVerifiedClose(engine, operationId)).toEqual(rebound);
    const settled = await disposeReboundWorktree(engine, operationId);
    expect(settled.stage).toBe('completed');
    const finalRevision = (await engine.readRegistry()).revision;
    expect(finalRevision).toBe(initialRevision + 2);
    expect(await closeWorktree(engine, { operationId, specId: child.specId })).toMatchObject({
      status: 'completed',
    });
    expect((await engine.readRegistry()).revision).toBe(finalRevision);
    expect(git(feature.workspaceRoot, 'rev-parse', 'HEAD')).toBe(sourceHead);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(primaryHead);
    expect(git(root, 'rev-parse', 'refs/heads/' + settled.plan.source.branch)).toBe(sourceHead);
    await expect(lstat(child.workspaceRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  }, 180000);

  it('reconciles a linked-destination Git removal crash without removing or rebinding twice', async () => {
    const { root, engine, feature } = await fixture();
    const primaryHead = git(root, 'rev-parse', 'HEAD');
    const child = await createCommittedChild(engine, feature, 'Removal-crash linked destination');
    const sourceHead = git(child.workspaceRoot, 'rev-parse', 'HEAD');
    const operationId = randomUUID();
    const initialRevision = (await engine.readRegistry()).revision;
    await reserveCloseOperation(engine, {
      kind: 'worktree-close',
      operationId,
      specId: child.specId,
    });
    await prepareCloseGitIntegration(engine, operationId);
    await publishCloseGitFastForward(engine, operationId);
    await rebindVerifiedClose(engine, operationId);
    const afterRebind = (await engine.readRegistry()).revision;
    expect(afterRebind).toBe(initialRevision + 1);

    await expect(
      disposeReboundWorktree(engine, operationId, undefined, () =>
        Promise.reject(new Error('injected crash after linked worktree Git removal')),
      ),
    ).rejects.toThrow('injected crash after linked worktree Git removal');
    expect((await inspectCloseOperation(engine, operationId))?.stage).toBe('disposal-initiated');
    expect(await inspectPendingDisposal(engine, operationId)).toBe('source-removed');
    expect((await engine.readRegistry()).revision).toBe(afterRebind);
    expect(
      (await engine.readRegistry()).workspaces.some(
        (item) => item.workspaceId === child.workspaceId,
      ),
    ).toBe(true);
    await expect(lstat(child.workspaceRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(
      closeWorktree(engine, { operationId, specId: child.specId }),
    ).rejects.toMatchObject({ code: 'CLOSE_RECOVERY_REQUIRED' });
    expect((await inspectCloseOperation(engine, operationId))?.stage).toBe('disposal-initiated');

    const recovered = await reconcileDisposedWorktree(engine, operationId, true);
    expect(recovered.stage).toBe('completed');
    expect(recovered.outcome).toBe('worktree-integrated-and-removed');
    const finalRegistry = await engine.readRegistry();
    expect(finalRegistry.revision).toBe(initialRevision + 2);
    expect(
      finalRegistry.specBindings.find((item) => item.specId === child.specId)?.workspaceId,
    ).toBe(feature.workspaceId);
    expect(finalRegistry.workspaces.some((item) => item.workspaceId === child.workspaceId)).toBe(
      false,
    );
    expect(await closeWorktree(engine, { operationId, specId: child.specId })).toMatchObject({
      status: 'completed',
    });
    expect((await engine.readRegistry()).revision).toBe(finalRegistry.revision);
    expect(git(feature.workspaceRoot, 'rev-parse', 'HEAD')).toBe(sourceHead);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(primaryHead);
    await expect(lstat(child.workspaceRoot)).rejects.toMatchObject({ code: 'ENOENT' });
  }, 180000);

  it('archives a linked Specification then integrates into feature/x, rebinds and retires only spec/y', async () => {
    const { root, engine, feature } = await fixture();
    const primaryHead = git(root, 'rev-parse', 'HEAD');
    const child = await createCommittedChild(engine, feature, 'Archived linked destination');
    const sourceHead = git(child.workspaceRoot, 'rev-parse', 'HEAD');
    const featureHead = git(feature.workspaceRoot, 'rev-parse', 'HEAD');
    const operationId = randomUUID();
    const closed = await closeSpecification(engine, {
      operationId,
      specId: child.specId,
      integrateToTargetBranch: true,
    });
    expect(closed).toMatchObject({
      status: 'completed',
      journal: {
        stage: 'completed',
        outcome: 'integrated-and-removed',
        plan: {
          target: { workspaceId: feature.workspaceId, branch: 'feature/x' },
        },
      },
    });
    const archiveCommit = closed.journal.archive?.committedHead;
    expect(archiveCommit).toBeTruthy();
    expect(archiveCommit).not.toBe(sourceHead);
    expect(git(feature.workspaceRoot, 'rev-parse', 'HEAD')).toBe(archiveCommit);
    expect(git(feature.workspaceRoot, 'rev-list', '--parents', '-n', '1', archiveCommit!)).toBe(
      [archiveCommit, sourceHead].join(' '),
    );
    expect(
      git(feature.workspaceRoot, 'merge-base', '--is-ancestor', featureHead, archiveCommit!),
    ).toBe('');
    const archived = await readWorkspaceSpecification(feature.workspaceRoot, child.specId);
    expect(archived.location).toBe('archive');
    expect(archived.status).toBe('archived');
    expect(git(feature.workspaceRoot, 'ls-files', '--', 'specs/active/' + child.slug)).toBe('');
    expect(
      git(
        feature.workspaceRoot,
        'ls-files',
        '--',
        'specs/archive/' + child.slug + '/specification.yaml',
      ),
    ).not.toBe('');
    const finalRegistry = await engine.readRegistry();
    expect(
      finalRegistry.specBindings.find((item) => item.specId === child.specId)?.workspaceId,
    ).toBe(feature.workspaceId);
    expect(finalRegistry.workspaces.some((item) => item.workspaceId === child.workspaceId)).toBe(
      false,
    );
    expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('develop');
    expect(git(root, 'rev-parse', 'HEAD')).toBe(primaryHead);
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect(git(feature.workspaceRoot, 'status', '--porcelain')).toBe('');
    await expect(lstat(child.workspaceRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(
      (
        await closeSpecification(engine, {
          operationId,
          specId: child.specId,
          integrateToTargetBranch: true,
        })
      ).status,
    ).toBe('completed');
    expect(git(feature.workspaceRoot, 'rev-parse', 'HEAD')).toBe(archiveCommit);
  }, 180000);

  it('does not let another Close dispose a registered destination still referenced by a child', async () => {
    const { engine, feature } = await fixture();
    await createCommittedChild(engine, feature, 'Dependent linked specification');
    await expect(
      previewCloseOperation(engine, {
        kind: 'worktree-close',
        specId: feature.specId,
        operationId: randomUUID(),
      }),
    ).rejects.toMatchObject({ code: 'CLOSE_PREFLIGHT' });
  }, 180000);
});

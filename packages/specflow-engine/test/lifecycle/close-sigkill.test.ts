import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';

import { afterEach, describe, expect, it } from 'vitest';

import {
  assertResourcesAvailable,
  bootstrapProjectHome,
  closeSpecification,
  closeWorkspace,
  createSpecificationForTesting,
  inspectCloseOperation,
  inspectArchivePhysicalRecovery,
  archiveSpecificationWithCommit,
  inspectPendingDisposal,
  disposeReboundWorktree,
  openSpecFlowEngine,
  prepareCloseGitIntegration,
  prepareDivergentCloseCandidate,
  publishDivergentCloseCandidate,
  readWorkspaceSpecification,
  rebindVerifiedClose,
  reconcileArchiveCommit,
  reconcileCloseGitPublication,
  reconcileDisposedWorktree,
  reserveCloseOperation,
  withProjectControlLock,
} from '../../src/testing';
import { createGitTestProject, git, commitStaged } from '../support/git-project';
import {
  awaitProcessMarker,
  readProcessCheckpoint,
  reapVitestWorker,
  spawnVitestWorker,
  terminateCheckpointPid,
} from '../support/process-worker';

const cleanup: string[] = [];
afterEach(async () => {
  for (const root of cleanup.splice(0).reverse()) {
    await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
  }
});

async function project(
  kind: 'worktree-close' | 'specification-close' | 'workspace-close' = 'worktree-close',
  fastForward = false,
) {
  const root = await createGitTestProject(
    'specflow-close-sigkill-Ż ',
    'runtime: {}\ngit:\n  enabled: true\n',
  );
  cleanup.push(root);
  const branch = git(root, 'symbolic-ref', '--short', 'HEAD');
  await writeFile(
    join(root, '.nevo/config.yaml'),
    'runtime: {}\ngit:\n  enabled: true\n  integrationTargetBranch: ' + branch + '\n',
  );
  git(root, 'add', '.nevo/config.yaml');
  commitStaged(root, 'configure target');
  const engine = await bootstrapProjectHome(root);
  const spec = await createSpecificationForTesting(engine, {
    operationId: randomUUID(),
    title: 'Close SIGKILL proof',
    created: '2026-10-18',
    archetype: { id: 'minimal', version: 1 },
    target: { kind: 'new-worktree', baseRef: 'HEAD' },
  });
  cleanup.push(dirname(spec.workspaceRoot));
  git(
    spec.workspaceRoot,
    'add',
    '--',
    spec.relativeManifestPath,
    'specs/active/' + spec.slug + '/overview.md',
  );
  commitStaged(spec.workspaceRoot, 'commit source spec');
  const siblings: { specId: string; slug: string }[] = [];
  if (kind === 'workspace-close') {
    const registry = await engine.readRegistry();
    for (const title of ['Shared SIGKILL B', 'Shared SIGKILL C']) {
      const child = await createSpecificationForTesting(engine, {
        operationId: randomUUID(),
        title,
        created: '2026-10-20',
        archetype: { id: 'minimal', version: 1 },
        target: { kind: 'existing', workspaceId: spec.workspaceId },
      });
      siblings.push({ specId: child.specId, slug: child.slug });
      git(
        spec.workspaceRoot,
        'add',
        '--',
        child.relativeManifestPath,
        'specs/active/' + child.slug + '/overview.md',
      );
    }

    commitStaged(spec.workspaceRoot, 'commit two shared SIGKILL siblings');
    expect(
      (await engine.readRegistry()).specBindings.filter((x) => x.workspaceId === spec.workspaceId),
    ).toHaveLength(3);
    expect(registry.primaryWorkspaceId).not.toBe(spec.workspaceId);
    // Spec B becomes an archive-only sibling before whole-workspace closure.
    const archived = await closeSpecification(engine, {
      operationId: randomUUID(),
      specId: siblings[0]!.specId,
      integrateToTargetBranch: false,
    });
    expect(archived.status).toBe('completed');
  }

  if (fastForward) {
    // .gitattributes is introduced in the pinned source commit. During the
    // real fast-forward, Git executes the test-only smudge filter for this file.
    await writeFile(join(spec.workspaceRoot, '.gitattributes'), '*.nevo-smudge filter=nevoT17\n');
    await writeFile(join(spec.workspaceRoot, 'hold.nevo-smudge'), 'checkout data\n');
    git(spec.workspaceRoot, 'add', '.gitattributes', 'hold.nevo-smudge');
    commitStaged(spec.workspaceRoot, 'prepare filtered checkout');
  } else {
    await writeFile(join(root, 'target-only.txt'), 'target changes independently\n');
    git(root, 'add', 'target-only.txt');
    commitStaged(root, 'advance primary');
  }

  const operationId = randomUUID();
  if (kind === 'worktree-close' || kind === 'workspace-close') {
    if (kind === 'workspace-close') {
      await reserveCloseOperation(engine, { kind, operationId, workspaceId: spec.workspaceId });
    } else {
      await reserveCloseOperation(engine, { kind, operationId, specId: spec.specId });
    }

    await prepareCloseGitIntegration(engine, operationId);
  } else {
    await reserveCloseOperation(engine, {
      kind,
      operationId,
      specId: spec.specId,
      integrateToTargetBranch: false,
    });
  }

  return { root, spec, siblings, engine, operationId };
}

async function killAtCheckpoint(root: string, operationId: string, stage: string): Promise<void> {
  const signal = join(tmpdir(), 'specflow-close-kill-' + randomUUID() + '.json');
  cleanup.push(signal);
  const child = spawnVitestWorker(
    'test/fixtures/close-sigkill-worker.test.ts',
    {
      NEVO_CLOSE_SIGKILL_WORKER: '1',
      NEVO_CLOSE_SIGKILL_ROOT: root,
      NEVO_CLOSE_SIGKILL_OPERATION: operationId,
      NEVO_CLOSE_SIGKILL_STAGE: stage,
      NEVO_CLOSE_SIGKILL_SIGNAL: signal,
    },
    90000,
  );
  try {
    await awaitProcessMarker(signal, child, 60000, 35);
    const checkpoint = await readProcessCheckpoint(signal, stage, operationId);
    const outcome = await terminateCheckpointPid(checkpoint.pid, child);
    expect(outcome.code, outcome.log).not.toBe(0);
  } finally {
    // Even on marker validation failure/timeout, do not remove evidence while
    // a real subprocess might still be running.
    await reapVitestWorker(child);
    await rm(signal, { force: true });
  }
}

describe('E2.I03 three-owner OS-process SIGKILL regression', () => {
  it('kills the actual publisher after source publication, reconciles without replay', async () => {
    const { root, spec, siblings, engine, operationId } = await project('workspace-close', true);
    const originalRegistry = await engine.readRegistry();
    const ids = [spec.specId, ...siblings.map((x) => x.specId)];
    const sourceCommit = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    await killAtCheckpoint(root, operationId, 'publish-complete-before-proof');
    const reopened = await openSpecFlowEngine({ cwd: root });
    expect((await inspectCloseOperation(reopened, operationId))?.stage).toBe(
      'integration-publish-initiated',
    );
    expect(git(root, 'rev-parse', 'HEAD')).toBe(sourceCommit);
    expect((await reopened.readRegistry()).revision).toBe(originalRegistry.revision);
    await expect(reconcileCloseGitPublication(reopened, operationId, false)).rejects.toMatchObject({
      code: 'CLOSE_RECOVERY_REQUIRED',
    });
    const published = await reconcileCloseGitPublication(reopened, operationId, true);
    expect(published.stage).toBe('integration-verified');
    expect(published.integration?.publishedCommit).toBe(sourceCommit);
    await rebindVerifiedClose(reopened, operationId);
    const rebound = await reopened.readRegistry();
    expect(rebound.revision).toBe(originalRegistry.revision + 1);
    for (const id of ids) {
      expect(rebound.specBindings.find((x) => x.specId === id)?.workspaceId).toBe(
        rebound.primaryWorkspaceId,
      );
    }

    const disposed = await disposeReboundWorktree(reopened, operationId);
    expect(disposed.stage).toBe('completed');
    expect(
      (
        await closeWorkspace(reopened, {
          operationId,
          workspaceId: spec.workspaceId,
        })
      ).status,
    ).toBe('completed');
    expect((await reopened.readRegistry()).revision).toBe(originalRegistry.revision + 2);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(sourceCommit);
    for (const [id, status] of ids.map((id, i) => [id, i === 1 ? 'archived' : 'draft'] as const)) {
      expect((await readWorkspaceSpecification(root, id)).status).toBe(status);
    }
  }, 180000);

  it('kills the actual worker after multi-binding CAS, resumes one journal', async () => {
    const { root, spec, siblings, engine, operationId } = await project('workspace-close');
    await prepareDivergentCloseCandidate(engine, operationId);
    const published = await publishDivergentCloseCandidate(engine, operationId);
    expect(published.stage).toBe('integration-verified');
    const head = git(root, 'rev-parse', 'HEAD');
    const before = await engine.readRegistry();
    await killAtCheckpoint(root, operationId, 'rebind-cas');
    const reopened = await openSpecFlowEngine({ cwd: root });
    expect((await inspectCloseOperation(reopened, operationId))?.stage).toBe(
      'integration-verified',
    );
    const rebound = await reopened.readRegistry();
    expect(rebound.revision).toBe(before.revision + 1);
    for (const id of [spec.specId, ...siblings.map((x) => x.specId)]) {
      expect(rebound.specBindings.find((x) => x.specId === id)).toMatchObject({
        workspaceId: rebound.primaryWorkspaceId,
        generation: rebound.revision,
      });
    }

    expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
    const recovered = await rebindVerifiedClose(reopened, operationId);
    expect(recovered.stage).toBe('binding-rebound');
    expect((await reopened.readRegistry()).revision).toBe(rebound.revision);
    await disposeReboundWorktree(reopened, operationId);
    expect(
      (
        await closeWorkspace(reopened, {
          operationId,
          workspaceId: spec.workspaceId,
        })
      ).status,
    ).toBe('completed');
    expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
  }, 180000);

  it('kills after physical Git worktree remove, retires all occupants once', async () => {
    const { root, spec, siblings, engine, operationId } = await project('workspace-close');
    await prepareDivergentCloseCandidate(engine, operationId);
    await publishDivergentCloseCandidate(engine, operationId);
    await rebindVerifiedClose(engine, operationId);
    const before = await engine.readRegistry();
    const head = git(root, 'rev-parse', 'HEAD');
    await killAtCheckpoint(root, operationId, 'removed-pre-retirement');
    const reopened = await openSpecFlowEngine({ cwd: root });
    expect((await inspectCloseOperation(reopened, operationId))?.stage).toBe('disposal-initiated');
    expect(await inspectPendingDisposal(reopened, operationId)).toBe('source-removed');
    await expect(access(spec.workspaceRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(reconcileDisposedWorktree(reopened, operationId, false)).rejects.toMatchObject({
      code: 'CLOSE_RECOVERY_REQUIRED',
    });
    expect((await reopened.readRegistry()).revision).toBe(before.revision);
    const reconciled = await reconcileDisposedWorktree(reopened, operationId, true);
    expect(reconciled.stage).toBe('completed');
    const after = await reopened.readRegistry();
    expect(after.revision).toBe(before.revision + 1);
    expect(after.workspaces.some((x) => x.workspaceId === spec.workspaceId)).toBe(false);
    for (const id of [spec.specId, ...siblings.map((x) => x.specId)]) {
      expect(after.specBindings.find((x) => x.specId === id)?.workspaceId).toBe(
        after.primaryWorkspaceId,
      );
    }

    expect(
      (
        await closeWorkspace(reopened, {
          operationId,
          workspaceId: spec.workspaceId,
        })
      ).status,
    ).toBe('completed');
    expect((await reopened.readRegistry()).revision).toBe(after.revision);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
  }, 180000);
});

describe('E2.T11 actual OS-process SIGKILL and physical reconciliation', () => {
  it('kills the scratch creator after journal intent and forbids Git replay', async () => {
    const { root, engine, spec, operationId } = await project();
    const target = git(root, 'rev-parse', 'HEAD');
    await killAtCheckpoint(root, operationId, 'scratch-intent');
    const reopened = await openSpecFlowEngine({ cwd: root });
    const record = await inspectCloseOperation(reopened, operationId);
    expect(record?.stage).toBe('integration-scratch-initiated');
    expect(record?.scratch?.instanceId).toMatch(/^[a-f0-9-]{36}$/u);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(target);
    await expect(prepareDivergentCloseCandidate(reopened, operationId)).rejects.toMatchObject({
      code: 'CLOSE_CONFLICT',
    });
    await expect(
      reserveCloseOperation(engine, {
        kind: 'worktree-close',
        operationId: randomUUID(),
        specId: spec.specId,
      }),
    ).rejects.toMatchObject({ code: 'CLOSE_CONFLICT' });
  }, 150000);

  it('kills publisher after durable intent, reconciles exact Git result without repeat', async () => {
    const { root, engine, operationId } = await project();
    const prepared = await prepareDivergentCloseCandidate(engine, operationId);
    const candidate = prepared.scratch?.candidateCommit;
    expect(candidate).toBeDefined();
    const target = git(root, 'rev-parse', 'HEAD');
    await killAtCheckpoint(root, operationId, 'publish-intent');
    const reopened = await openSpecFlowEngine({ cwd: root });
    expect((await inspectCloseOperation(reopened, operationId))?.stage).toBe(
      'integration-publish-initiated',
    );
    await expect(reconcileCloseGitPublication(reopened, operationId, false)).rejects.toMatchObject({
      code: 'CLOSE_RECOVERY_REQUIRED',
    });
    await expect(reconcileCloseGitPublication(reopened, operationId, true)).rejects.toMatchObject({
      code: 'CLOSE_RECOVERY_REQUIRED',
    });
    expect(git(root, 'rev-parse', 'HEAD')).toBe(target);
    git(root, 'merge', '--ff-only', candidate!);
    const recovered = await reconcileCloseGitPublication(reopened, operationId, true);
    expect(recovered.stage).toBe('integration-verified');
    expect(recovered.integration?.publishedCommit).toBe(candidate);
    expect(git(root, 'write-tree')).toBe(prepared.scratch?.candidateTree);
    expect(git(root, 'status', '--porcelain')).toBe('');
  }, 150000);

  it('LC22: SIGKILL after CAS rebind, journal recovery has no duplicate CAS', async () => {
    const { root, spec, engine, operationId } = await project();
    const prepared = await prepareDivergentCloseCandidate(engine, operationId);
    expect(prepared.stage).toBe('integration-scratch-candidate');
    const published = await publishDivergentCloseCandidate(engine, operationId);
    expect(published.stage).toBe('integration-verified');
    const before = await engine.readRegistry();
    const targetHead = git(root, 'rev-parse', 'HEAD');
    await killAtCheckpoint(root, operationId, 'rebind-cas');
    const reopened = await openSpecFlowEngine({ cwd: root });
    const journal = await inspectCloseOperation(reopened, operationId);
    expect(journal?.stage).toBe('integration-verified');
    const afterCrash = await reopened.readRegistry();
    expect(afterCrash.revision).toBe(before.revision + 1);
    expect(afterCrash.specBindings.find((x) => x.specId === spec.specId)?.workspaceId).toBe(
      afterCrash.primaryWorkspaceId,
    );
    await access(spec.workspaceRoot);
    const rebound = await rebindVerifiedClose(reopened, operationId);
    expect(rebound.stage).toBe('binding-rebound');
    expect(rebound.reboundRevision).toBe(afterCrash.revision);
    expect((await reopened.readRegistry()).revision).toBe(afterCrash.revision);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(targetHead);
    expect(git(root, 'status', '--porcelain')).toBe('');
  }, 150000);

  it('LC22: SIGKILL after disposal intent cannot claim removed worktree', async () => {
    const { root, spec, engine, operationId } = await project();
    await prepareDivergentCloseCandidate(engine, operationId);
    await publishDivergentCloseCandidate(engine, operationId);
    await rebindVerifiedClose(engine, operationId);
    const registry = await engine.readRegistry();
    await killAtCheckpoint(root, operationId, 'disposal-intent');
    const reopened = await openSpecFlowEngine({ cwd: root });
    const journal = await inspectCloseOperation(reopened, operationId);
    expect(journal?.stage).toBe('disposal-initiated');
    expect(await inspectPendingDisposal(reopened, operationId)).toBe('original-checkout-present');
    await access(spec.workspaceRoot);
    await expect(reconcileDisposedWorktree(reopened, operationId, false)).rejects.toMatchObject({
      code: 'CLOSE_RECOVERY_REQUIRED',
    });
    await expect(reconcileDisposedWorktree(reopened, operationId, true)).rejects.toMatchObject({
      code: 'CLOSE_RECOVERY_REQUIRED',
    });
    expect((await reopened.readRegistry()).revision).toBe(registry.revision);
    expect(
      (await reopened.readRegistry()).workspaces.some((x) => x.root === spec.workspaceRoot),
    ).toBe(true);
    expect(git(root, 'status', '--porcelain')).toBe('');
  }, 150000);

  it('LC19: SIGKILL before atomic archive move retains original and immutable intent', async () => {
    const { root, spec, operationId } = await project('specification-close');
    const originalHead = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    const primaryHead = git(root, 'rev-parse', 'HEAD');
    await killAtCheckpoint(root, operationId, 'archive-before-move');
    const reopened = await openSpecFlowEngine({ cwd: root });
    expect((await inspectCloseOperation(reopened, operationId))?.stage).toBe('archive-initiated');
    expect(await inspectArchivePhysicalRecovery(reopened, operationId)).toBe('source-unmoved');
    await access(join(spec.workspaceRoot, 'specs/active/' + spec.slug, 'specification.yaml'));
    await expect(
      access(join(spec.workspaceRoot, 'specs/archive/' + spec.slug)),
    ).rejects.toMatchObject({
      code: 'ENOENT',
    });
    expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).toBe(originalHead);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(primaryHead);
    expect(git(spec.workspaceRoot, 'status', '--porcelain')).toBe('');
    await expect(archiveSpecificationWithCommit(reopened, operationId)).rejects.toMatchObject({
      code: 'CLOSE_PREFLIGHT',
    });
    expect((await inspectCloseOperation(reopened, operationId))?.stage).toBe('archive-initiated');
  }, 150000);

  it('LC19: SIGKILL after archive rename retains physical state', async () => {
    const { root, spec, operationId } = await project('specification-close');
    const sourceHead = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    const primaryHead = git(root, 'rev-parse', 'HEAD');
    await killAtCheckpoint(root, operationId, 'archive-after-move');
    const reopened = await openSpecFlowEngine({ cwd: root });
    const journal = await inspectCloseOperation(reopened, operationId);
    expect(journal?.stage).toBe('archive-initiated');
    expect(await inspectArchivePhysicalRecovery(reopened, operationId)).toBe(
      'moved-original-manifest',
    );
    const sourcePath = join(spec.workspaceRoot, 'specs/active/' + spec.slug);
    const archivePath = join(spec.workspaceRoot, 'specs/archive/' + spec.slug);
    await expect(access(sourcePath)).rejects.toMatchObject({ code: 'ENOENT' });
    await access(join(archivePath, 'specification.yaml'));
    expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).toBe(sourceHead);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(primaryHead);
    // A process restart must inspect the persisted intent, not rename again.
    await expect(archiveSpecificationWithCommit(reopened, operationId)).rejects.toMatchObject({
      code: 'CLOSE_PREFLIGHT',
    });
    expect((await inspectCloseOperation(reopened, operationId))?.stage).toBe('archive-initiated');
  }, 150000);

  it('LC33: killed archive staging refuses alien index additions', async () => {
    const { root, spec, operationId } = await project('specification-close');
    const primaryHead = git(root, 'rev-parse', 'HEAD');
    const sourceHead = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    await killAtCheckpoint(root, operationId, 'archive-after-staging');
    const reopened = await openSpecFlowEngine({ cwd: root });
    const record = await inspectCloseOperation(reopened, operationId);
    expect(record?.stage).toBe('archive-commit-initiated');
    expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).toBe(sourceHead);
    const stagedBefore = git(spec.workspaceRoot, 'diff', '--cached', '--name-only', '-z');
    expect(stagedBefore).toContain('specs/archive/' + spec.slug + '/specification.yaml');
    expect(stagedBefore).not.toContain('alien-stage.txt');

    await writeFile(join(spec.workspaceRoot, 'alien-stage.txt'), 'unrelated indexed data\n');
    git(spec.workspaceRoot, 'add', '--', 'alien-stage.txt');
    const stageWithAlien = git(spec.workspaceRoot, 'diff', '--cached', '--name-only', '-z');
    expect(stageWithAlien).toContain('alien-stage.txt');
    const oldPath = ':(literal)specs/active/' + spec.slug;
    const newPath = ':(literal)specs/archive/' + spec.slug;
    git(
      spec.workspaceRoot,
      '-c',
      'user.name=SpecFlow Test',
      '-c',
      'user.email=specflow@example.invalid',
      'commit',
      '--only',
      '-m',
      'externally settle scoped archive before recovery',
      '--',
      oldPath,
      newPath,
    );
    expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).not.toBe(sourceHead);
    expect(git(spec.workspaceRoot, 'diff', '--cached', '--name-only')).toBe('alien-stage.txt');
    await expect(reconcileArchiveCommit(reopened, operationId, true)).rejects.toMatchObject({
      code: 'CLOSE_RECOVERY_REQUIRED',
    });
    expect((await inspectCloseOperation(reopened, operationId))?.stage).toBe(
      'archive-commit-initiated',
    );
    expect(git(root, 'rev-parse', 'HEAD')).toBe(primaryHead);
    expect(git(spec.workspaceRoot, 'diff', '--cached', '--name-only')).toBe('alien-stage.txt');
  }, 150000);

  it('LC33: staged archive reconciles once after explicit exact scoped Git settlement', async () => {
    const { root, spec, operationId } = await project('specification-close');
    const primaryHead = git(root, 'rev-parse', 'HEAD');
    const sourceHead = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    await killAtCheckpoint(root, operationId, 'archive-after-staging');
    const reopened = await openSpecFlowEngine({ cwd: root });
    const pending = await inspectCloseOperation(reopened, operationId);
    expect(pending?.stage).toBe('archive-commit-initiated');
    expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).toBe(sourceHead);
    expect(git(spec.workspaceRoot, 'status', '--porcelain')).not.toBe('');
    await expect(reconcileArchiveCommit(reopened, operationId, false)).rejects.toMatchObject({
      code: 'CLOSE_RECOVERY_REQUIRED',
    });
    // A completed Git commit cannot be inferred from the exact staged index.
    await expect(reconcileArchiveCommit(reopened, operationId, true)).rejects.toMatchObject({
      code: 'CLOSE_RECOVERY_REQUIRED',
    });
    expect((await inspectCloseOperation(reopened, operationId))?.stage).toBe(
      'archive-commit-initiated',
    );
    const oldPath = ':(literal)specs/active/' + spec.slug;
    const newPath = ':(literal)specs/archive/' + spec.slug;
    // Explicit operator settlement of the already-staged, pinned operation.
    // Recovery is proof-only: Engine must NOT issue another uncertain commit.
    git(
      spec.workspaceRoot,
      '-c',
      'user.name=Nevo SpecFlow Engine',
      '-c',
      'user.email=engine@nevo.invalid',
      'commit',
      '--only',
      '-m',
      'archive(spec): ' + spec.slug + ' [operation:' + operationId + ']',
      '--',
      oldPath,
      newPath,
    );
    const archivedHead = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    expect(archivedHead).not.toBe(sourceHead);
    expect(git(spec.workspaceRoot, 'status', '--porcelain')).toBe('');
    const verified = await reconcileArchiveCommit(reopened, operationId, true);
    expect(verified.stage).toBe('archive-committed');
    expect(verified.archive?.sourceCommit).toBe(sourceHead);
    expect(verified.archive?.committedHead).toBe(archivedHead);
    await expect(reconcileArchiveCommit(reopened, operationId, true)).rejects.toMatchObject({
      code: 'CLOSE_RECOVERY_REQUIRED',
    });
    const closed = await closeSpecification(reopened, {
      operationId,
      specId: spec.specId,
      integrateToTargetBranch: false,
    });
    expect(closed.status).toBe('completed');
    expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).toBe(archivedHead);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(primaryHead);
    expect(git(root, 'status', '--porcelain')).toBe('');
  }, 150000);

  it('LC20: SIGKILL after Git archive commit recovers without replay', async () => {
    const { root, spec, operationId } = await project('specification-close');
    const headBefore = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    await killAtCheckpoint(root, operationId, 'archive-commit');
    const reopened = await openSpecFlowEngine({ cwd: root });
    const persisted = await inspectCloseOperation(reopened, operationId);
    expect(persisted?.stage).toBe('archive-commit-initiated');
    const archivedHead = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    expect(archivedHead).not.toBe(headBefore);
    expect(git(spec.workspaceRoot, 'status', '--porcelain')).toBe('');
    const verified = await reconcileArchiveCommit(reopened, operationId, true);
    expect(verified.stage).toBe('archive-committed');
    expect(verified.archive?.committedHead).toBe(archivedHead);
    expect((await readWorkspaceSpecification(spec.workspaceRoot, spec.specId)).location).toBe(
      'archive',
    );
    const closed = await closeSpecification(reopened, {
      operationId,
      specId: spec.specId,
      integrateToTargetBranch: false,
    });
    expect(closed.status).toBe('completed');
    expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).toBe(archivedHead);
  }, 150000);

  it('LC22: SIGKILL after actual worktree removal recovers once', async () => {
    const { root, spec, engine, operationId } = await project();
    await prepareDivergentCloseCandidate(engine, operationId);
    await publishDivergentCloseCandidate(engine, operationId);
    await rebindVerifiedClose(engine, operationId);
    const before = await engine.readRegistry();
    const primaryHead = git(root, 'rev-parse', 'HEAD');

    await killAtCheckpoint(root, operationId, 'removed-pre-retirement');
    const reopened = await openSpecFlowEngine({ cwd: root });
    const incomplete = await inspectCloseOperation(reopened, operationId);
    expect(incomplete?.stage).toBe('disposal-initiated');
    expect(await inspectPendingDisposal(reopened, operationId)).toBe('source-removed');
    await expect(access(spec.workspaceRoot)).rejects.toMatchObject({ code: 'ENOENT' });
    expect((await reopened.readRegistry()).revision).toBe(before.revision);
    await expect(reconcileDisposedWorktree(reopened, operationId, false)).rejects.toMatchObject({
      code: 'CLOSE_RECOVERY_REQUIRED',
    });

    const reconciled = await reconcileDisposedWorktree(reopened, operationId, true);
    expect(reconciled.stage).toBe('completed');
    expect(reconciled.outcome).toBe('worktree-integrated-and-removed');
    const after = await reopened.readRegistry();
    expect(after.revision).toBe(before.revision + 1);
    expect(after.specBindings.find((item) => item.specId === spec.specId)?.workspaceId).toBe(
      after.primaryWorkspaceId,
    );
    expect(after.workspaces.some((item) => item.root === spec.workspaceRoot)).toBe(false);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(primaryHead);
    expect(git(root, 'status', '--porcelain')).toBe('');
    await expect(reconcileDisposedWorktree(reopened, operationId, true)).rejects.toMatchObject({
      code: 'CLOSE_CONFLICT',
    });
    expect((await reopened.readRegistry()).revision).toBe(after.revision);
  }, 150000);

  it('LC21: killing the active Git merge leaves uncertain physical state fenced', async () => {
    const { root, spec, operationId } = await project('worktree-close', true);
    const originalHead = git(root, 'rev-parse', 'HEAD');
    const sourceHead = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    const filterScript = join(tmpdir(), 'nevo-t17-smudge-' + randomUUID() + '.cjs');
    const signalPrefix = join(tmpdir(), 'nevo-t17-merge-' + randomUUID());
    const filterSignal = signalPrefix + '.filter';
    const gitPidSignal = signalPrefix + '.git';
    const outcomeSignal = signalPrefix + '.outcome';
    cleanup.push(filterScript, filterSignal, gitPidSignal, outcomeSignal);
    await writeFile(
      filterScript,
      [
        "const fs = require('node:fs');",
        'const chunks = [];',
        "process.stdin.on('data', (chunk) => chunks.push(chunk));",
        "process.stdin.on('end', () => {",
        '  process.stdout.write(Buffer.concat(chunks));',
        '  fs.writeFileSync(process.env.NEVO_CLOSE_FILTER_SIGNAL, JSON.stringify({ pid: process.pid }));',
        '  setInterval(() => undefined, 1000);',
        '});',
      ].join('\n') + '\n',
    );
    git(
      root,
      'config',
      'filter.nevoT17.smudge',
      'node "' + filterScript.replaceAll('\\', '/') + '"',
    );
    const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
    const vitestEntry = resolve(
      dirname(fileURLToPath(import.meta.resolve('vitest'))),
      '..',
      'vitest.mjs',
    );
    const child = spawn(
      process.execPath,
      [
        vitestEntry,
        'run',
        'test/fixtures/close-sigkill-worker.test.ts',
        '--maxWorkers=1',
        '--testTimeout=90000',
      ],
      {
        cwd: packageRoot,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: {
          ...process.env,
          NEVO_CLOSE_SIGKILL_WORKER: '1',
          NEVO_CLOSE_SIGKILL_ROOT: root,
          NEVO_CLOSE_SIGKILL_OPERATION: operationId,
          NEVO_CLOSE_SIGKILL_STAGE: 'live-merge-child',
          NEVO_CLOSE_SIGKILL_SIGNAL: signalPrefix,
          NEVO_CLOSE_FILTER_SIGNAL: filterSignal,
          NEVO_CLOSE_GIT_PID_SIGNAL: gitPidSignal,
          NEVO_CLOSE_GIT_OUTCOME_SIGNAL: outcomeSignal,
        },
      },
    );
    let output = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => {
      output += chunk;
    });
    child.stderr.on('data', (chunk: string) => {
      output += chunk;
    });
    const done = new Promise<number | null>((resolveDone, reject) => {
      child.once('error', reject);
      child.once('close', resolveDone);
    });
    let filterPid: number | undefined;
    try {
      const deadline = Date.now() + 90000;
      while (true) {
        try {
          await access(filterSignal);
          await access(gitPidSignal);
          break;
        } catch {
          if (Date.now() >= deadline) {
            throw new Error('Active Git smudge checkpoint not reached: ' + output);
          }

          await sleep(40);
        }
      }

      const filter = JSON.parse(await readFile(filterSignal, 'utf8')) as { pid: number };
      const gitChild = JSON.parse(await readFile(gitPidSignal, 'utf8')) as { pid: number };
      filterPid = filter.pid;
      expect(gitChild.pid).toBeGreaterThan(0);
      expect(filter.pid).toBeGreaterThan(0);
      // The filter has consumed the blob and is still running inside the
      // checked-out fast-forward. Kill the real Git process, not the test worker.
      process.kill(gitChild.pid, 'SIGKILL');
      try {
        process.kill(filter.pid, 'SIGKILL');
      } catch {
        /* already terminated */
      }

      filterPid = undefined;
      const code = await Promise.race([
        done,
        sleep(30000).then(() => {
          child.kill();

          throw new Error('Git worker did not settle.');
        }),
      ]);
      expect(code, output).toBe(0);
      expect(JSON.parse(await readFile(outcomeSignal, 'utf8'))).toEqual({
        result: 'recovery-required',
      });
      const reopened = await openSpecFlowEngine({ cwd: root });
      expect((await inspectCloseOperation(reopened, operationId))?.stage).toBe(
        'integration-publish-initiated',
      );
      const observedHead = git(root, 'rev-parse', 'HEAD');
      const observedIndex = git(root, 'ls-files', '--stage');
      const observedPhysical = git(root, 'status', '--porcelain', '--untracked-files=all');
      // Git for Windows may advance HEAD before a blocked smudge filter finishes.
      // SIGKILL does not imply that HEAD must remain at its original value.
      // Only the two pinned commits are valid; do not accept an unrelated ref.
      expect([originalHead, sourceHead]).toContain(observedHead);
      expect(observedIndex.length).toBeGreaterThan(0);
      // A killed Git process can leave index.lock behind. Do not invoke
      // git write-tree here: it tries to acquire the same lock and is not a
      // safe observer of an interrupted publication.
      const staleIndexLock = await access(join(root, '.git', 'index.lock'))
        .then(() => true)
        .catch((error: unknown) => {
          if (
            error instanceof Error &&
            'code' in error &&
            (error as NodeJS.ErrnoException).code === 'ENOENT'
          ) {
            return false;
          }

          throw error;
        });
      const fullyPublished =
        observedHead === sourceHead && observedPhysical === '' && !staleIndexLock;
      const registryBefore = await reopened.readRegistry();
      // A lost mutating child can never be reconciled without independent
      // confirmation of process quiescence, even if Git appears complete.
      await expect(
        reconcileCloseGitPublication(reopened, operationId, false),
      ).rejects.toMatchObject({ code: 'CLOSE_RECOVERY_REQUIRED' });
      if (fullyPublished) {
        // The child was killed, but all pinned physical evidence is complete.
        // Proof-only recovery is permitted; Git must not be executed again.
        const verified = await reconcileCloseGitPublication(reopened, operationId, true);
        expect(verified.stage).toBe('integration-verified');
        expect(verified.integration?.publishedCommit).toBe(sourceHead);
      } else {
        // HEAD, index or worktree still differs from the pinned publication.
        // Retain the durable intent; never replay the uncertain merge.
        await expect(
          reconcileCloseGitPublication(reopened, operationId, true),
        ).rejects.toMatchObject({ code: 'CLOSE_RECOVERY_REQUIRED' });
      }

      expect(await reopened.readRegistry()).toEqual(registryBefore);
      // Admission remains blocked both for torn publication and for a
      // verified-but-not-yet-rebound Close journal.
      let admissionFailure: unknown;
      try {
        await reserveCloseOperation(reopened, {
          kind: 'worktree-close',
          operationId: randomUUID(),
          specId: spec.specId,
        });
      } catch (error) {
        admissionFailure = error;
      }

      expect(admissionFailure).toBeDefined();
      const admissionCode: unknown = (admissionFailure as { code?: unknown }).code;
      expect(['CLOSE_PREFLIGHT', 'CLOSE_CONFLICT']).toContain(admissionCode);
      const retained = await inspectCloseOperation(reopened, operationId);
      expect(retained?.stage).toBe(
        fullyPublished ? 'integration-verified' : 'integration-publish-initiated',
      );
      await withProjectControlLock(reopened.context, async () => {
        await expect(
          assertResourcesAvailable(reopened.context, retained!.plan.resources),
        ).rejects.toMatchObject({ code: 'CLOSE_CONFLICT' });
      });
      expect(git(root, 'rev-parse', 'HEAD')).toBe(observedHead);
      expect(git(root, 'ls-files', '--stage')).toBe(observedIndex);
      expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe(observedPhysical);
    } finally {
      if (filterPid) {
        try {
          process.kill(filterPid, 'SIGKILL');
        } catch {
          /* already exited */
        }
      }

      child.kill();
      await Promise.allSettled([done]);
    }
  }, 180000);

  it('LC21: SIGKILL after ref advance but before index update fails closed', async () => {
    const { root, spec, operationId } = await project('worktree-close', true);
    const targetHead = git(root, 'rev-parse', 'HEAD');
    const sourceHead = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    const oldTree = git(root, 'write-tree');
    const oldIndex = git(root, 'ls-files', '--stage');
    await killAtCheckpoint(root, operationId, 'torn-publish-head');
    const reopened = await openSpecFlowEngine({ cwd: root });
    expect((await inspectCloseOperation(reopened, operationId))?.stage).toBe(
      'integration-publish-initiated',
    );
    expect(git(root, 'rev-parse', 'HEAD')).toBe(sourceHead);
    expect(git(root, 'rev-parse', 'HEAD')).not.toBe(targetHead);
    expect(git(root, 'write-tree')).toBe(oldTree);
    expect(git(root, 'ls-files', '--stage')).toBe(oldIndex);
    const registry = await reopened.readRegistry();
    await expect(reconcileCloseGitPublication(reopened, operationId, true)).rejects.toMatchObject({
      code: 'CLOSE_RECOVERY_REQUIRED',
    });
    expect(await reopened.readRegistry()).toEqual(registry);
    expect((await inspectCloseOperation(reopened, operationId))?.stage).toBe(
      'integration-publish-initiated',
    );
    // Externally settle the already-advanced branch into complete Git state.
    // Reconciliation is proof-only: it does not run this command itself.
    git(root, 'reset', '--hard', sourceHead);
    expect(git(root, 'write-tree')).toBe(git(root, 'rev-parse', sourceHead + '^{tree}'));
    expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');
    const verified = await reconcileCloseGitPublication(reopened, operationId, true);
    expect(verified.stage).toBe('integration-verified');
    expect(verified.integration?.publishedCommit).toBe(sourceHead);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(sourceHead);
  }, 150000);

  it('LC21: SIGKILL after Git publication reconciles HEAD/index/files exactly once', async () => {
    const { root, spec, operationId } = await project('worktree-close', true);
    const original = git(root, 'rev-parse', 'HEAD');
    const sourceHead = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    await killAtCheckpoint(root, operationId, 'publish-complete-before-proof');
    const reopened = await openSpecFlowEngine({ cwd: root });
    const journal = await inspectCloseOperation(reopened, operationId);
    expect(journal?.stage).toBe('integration-publish-initiated');
    expect(git(root, 'rev-parse', 'HEAD')).toBe(sourceHead);
    expect(git(root, 'rev-parse', 'HEAD')).not.toBe(original);
    expect(git(root, 'write-tree')).toBe(git(root, 'rev-parse', sourceHead + '^{tree}'));
    expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');
    const verified = await reconcileCloseGitPublication(reopened, operationId, true);
    expect(verified.stage).toBe('integration-verified');
    expect(verified.integration?.publishedCommit).toBe(sourceHead);
    const beforeRebind = await reopened.readRegistry();
    const rebound = await rebindVerifiedClose(reopened, operationId);
    expect(rebound.stage).toBe('binding-rebound');
    expect((await reopened.readRegistry()).revision).toBe(beforeRebind.revision + 1);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(sourceHead);
    expect(git(root, 'write-tree')).toBe(git(root, 'rev-parse', sourceHead + '^{tree}'));
    expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');
  }, 150000);
});

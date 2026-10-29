import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile, lstat } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  bootstrapProjectHome,
  closeSpecification,
  discoverSpecifications,
  closeWorktree,
  createSpecificationForTesting,
  disposeReboundWorktree,
  inspectPendingDisposal,
  prepareDivergentCloseCandidate,
  publishDivergentCloseCandidate,
  inspectCloseOperation,
  prepareCloseGitIntegration,
  publishCloseGitFastForward,
  reconcileDisposedWorktree,
  readWorkspaceSpecification,
  rebindVerifiedClose,
  reserveCloseOperation,
} from '../../src/testing';
import { createGitTestProject, git, commitStaged } from '../support/git-project';

const cleanup: string[] = [];
afterEach(async () => {
  for (const root of cleanup.splice(0).reverse()) {
    await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
  }
});

async function fixture() {
  const root = await createGitTestProject(
    'close-worktree-t13-Ż ',
    'runtime: {}\ngit:\n  enabled: true\n',
  );
  cleanup.push(root);
  const branch = git(root, 'symbolic-ref', '--short', 'HEAD');
  await writeFile(
    join(root, '.nevo/config.yaml'),
    'runtime: {}\ngit:\n  enabled: true\n  integrationTargetBranch: ' + branch + '\n',
  );
  git(root, 'add', '.nevo/config.yaml');
  commitStaged(root, 'pin integration target');
  const engine = await bootstrapProjectHome(root);
  const spec = await createSpecificationForTesting(engine, {
    operationId: randomUUID(),
    title: 'Lifecycle bind and disposal',
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
  commitStaged(spec.workspaceRoot, 'spec source commit');

  return { root, engine, spec };
}

describe('E2.T12–T13 linked Worktree Close lifecycle', () => {
  it('LC26: integrates real Unicode and spaced Git paths with index and file parity', async () => {
    const { root, engine, spec } = await fixture();
    const relative = 'src/Zażółć gęślą 漢字 [spec].txt';
    const content = 'Zażółć gęślą jaźń — 漢字\n';
    await mkdir(join(spec.workspaceRoot, 'src'), { recursive: true });
    await writeFile(join(spec.workspaceRoot, relative), content);
    git(spec.workspaceRoot, 'add', '--', relative);
    commitStaged(spec.workspaceRoot, 'commit real Unicode and bracketed source path');
    const before = git(root, 'rev-parse', 'HEAD');
    const sourceHead = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    expect(git(spec.workspaceRoot, 'ls-files', '--', ':(literal)' + relative)).not.toBe('');
    const close = await closeWorktree(engine, {
      operationId: randomUUID(),
      specId: spec.specId,
    });
    expect(close.status).toBe('completed');
    expect(git(root, 'rev-parse', 'HEAD')).toBe(sourceHead);
    expect(git(root, 'rev-parse', 'HEAD')).not.toBe(before);
    expect(await readFile(join(root, relative), 'utf8')).toBe(content);
    expect(git(root, 'ls-files', '--', ':(literal)' + relative)).not.toBe('');
    expect(git(root, 'write-tree')).toBe(git(root, 'rev-parse', 'HEAD^{tree}'));
    expect(git(root, 'status', '--porcelain')).toBe('');
    const registry = await engine.readRegistry();
    expect(registry.specBindings.find((x) => x.specId === spec.specId)?.workspaceId).toBe(
      registry.primaryWorkspaceId,
    );
  }, 150000);

  it('LC02: Worktree Close then primary Spec Close without second merge', async () => {
    const { root, engine, spec } = await fixture();
    const initial = git(root, 'rev-parse', 'HEAD');
    const first = await closeWorktree(engine, {
      operationId: randomUUID(),
      specId: spec.specId,
    });
    expect(first.status).toBe('completed');
    const integratedHead = git(root, 'rev-parse', 'HEAD');
    expect(integratedHead).not.toBe(initial);
    const registryAfterWorktree = await engine.readRegistry();
    const rebound = registryAfterWorktree.specBindings.find((item) => item.specId === spec.specId);
    expect(rebound?.workspaceId).toBe(registryAfterWorktree.primaryWorkspaceId);
    expect(git(root, 'worktree', 'list', '--porcelain').match(/worktree /gu)).toHaveLength(1);
    const second = await closeSpecification(engine, {
      operationId: randomUUID(),
      specId: spec.specId,
    });
    expect(second.status).toBe('completed');
    expect(second.journal.outcome).toBe('archived-in-primary');
    expect(second.journal.integration).toBeUndefined();
    const archivedHead = git(root, 'rev-parse', 'HEAD');
    expect(archivedHead).not.toBe(integratedHead);
    expect(git(root, 'rev-list', '--parents', '-n', '1', archivedHead)).toBe(
      [archivedHead, integratedHead].join(' '),
    );
    expect(git(root, 'worktree', 'list', '--porcelain').match(/worktree /gu)).toHaveLength(1);
    expect((await readWorkspaceSpecification(root, spec.specId)).location).toBe('archive');
    // LC05: the original identity resolves exactly once after both transitions.
    const canonical = await discoverSpecifications(engine);
    expect(canonical).toHaveLength(1);
    expect(canonical[0]).toMatchObject({
      specId: spec.specId,
      status: 'available',
      specification: { location: 'archive' },
    });
    expect(git(root, 'ls-files', '--', 'specs/active/' + spec.slug)).toBe('');
    expect(git(root, 'ls-files', '--', 'specs/archive/' + spec.slug)).toContain(
      'specs/archive/' + spec.slug + '/specification.yaml',
    );
    expect(git(root, 'status', '--porcelain')).toBe('');
    const finalRegistry = await engine.readRegistry();
    expect(finalRegistry.workspaces).toEqual(registryAfterWorktree.workspaces);
    expect(finalRegistry.specBindings).toEqual(registryAfterWorktree.specBindings);
  }, 150000);

  it('integrates, CAS-rebinds, removes only its managed worktree and preserves the Spec and source branch', async () => {
    const { root, engine, spec } = await fixture();
    const initial = await engine.readRegistry();
    const binding = initial.specBindings.find((x) => x.specId === spec.specId);
    expect(binding?.workspaceId).not.toBe(initial.primaryWorkspaceId);
    const sourceBranch = git(spec.workspaceRoot, 'symbolic-ref', '--short', 'HEAD');
    const operationId = randomUUID();
    const outcome = await closeWorktree(engine, { operationId, specId: spec.specId });
    expect(outcome.status).toBe('completed');
    const journal = await inspectCloseOperation(engine, operationId);
    expect(journal?.outcome).toBe('worktree-integrated-and-removed');
    expect(journal?.stage).toBe('completed');
    const current = await engine.readRegistry();
    expect(current.revision).toBe(initial.revision + 2);
    expect(current.specBindings.find((x) => x.specId === spec.specId)?.workspaceId).toBe(
      current.primaryWorkspaceId,
    );
    expect(current.workspaces.some((x) => x.root === spec.workspaceRoot)).toBe(false);
    expect((await readWorkspaceSpecification(root, spec.specId)).location).toBe('active');
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect(git(root, 'show-ref', '--verify', 'refs/heads/' + sourceBranch)).not.toBe('');
    expect(await closeWorktree(engine, { operationId, specId: spec.specId })).toMatchObject({
      status: 'completed',
    });
    await expect(
      closeWorktree(engine, { operationId: randomUUID(), specId: spec.specId }),
    ).rejects.toMatchObject({ code: 'CLOSE_PREFLIGHT' });
  }, 120000);

  it('retains verified primary binding and original linked data when ignored user files block disposal', async () => {
    const { root, engine, spec } = await fixture();
    const operationId = randomUUID();
    const originalSource = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    const ignored = join(spec.workspaceRoot, '.nevo/local/state/user-note.json');
    await mkdir(dirname(ignored), { recursive: true });
    await writeFile(ignored, '{"user":"do not delete"}\n');
    await expect(closeWorktree(engine, { operationId, specId: spec.specId })).rejects.toMatchObject(
      { code: 'CLOSE_RECOVERY_REQUIRED' },
    );
    const journal = await inspectCloseOperation(engine, operationId);
    expect(journal?.stage).toBe('binding-rebound');
    expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).toBe(originalSource);
    expect(await readFile(ignored, 'utf8')).toContain('do not delete');
    const registry = await engine.readRegistry();
    expect(registry.specBindings.find((x) => x.specId === spec.specId)?.workspaceId).toBe(
      registry.primaryWorkspaceId,
    );
    expect(registry.workspaces.some((x) => x.root === spec.workspaceRoot)).toBe(true);
    expect((await readWorkspaceSpecification(root, spec.specId)).specId).toBe(spec.specId);
  }, 120000);

  it('retains original identity when Git refuses removal, and detects substitution at the same path', async () => {
    const { root, engine, spec } = await fixture();
    const operationId = randomUUID();
    await reserveCloseOperation(engine, {
      kind: 'worktree-close',
      operationId,
      specId: spec.specId,
    });
    await prepareCloseGitIntegration(engine, operationId);
    await publishCloseGitFastForward(engine, operationId);
    await rebindVerifiedClose(engine, operationId);
    const markerPath = join(spec.workspaceRoot, '.nevo/local/state/workspace-identity.json');
    const originalMarker = await readFile(markerPath, 'utf8');
    const reboundRevision = (await engine.readRegistry()).revision;

    // Locking the checkout makes the REAL git worktree remove fail AFTER
    // disposal-initiated was durably recorded, without simulating success.
    await expect(
      disposeReboundWorktree(engine, operationId, () => {
        git(root, 'worktree', 'lock', '--reason', 'inject T12 Git refusal', spec.workspaceRoot);

        return Promise.resolve();
      }),
    ).rejects.toMatchObject({ code: 'CLOSE_RECOVERY_REQUIRED' });
    expect((await inspectCloseOperation(engine, operationId))?.stage).toBe('disposal-initiated');
    expect(await readFile(markerPath, 'utf8')).toBe(originalMarker);
    expect(await inspectPendingDisposal(engine, operationId)).toBe('original-checkout-present');
    expect((await engine.readRegistry()).revision).toBe(reboundRevision);
    expect(git(root, 'worktree', 'list', '--porcelain')).toContain(
      spec.workspaceRoot.replaceAll('\\', '/'),
    );
    await expect(reconcileDisposedWorktree(engine, operationId, true)).rejects.toMatchObject({
      code: 'CLOSE_RECOVERY_REQUIRED',
    });

    // A different instance marker at the SAME path must never be adopted.
    const original = JSON.parse(originalMarker) as Record<string, unknown>;
    await writeFile(markerPath, JSON.stringify({ ...original, instanceId: randomUUID() }) + '\n');
    expect(await inspectPendingDisposal(engine, operationId)).toBe('identity-mismatch');
    expect((await inspectCloseOperation(engine, operationId))?.stage).toBe('disposal-initiated');
  }, 120000);

  it('cleans up the detached divergent scratch BEFORE terminal Close settlement', async () => {
    const { root, engine, spec } = await fixture();
    await writeFile(join(root, 'only-on-primary.txt'), 'a divergent primary edit\n');
    git(root, 'add', 'only-on-primary.txt');
    commitStaged(root, 'advance target branch');
    const operationId = randomUUID();
    const result = await closeWorktree(engine, { operationId, specId: spec.specId });
    expect(result.status).toBe('completed');
    const journal = await inspectCloseOperation(engine, operationId);
    expect(journal?.integration?.relationship).toBe('divergent');
    expect(journal?.stage).toBe('completed');
    const scratchRoot = journal?.scratch?.root;
    expect(scratchRoot).toBeTruthy();
    await expect(lstat(scratchRoot!)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(git(root, 'worktree', 'list', '--porcelain')).not.toContain(
      scratchRoot!.replaceAll('\\', '/'),
    );
    expect(git(root, 'worktree', 'list', '--porcelain')).not.toContain(
      spec.workspaceRoot.replaceAll('\\', '/'),
    );
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect((await readWorkspaceSpecification(root, spec.specId)).location).toBe('active');
  }, 120000);

  it('does not mark a divergent Close completed while Git still owns its scratch', async () => {
    const { root, engine, spec } = await fixture();
    await writeFile(join(root, 'target-advance.txt'), 'diverge\n');
    git(root, 'add', 'target-advance.txt');
    commitStaged(root, 'divergent target');
    const operationId = randomUUID();
    await reserveCloseOperation(engine, {
      kind: 'worktree-close',
      operationId,
      specId: spec.specId,
    });
    await prepareCloseGitIntegration(engine, operationId);
    const candidate = await prepareDivergentCloseCandidate(engine, operationId);
    expect(candidate.stage).toBe('integration-scratch-candidate');
    await publishDivergentCloseCandidate(engine, operationId);
    await rebindVerifiedClose(engine, operationId);

    await expect(
      disposeReboundWorktree(engine, operationId, () => {
        git(root, 'worktree', 'lock', '--reason', 'block scratch cleanup', candidate.scratch!.root);

        return Promise.resolve();
      }),
    ).rejects.toMatchObject({ code: 'CLOSE_RECOVERY_REQUIRED' });
    expect((await inspectCloseOperation(engine, operationId))?.stage).toBe('disposal-initiated');
    expect(git(root, 'worktree', 'list', '--porcelain')).toContain(
      candidate.scratch!.root.replaceAll('\\', '/'),
    );
    expect(git(root, 'worktree', 'list', '--porcelain')).toContain(
      spec.workspaceRoot.replaceAll('\\', '/'),
    );
    expect(await inspectPendingDisposal(engine, operationId)).toBe('original-checkout-present');
    await expect(reconcileDisposedWorktree(engine, operationId, true)).rejects.toMatchObject({
      code: 'CLOSE_RECOVERY_REQUIRED',
    });
  }, 120000);

  it('keeps a durable rebound stage and refuses stale duplicate CAS after interrupted cleanup', async () => {
    const { root, engine, spec } = await fixture();
    const operationId = randomUUID();
    await reserveCloseOperation(engine, {
      kind: 'worktree-close',
      operationId,
      specId: spec.specId,
    });
    await prepareCloseGitIntegration(engine, operationId);
    await publishCloseGitFastForward(engine, operationId);
    const recorded = await rebindVerifiedClose(engine, operationId);
    expect(recorded.stage).toBe('binding-rebound');
    const initialRevision = (await engine.readRegistry()).revision;
    await expect(rebindVerifiedClose(engine, operationId)).resolves.toEqual(recorded);
    expect((await engine.readRegistry()).revision).toBe(initialRevision);
    const completed = await disposeReboundWorktree(engine, operationId);
    expect(completed.stage).toBe('completed');
    expect((await readWorkspaceSpecification(root, spec.specId)).status).toBe('draft');
  }, 120000);
});

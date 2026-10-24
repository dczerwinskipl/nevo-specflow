import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  bootstrapProjectHome,
  createSpecificationForTesting,
  inspectCloseGitIntegration,
  inspectCloseOperation,
  prepareCloseGitIntegration,
  prepareDivergentCloseCandidate,
  verifyDivergentCloseCandidate,
  publishDivergentCloseCandidate,
  verifyDivergentCloseConflict,
  inspectDivergentCloseResolution,
  publishCloseGitFastForward,
  reconcileCloseGitPublication,
  requireVerifiedCloseIntegration,
  proveAlreadyIntegratedClose,
  reserveCloseOperation,
  closeJournalPath,
} from '../src/testing';
import { createGitTestProject, git, commitStaged } from './support/git-project';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0).reverse()) {
    await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
  }
});

async function project(withInheritedSpec = false) {
  const root = await createGitTestProject(
    'specflow-integration-Ż space ',
    'runtime: {}\ngit:\n  enabled: true\n',
  );
  roots.push(root);
  const branch = git(root, 'symbolic-ref', '--short', 'HEAD');
  await writeFile(
    join(root, '.nevo/config.yaml'),
    'runtime: {}\ngit:\n  enabled: true\n  integrationTargetBranch: ' + branch + '\n',
  );
  git(root, 'add', '.nevo/config.yaml');
  commitStaged(root, 'set integration target');
  const engine = await bootstrapProjectHome(root);
  if (withInheritedSpec) {
    const other = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Zeta spec',
      created: '2026-10-18',
      archetype: { id: 'minimal', version: 1 },
      target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
    });
    git(
      root,
      'add',
      '--',
      other.relativeManifestPath,
      'specs/active/' + other.slug + '/overview.md',
    );
    commitStaged(root, 'commit separate primary Specification before linked checkout');
  }
  const spec = await createSpecificationForTesting(engine, {
    operationId: randomUUID(),
    title: withInheritedSpec ? 'Alpha spec' : 'Integrate complete branch',
    created: '2026-10-18',
    archetype: { id: 'minimal', version: 1 },
    target: { kind: 'new-worktree', baseRef: 'HEAD' },
  });
  roots.push(dirname(spec.workspaceRoot));
  git(
    spec.workspaceRoot,
    'add',
    '--',
    spec.relativeManifestPath,
    'specs/active/' + spec.slug + '/overview.md',
  );
  commitStaged(spec.workspaceRoot, 'commit spec');
  return { root, engine, spec };
}

async function reserve(engine: Awaited<ReturnType<typeof bootstrapProjectHome>>, specId: string) {
  const operationId = randomUUID();
  await reserveCloseOperation(engine, { kind: 'worktree-close', operationId, specId });
  return operationId;
}

describe('E2.T11 — read-only pinned Git integration proof', () => {
  it('LC31: refuses source commits changing inherited another Spec before any merge', async () => {
    const { root, engine, spec } = await project(true);
    const foreignPath = 'specs/active/zeta-spec/overview.md';
    const originalSource = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    await writeFile(
      join(spec.workspaceRoot, foreignPath),
      '# Other Spec changed by linked branch\n',
    );
    git(spec.workspaceRoot, 'add', '--', foreignPath);
    commitStaged(spec.workspaceRoot, 'edit unrelated inherited Specification');
    const primaryHead = git(root, 'rev-parse', 'HEAD');
    // Git diff -z emits the owned alpha path BEFORE the foreign zeta path.
    // A parser splitting on literal backslash-zero would incorrectly treat
    // the combined output as owned because it starts with alpha.
    expect(spec.slug).toBe('alpha-spec');
    const changedPaths = git(
      root,
      'diff',
      '--no-ext-diff',
      '--no-renames',
      '--name-only',
      '-z',
      git(root, 'merge-base', 'HEAD', git(spec.workspaceRoot, 'rev-parse', 'HEAD')),
      git(spec.workspaceRoot, 'rev-parse', 'HEAD'),
    )
      .split('\0')
      .filter(Boolean);
    const ownedIndex = changedPaths.indexOf('specs/active/alpha-spec/overview.md');
    const foreignIndex = changedPaths.indexOf(foreignPath);
    expect(ownedIndex).toBeGreaterThanOrEqual(0);
    expect(foreignIndex).toBeGreaterThan(ownedIndex);
    const operationId = await reserve(engine, spec.specId);
    const before = await inspectCloseOperation(engine, operationId);
    await expect(prepareCloseGitIntegration(engine, operationId)).rejects.toMatchObject({
      code: 'CLOSE_PREFLIGHT',
    });
    expect((await inspectCloseOperation(engine, operationId))?.stage).toBe('reserved');
    expect(await inspectCloseOperation(engine, operationId)).toEqual(before);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(primaryHead);
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect(git(spec.workspaceRoot, 'status', '--porcelain')).toBe('');
    expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).not.toBe(originalSource);
    expect((await engine.readRegistry()).specBindings).toHaveLength(2);
    expect(git(root, 'worktree', 'list', '--porcelain').match(/worktree /gu)).toHaveLength(2);
  }, 120000);

  it('LC31: target-only edits to another Spec do not falsely block source integration', async () => {
    const { root, engine, spec } = await project(true);
    const foreignPath = 'specs/active/zeta-spec/overview.md';
    await writeFile(join(root, foreignPath), '# Updated only in primary\n');
    git(root, 'add', '--', foreignPath);
    commitStaged(root, 'primary updates its own other Specification');
    const primaryHead = git(root, 'rev-parse', 'HEAD');
    const operationId = await reserve(engine, spec.specId);
    const prepared = await prepareCloseGitIntegration(engine, operationId);
    expect(prepared.integration?.relationship).toBe('divergent');
    const staged = await prepareDivergentCloseCandidate(engine, operationId);
    expect(staged.stage).toBe('integration-scratch-candidate');
    const published = await publishDivergentCloseCandidate(engine, operationId);
    expect(published.stage).toBe('integration-verified');
    expect(git(root, 'rev-parse', 'HEAD')).not.toBe(primaryHead);
    expect(await readFile(join(root, foreignPath), 'utf8')).toBe('# Updated only in primary\n');
    expect(git(root, 'status', '--porcelain')).toBe('');
  }, 120000);

  it('publishes real divergent candidate through primary HEAD, index and entire branch tree', async () => {
    const { root, engine, spec } = await project();
    await mkdir(join(spec.workspaceRoot, 'src'), { recursive: true });
    await writeFile(join(spec.workspaceRoot, 'src/full-branch-source.ts'), 'source only\n');
    git(spec.workspaceRoot, 'add', 'src/full-branch-source.ts');
    commitStaged(spec.workspaceRoot, 'source code outside specs');
    await writeFile(join(root, 'target-only.txt'), 'target remains present\n');
    git(root, 'add', 'target-only.txt');
    commitStaged(root, 'target independent commit');
    const target = git(root, 'rev-parse', 'HEAD');
    const source = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    const id = await reserve(engine, spec.specId);
    await prepareCloseGitIntegration(engine, id);
    const candidate = await prepareDivergentCloseCandidate(engine, id);
    const expected = candidate.scratch?.candidateCommit;
    expect(candidate.stage).toBe('integration-scratch-candidate');

    const result = await publishDivergentCloseCandidate(engine, id);
    expect(result.stage).toBe('integration-verified');
    expect(result.integration?.relationship).toBe('divergent');
    expect(result.integration?.publishedCommit).toBe(expected);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(expected);
    expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe(result.plan.targetBranch);
    expect(git(root, 'rev-list', '--parents', '-n', '1', 'HEAD')).toBe(
      [expected, target, source].join(' '),
    );
    expect(git(root, 'write-tree')).toBe(candidate.scratch?.candidateTree);
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect(git(root, 'ls-tree', '-r', '--name-only', 'HEAD')).toContain(
      'src/full-branch-source.ts',
    );
    expect(git(root, 'ls-tree', '-r', '--name-only', 'HEAD')).toContain('target-only.txt');
    expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).toBe(source);
    expect(await requireVerifiedCloseIntegration(engine, id)).toEqual(result);
    await expect(publishDivergentCloseCandidate(engine, id)).rejects.toMatchObject({
      code: 'CLOSE_CONFLICT',
    });
  }, 120000);

  it('reconciles a killed divergent publish without repeating Git, requiring exact physical proof', async () => {
    const { root, engine, spec } = await project();
    await writeFile(join(root, 'target-advance.txt'), 'target advance\n');
    git(root, 'add', 'target-advance.txt');
    commitStaged(root, 'advance target');
    const target = git(root, 'rev-parse', 'HEAD');
    const id = await reserve(engine, spec.specId);
    await prepareCloseGitIntegration(engine, id);
    const prepared = await prepareDivergentCloseCandidate(engine, id);
    const candidate = prepared.scratch?.candidateCommit;
    expect(candidate).toBeDefined();

    await expect(
      publishDivergentCloseCandidate(engine, id, () =>
        Promise.reject(new Error('simulate crash after durable publication intent')),
      ),
    ).rejects.toThrow('simulate crash');
    expect((await inspectCloseOperation(engine, id))?.stage).toBe('integration-publish-initiated');
    expect(git(root, 'rev-parse', 'HEAD')).toBe(target);
    await expect(publishDivergentCloseCandidate(engine, id)).rejects.toMatchObject({
      code: 'CLOSE_CONFLICT',
    });
    await expect(reconcileCloseGitPublication(engine, id, false)).rejects.toMatchObject({
      code: 'CLOSE_RECOVERY_REQUIRED',
    });
    await expect(reconcileCloseGitPublication(engine, id, true)).rejects.toMatchObject({
      code: 'CLOSE_RECOVERY_REQUIRED',
    });

    // Simulate a Git child that completed after parent process death.
    git(root, 'merge', '--ff-only', candidate!);
    const reconciled = await reconcileCloseGitPublication(engine, id, true);
    expect(reconciled.stage).toBe('integration-verified');
    expect(reconciled.integration?.publishedCommit).toBe(candidate);
    expect(git(root, 'write-tree')).toBe(prepared.scratch?.candidateTree);
    expect(git(root, 'status', '--porcelain')).toBe('');
  }, 120000);

  it('preserves conflicted scratch with owner and index proof without touching primary', async () => {
    const { root, engine, spec } = await project();
    await writeFile(join(root, 'conflict-owner.txt'), 'target\n');
    git(root, 'add', 'conflict-owner.txt');
    commitStaged(root, 'target conflict');
    await writeFile(join(spec.workspaceRoot, 'conflict-owner.txt'), 'source\n');
    git(spec.workspaceRoot, 'add', 'conflict-owner.txt');
    commitStaged(spec.workspaceRoot, 'source conflict');
    const target = git(root, 'rev-parse', 'HEAD');
    const id = await reserve(engine, spec.specId);
    await prepareCloseGitIntegration(engine, id);
    const conflict = await prepareDivergentCloseCandidate(engine, id);
    expect(conflict.stage).toBe('integration-scratch-conflict');
    expect(await verifyDivergentCloseConflict(engine, id)).toEqual(conflict);
    const resolution = await inspectDivergentCloseResolution(engine, id);
    expect(resolution).toMatchObject({
      status: 'requires-resolution',
      disposition: 'retained-scratch',
      operationId: id,
      conflictPaths: ['conflict-owner.txt'],
      resourcesRemainReserved: true,
    });
    expect(git(root, 'rev-parse', 'HEAD')).toBe(target);
    expect(git(root, 'status', '--porcelain')).toBe('');
    await expect(publishDivergentCloseCandidate(engine, id)).rejects.toMatchObject({
      code: 'CLOSE_CONFLICT',
    });
  }, 120000);

  it('prepares a real two-parent divergent merge in owned scratch without touching primary', async () => {
    const { root, engine, spec } = await project();
    await mkdir(join(spec.workspaceRoot, 'src'), { recursive: true });
    await writeFile(
      join(spec.workspaceRoot, 'src/from-source.ts'),
      'export const source = true;\n',
    );
    git(spec.workspaceRoot, 'add', 'src/from-source.ts');
    commitStaged(spec.workspaceRoot, 'source side of divergent history');
    await writeFile(join(root, 'target-note.txt'), 'target side\n');
    git(root, 'add', 'target-note.txt');
    commitStaged(root, 'target side of divergent history');
    const source = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    const target = git(root, 'rev-parse', 'HEAD');
    const registry = await engine.readRegistry();
    const operationId = await reserve(engine, spec.specId);
    const prepared = await prepareCloseGitIntegration(engine, operationId);
    expect(prepared.integration?.relationship).toBe('divergent');
    const journal = await prepareDivergentCloseCandidate(engine, operationId);
    expect(journal.stage).toBe('integration-scratch-candidate');
    expect(journal.scratch?.candidateCommit).toMatch(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/u);
    expect(journal.scratch?.candidateTree).toBe(git(journal.scratch!.root, 'write-tree'));
    expect(git(journal.scratch!.root, 'rev-list', '--parents', '-n', '1', 'HEAD')).toBe(
      [journal.scratch!.candidateCommit, target, source].join(' '),
    );
    expect(git(journal.scratch!.root, 'status', '--porcelain')).toBe('');
    expect(git(journal.scratch!.root, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('HEAD');
    expect(git(journal.scratch!.root, 'ls-tree', '-r', '--name-only', 'HEAD')).toContain(
      'src/from-source.ts',
    );
    expect(git(root, 'rev-parse', 'HEAD')).toBe(target);
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).toBe(source);
    expect(git(spec.workspaceRoot, 'status', '--porcelain')).toBe('');
    expect(await engine.readRegistry()).toEqual(registry);
    expect(await verifyDivergentCloseCandidate(engine, operationId)).toEqual(journal);
    await expect(prepareDivergentCloseCandidate(engine, operationId)).rejects.toMatchObject({
      code: 'CLOSE_CONFLICT',
    });
  }, 120000);

  it('preserves a real conflicting scratch index and does not release Close claims', async () => {
    const { root, engine, spec } = await project();
    await writeFile(join(root, 'shared-conflict.txt'), 'target version\n');
    git(root, 'add', 'shared-conflict.txt');
    commitStaged(root, 'conflicting target');
    await writeFile(join(spec.workspaceRoot, 'shared-conflict.txt'), 'source version\n');
    git(spec.workspaceRoot, 'add', 'shared-conflict.txt');
    commitStaged(spec.workspaceRoot, 'conflicting source');
    const targetHead = git(root, 'rev-parse', 'HEAD');
    const sourceHead = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    const operationId = await reserve(engine, spec.specId);
    await prepareCloseGitIntegration(engine, operationId);
    const journal = await prepareDivergentCloseCandidate(engine, operationId);
    expect(journal.stage).toBe('integration-scratch-conflict');
    expect(journal.scratch?.conflictPaths).toEqual(['shared-conflict.txt']);
    expect(journal.scratch?.conflictIndexHash).toMatch(/^[a-f0-9]{64}$/u);
    expect(git(journal.scratch!.root, 'ls-files', '--unmerged')).toContain('shared-conflict.txt');
    expect(git(root, 'rev-parse', 'HEAD')).toBe(targetHead);
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).toBe(sourceHead);
    expect(git(spec.workspaceRoot, 'status', '--porcelain')).toBe('');
    await expect(verifyDivergentCloseCandidate(engine, operationId)).rejects.toMatchObject({
      code: 'CLOSE_RECOVERY_REQUIRED',
    });
    await expect(
      reserveCloseOperation(engine, {
        kind: 'worktree-close',
        operationId: randomUUID(),
        specId: spec.specId,
      }),
    ).rejects.toMatchObject({ code: 'CLOSE_CONFLICT' });
  }, 120000);

  it('retains scratch intent without retry after a crash before Git worktree add', async () => {
    const { root, engine, spec } = await project();
    await writeFile(join(root, 'target-only.txt'), 'target version\n');
    git(root, 'add', 'target-only.txt');
    commitStaged(root, 'target advance');
    const operationId = await reserve(engine, spec.specId);
    await prepareCloseGitIntegration(engine, operationId);
    await expect(
      prepareDivergentCloseCandidate(engine, operationId, () =>
        Promise.reject(new Error('simulate process death after scratch intent')),
      ),
    ).rejects.toThrow('simulate process death');
    const journal = await inspectCloseOperation(engine, operationId);
    expect(journal?.stage).toBe('integration-scratch-initiated');
    expect(journal?.scratch?.instanceId).toMatch(/^[a-f0-9-]{36}$/u);
    await expect(prepareDivergentCloseCandidate(engine, operationId)).rejects.toMatchObject({
      code: 'CLOSE_CONFLICT',
    });
    await expect(verifyDivergentCloseCandidate(engine, operationId)).rejects.toMatchObject({
      code: 'CLOSE_RECOVERY_REQUIRED',
    });
    expect(git(root, 'status', '--porcelain')).toBe('');
    await expect(
      reserveCloseOperation(engine, {
        kind: 'worktree-close',
        operationId: randomUUID(),
        specId: spec.specId,
      }),
    ).rejects.toMatchObject({ code: 'CLOSE_CONFLICT' });
  }, 120000);

  it('proves an already-integrated later target without changing HEAD/index', async () => {
    const { root, engine, spec } = await project();
    const sourceHead = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    git(root, 'merge', '--ff-only', sourceHead);
    await writeFile(join(root, 'target-after-source.txt'), 'unrelated target commit\\n');
    git(root, 'add', 'target-after-source.txt');
    commitStaged(root, 'continue primary after integrating source');
    const before = git(root, 'rev-parse', 'HEAD');
    const operationId = await reserve(engine, spec.specId);
    await prepareCloseGitIntegration(engine, operationId);
    const settled = await proveAlreadyIntegratedClose(engine, operationId);
    expect(settled.stage).toBe('integration-verified');
    expect(settled.integration?.publishedCommit).toBe(before);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(before);
    expect(git(root, 'status', '--porcelain')).toBe('');
  }, 90000);

  it('rejects descendant ancestry when the target rewrote canonical Spec content', async () => {
    const { root, engine, spec } = await project();
    git(root, 'merge', '--ff-only', git(spec.workspaceRoot, 'rev-parse', 'HEAD'));
    const overview = 'specs/active/' + spec.slug + '/overview.md';
    await writeFile(join(root, overview), 'changed in primary after integration\\n');
    git(root, 'add', overview);
    commitStaged(root, 'rewrite canonical Spec in target');
    const operationId = await reserve(engine, spec.specId);
    await prepareCloseGitIntegration(engine, operationId);
    await expect(proveAlreadyIntegratedClose(engine, operationId)).rejects.toMatchObject({
      code: 'CLOSE_CONFLICT',
    });
    expect((await inspectCloseOperation(engine, operationId))?.stage).toBe(
      'integration-preparation-initiated',
    );
  }, 90000);

  it('rejects a switch to another branch at the same SHA before fast-forward mutates Git', async () => {
    const { root, engine, spec } = await project();
    const operationId = await reserve(engine, spec.specId);
    const oldTarget = git(root, 'symbolic-ref', '--short', 'HEAD');
    const pinned = git(root, 'rev-parse', 'HEAD');
    const source = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    await prepareCloseGitIntegration(engine, operationId);

    await expect(
      publishCloseGitFastForward(engine, operationId, () => {
        git(root, 'switch', '-c', 'unrelated-but-same-sha');
        return Promise.resolve();
      }),
    ).rejects.toMatchObject({ code: 'CLOSE_RECOVERY_REQUIRED' });

    expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe('unrelated-but-same-sha');
    expect(git(root, 'rev-parse', oldTarget)).toBe(pinned);
    expect(git(root, 'rev-parse', 'unrelated-but-same-sha')).toBe(pinned);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(pinned);
    expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).toBe(source);
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect((await inspectCloseOperation(engine, operationId))?.stage).toBe(
      'integration-publish-initiated',
    );
  }, 90000);

  it('does not trust a forged integration-verified journal when primary never moved', async () => {
    const { root, engine, spec } = await project();
    const operationId = await reserve(engine, spec.specId);
    const prepared = await prepareCloseGitIntegration(engine, operationId);
    const primaryHead = git(root, 'rev-parse', 'HEAD');
    const path = closeJournalPath(engine.context, operationId);
    const forged = {
      ...prepared,
      stage: 'integration-verified',
      integration: {
        ...prepared.integration!,
        publishedCommit: prepared.integration!.sourceCommit,
      },
    };
    await writeFile(path, JSON.stringify(forged));
    // Structural journal validation alone is deliberately insufficient.
    expect((await inspectCloseOperation(engine, operationId))?.stage).toBe('integration-verified');
    await expect(requireVerifiedCloseIntegration(engine, operationId)).rejects.toMatchObject({
      code: 'CLOSE_RECOVERY_REQUIRED',
    });
    expect(git(root, 'rev-parse', 'HEAD')).toBe(primaryHead);
    expect(git(root, 'status', '--porcelain')).toBe('');
    await expect(
      reserveCloseOperation(engine, {
        kind: 'worktree-close',
        operationId: randomUUID(),
        specId: spec.specId,
      }),
    ).rejects.toMatchObject({ code: 'CLOSE_CONFLICT' });
  }, 90000);

  it('rejects forged already-integrated ancestry despite equal Spec trees and missing source code', async () => {
    const { root, engine, spec } = await project();
    const sourceCode = 'src/only-in-source.ts';
    await mkdir(join(spec.workspaceRoot, 'src'), { recursive: true });
    await writeFile(join(spec.workspaceRoot, sourceCode), 'export const sourceOnly = true;\n');
    git(spec.workspaceRoot, 'add', sourceCode);
    commitStaged(spec.workspaceRoot, 'add source-only code outside spec');

    const sourceCommit = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    const specPath = 'specs/active/' + spec.slug;
    // Copy only the complete Spec subtree; never merge the source commit
    // or its unrelated code. Target now contains byte-identical Spec objects.
    git(root, 'restore', '--source=' + sourceCommit, '--staged', '--worktree', '--', specPath);
    commitStaged(root, 'copy only spec content to target');
    const targetCommit = git(root, 'rev-parse', 'HEAD');
    expect(git(root, 'rev-parse', sourceCommit + ':' + specPath)).toBe(
      git(root, 'rev-parse', targetCommit + ':' + specPath),
    );
    expect(git(root, 'merge-base', sourceCommit, targetCommit)).not.toBe(sourceCommit);
    expect(git(root, 'ls-tree', '--name-only', targetCommit, '--', sourceCode)).toBe('');

    const operationId = await reserve(engine, spec.specId);
    const prepared = await prepareCloseGitIntegration(engine, operationId);
    expect(prepared.integration?.relationship).toBe('divergent');
    const forged = {
      ...prepared,
      stage: 'integration-verified',
      integration: {
        ...prepared.integration!,
        relationship: 'already-integrated',
        publishedCommit: targetCommit,
      },
    };
    await writeFile(closeJournalPath(engine.context, operationId), JSON.stringify(forged));
    // The forgery is schema-valid and both real checkouts are clean.
    expect((await inspectCloseOperation(engine, operationId))?.stage).toBe('integration-verified');
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect(git(spec.workspaceRoot, 'status', '--porcelain')).toBe('');

    await expect(requireVerifiedCloseIntegration(engine, operationId)).rejects.toMatchObject({
      code: 'CLOSE_RECOVERY_REQUIRED',
    });
    expect(git(root, 'rev-parse', 'HEAD')).toBe(targetCommit);
    expect(git(root, 'rev-parse', sourceCommit + ':' + sourceCode)).not.toBe('');
    expect((await engine.readRegistry()).specBindings).toHaveLength(1);
    await expect(
      reserveCloseOperation(engine, {
        kind: 'worktree-close',
        operationId: randomUUID(),
        specId: spec.specId,
      }),
    ).rejects.toMatchObject({ code: 'CLOSE_CONFLICT' });
  }, 90000);

  it.skipIf(process.platform === 'win32')(
    'does not execute repository post-merge hooks during primary publication',
    async () => {
      const { root, engine, spec } = await project();
      const marker = join(root, 'hook-was-executed.txt');
      const hook = join(root, '.git', 'hooks', 'post-merge');
      await writeFile(hook, '#!/bin/sh\\nprintf executed > hook-was-executed.txt\\nexit 37\\n');
      await chmod(hook, 0o755);

      const operationId = await reserve(engine, spec.specId);
      await prepareCloseGitIntegration(engine, operationId);
      const published = await publishCloseGitFastForward(engine, operationId);
      expect(published.stage).toBe('integration-verified');
      expect(git(root, 'status', '--porcelain')).toBe('');
      await expect(readFile(marker, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    },
    90000,
  );

  it('publishes a journaled fast-forward into checked-out primary HEAD, index and files', async () => {
    const { root, engine, spec } = await project();
    const operationId = await reserve(engine, spec.specId);
    const primaryBefore = git(root, 'rev-parse', 'HEAD');
    const sourceCommit = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    const expectedManifest = await readFile(
      join(spec.workspaceRoot, spec.relativeManifestPath),
      'utf8',
    );
    await prepareCloseGitIntegration(engine, operationId);

    const published = await publishCloseGitFastForward(engine, operationId);
    expect(published.stage).toBe('integration-verified');
    expect(published.integration?.publishedCommit).toBe(sourceCommit);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(sourceCommit);
    expect(git(root, 'symbolic-ref', '--short', 'HEAD')).toBe(published.plan.targetBranch);
    expect(git(root, 'write-tree')).toBe(git(root, 'rev-parse', 'HEAD^{tree}'));
    expect(git(root, 'status', '--porcelain')).toBe('');
    // Git on Windows may materialize text worktree files with CRLF even
    // though committed blob content was LF. HEAD/index/tree remain strict.
    expect(
      (await readFile(join(root, spec.relativeManifestPath), 'utf8')).replace(/\r\n/gu, '\n'),
    ).toBe(expectedManifest.replace(/\r\n/gu, '\n'));
    expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).toBe(sourceCommit);
    expect(primaryBefore).not.toBe(sourceCommit);
    expect((await inspectCloseOperation(engine, operationId))?.stage).toBe('integration-verified');
    expect(await requireVerifiedCloseIntegration(engine, operationId)).toEqual(published);
  }, 90000);

  it('never replays an uncertain Git publication; reconciliation requires physical proof', async () => {
    const { root, engine, spec } = await project();
    const operationId = await reserve(engine, spec.specId);
    const sourceCommit = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    const primaryBefore = git(root, 'rev-parse', 'HEAD');
    await prepareCloseGitIntegration(engine, operationId);
    await expect(
      publishCloseGitFastForward(engine, operationId, () =>
        Promise.reject(new Error('simulate process termination after persisted intent')),
      ),
    ).rejects.toThrow('simulate process termination');
    expect((await inspectCloseOperation(engine, operationId))?.stage).toBe(
      'integration-publish-initiated',
    );
    expect(git(root, 'rev-parse', 'HEAD')).toBe(primaryBefore);
    await expect(publishCloseGitFastForward(engine, operationId)).rejects.toMatchObject({
      code: 'CLOSE_CONFLICT',
    });
    await expect(reconcileCloseGitPublication(engine, operationId, false)).rejects.toMatchObject({
      code: 'CLOSE_RECOVERY_REQUIRED',
    });
    await expect(reconcileCloseGitPublication(engine, operationId, true)).rejects.toMatchObject({
      code: 'CLOSE_RECOVERY_REQUIRED',
    });

    // Emulate a previously completed fast-forward after confirmed process
    // quiescence; recovery MUST inspect instead of rerunning its Git mutation.
    git(root, 'merge', '--ff-only', sourceCommit);
    const settled = await reconcileCloseGitPublication(engine, operationId, true);
    expect(settled.stage).toBe('integration-verified');
    expect(settled.integration?.publishedCommit).toBe(sourceCommit);
    expect(git(root, 'status', '--porcelain')).toBe('');
  }, 120000);

  it('rejects divergent history before any Git publication effect', async () => {
    const { root, engine, spec } = await project();
    await writeFile(join(root, 'unrelated.txt'), 'target diverges\\n');
    git(root, 'add', 'unrelated.txt');
    commitStaged(root, 'divergent target');
    const operationId = await reserve(engine, spec.specId);
    await prepareCloseGitIntegration(engine, operationId);
    const before = git(root, 'rev-parse', 'HEAD');
    await expect(publishCloseGitFastForward(engine, operationId)).rejects.toMatchObject({
      code: 'CLOSE_CONFLICT',
    });
    expect(git(root, 'rev-parse', 'HEAD')).toBe(before);
    expect((await inspectCloseOperation(engine, operationId))?.stage).toBe(
      'integration-preparation-initiated',
    );
  }, 90000);

  it('refuses to publish a source that changes Project Home Git policy without authority', async () => {
    const { root, engine, spec } = await project();
    await writeFile(
      join(spec.workspaceRoot, '.nevo/config.yaml'),
      'runtime: {}\\ngit:\\n  enabled: true\\n  integrationTargetBranch: other-branch\\n',
    );
    git(spec.workspaceRoot, 'add', '.nevo/config.yaml');
    commitStaged(spec.workspaceRoot, 'change project policy');
    const operationId = await reserve(engine, spec.specId);
    await prepareCloseGitIntegration(engine, operationId);
    const before = git(root, 'rev-parse', 'HEAD');
    await expect(publishCloseGitFastForward(engine, operationId)).rejects.toMatchObject({
      code: 'CLOSE_PREFLIGHT',
    });
    expect(git(root, 'rev-parse', 'HEAD')).toBe(before);
    expect((await inspectCloseOperation(engine, operationId))?.stage).toBe(
      'integration-preparation-initiated',
    );
  }, 90000);

  it('durably pins integration proof before Git publication without mutating either checkout', async () => {
    const { root, engine, spec } = await project();
    const operationId = await reserve(engine, spec.specId);
    const primaryHead = git(root, 'rev-parse', 'HEAD');
    const linkedHead = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    const registry = await engine.readRegistry();
    const prepared = await prepareCloseGitIntegration(engine, operationId);

    expect(prepared.stage).toBe('integration-preparation-initiated');
    expect(prepared.integration).toMatchObject({
      sourceCommit: linkedHead,
      targetCommit: primaryHead,
      relationship: 'fast-forward',
      sourceTree: git(root, 'rev-parse', linkedHead + '^{tree}'),
      targetTree: git(root, 'rev-parse', primaryHead + '^{tree}'),
    });
    expect(await inspectCloseOperation(engine, operationId)).toEqual(prepared);
    expect(await prepareCloseGitIntegration(engine, operationId)).toEqual(prepared);
    expect(await engine.readRegistry()).toEqual(registry);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(primaryHead);
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).toBe(linkedHead);
    expect(git(spec.workspaceRoot, 'status', '--porcelain')).toBe('');
    await expect(
      reserveCloseOperation(engine, {
        kind: 'worktree-close',
        operationId: randomUUID(),
        specId: spec.specId,
      }),
    ).rejects.toMatchObject({ code: 'CLOSE_CONFLICT' });
  }, 90000);

  it('does not prepare linked Specification integration before its archive commit', async () => {
    const { engine, spec } = await project();
    const operationId = randomUUID();
    await reserveCloseOperation(engine, {
      kind: 'specification-close',
      operationId,
      specId: spec.specId,
    });
    await expect(prepareCloseGitIntegration(engine, operationId)).rejects.toMatchObject({
      code: 'CLOSE_CONFLICT',
    });
    expect((await inspectCloseOperation(engine, operationId))?.stage).toBe('reserved');
  }, 90000);

  it('rejects forged preparation evidence rather than releasing checkout ownership', async () => {
    const { engine, spec } = await project();
    const operationId = await reserve(engine, spec.specId);
    const prepared = await prepareCloseGitIntegration(engine, operationId);
    const path = closeJournalPath(engine.context, operationId);
    const persisted = JSON.parse(await readFile(path, 'utf8')) as {
      integration: { sourceCommit: string };
    };
    expect(persisted.integration.sourceCommit).toBe(prepared.integration?.sourceCommit);
    await writeFile(
      path,
      JSON.stringify({
        ...persisted,
        integration: { ...persisted.integration, sourceCommit: '0'.repeat(40) },
      }),
    );
    await expect(inspectCloseOperation(engine, operationId)).rejects.toMatchObject({
      code: 'CLOSE_JOURNAL_CORRUPT',
    });
  }, 90000);

  it('proves fast-forward source without changing primary HEAD or index', async () => {
    const { root, engine, spec } = await project();
    const operationId = await reserve(engine, spec.specId);
    const oldHead = git(root, 'rev-parse', 'HEAD');
    const evidence = await inspectCloseGitIntegration(engine, operationId);
    expect(evidence.relationship).toBe('fast-forward');
    expect(evidence.targetCommit).toBe(oldHead);
    expect(evidence.sourceCommit).toBe(git(spec.workspaceRoot, 'rev-parse', 'HEAD'));
    expect(evidence.changedPaths).toContain(spec.relativeManifestPath);
    expect(evidence.projectConfigChanged).toBe(false);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(oldHead);
    expect(git(root, 'status', '--porcelain')).toBe('');
  }, 90000);

  it('recognizes actual already-integrated ancestry', async () => {
    const { root, engine, spec } = await project();
    git(root, 'merge', '--ff-only', git(spec.workspaceRoot, 'rev-parse', 'HEAD'));
    const operationId = await reserve(engine, spec.specId);
    const evidence = await inspectCloseGitIntegration(engine, operationId);
    expect(evidence.relationship).toBe('already-integrated');
    expect(evidence.sourceCommit).toBe(evidence.targetCommit);
    expect(evidence.changedPaths).toEqual([]);
  }, 90000);

  it('recognizes already-integrated when target is a later descendant of source', async () => {
    const { root, engine, spec } = await project();
    const sourceHead = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    git(root, 'merge', '--ff-only', sourceHead);
    await writeFile(join(root, 'later-target-change.txt'), 'target commit after merge\\n');
    git(root, 'add', 'later-target-change.txt');
    commitStaged(root, 'target continues after source integration');
    const targetHead = git(root, 'rev-parse', 'HEAD');
    const evidence = await inspectCloseGitIntegration(engine, await reserve(engine, spec.specId));
    expect(evidence.relationship).toBe('already-integrated');
    expect(evidence.sourceCommit).toBe(sourceHead);
    expect(evidence.targetCommit).toBe(targetHead);
    expect(evidence.targetCommit).not.toBe(evidence.sourceCommit);
    expect(evidence.changedPaths).toContain('later-target-change.txt');
    expect(git(root, 'status', '--porcelain')).toBe('');
  }, 90000);

  it('includes committed project policy changes in the full-branch diff', async () => {
    const { root, engine, spec } = await project();
    const sourceConfig = join(spec.workspaceRoot, '.nevo/config.yaml');
    await writeFile(
      sourceConfig,
      'runtime: {}\\ngit:\\n  enabled: true\\n  integrationTargetBranch: other-branch\\n',
    );
    git(spec.workspaceRoot, 'add', '.nevo/config.yaml');
    commitStaged(spec.workspaceRoot, 'change project git policy in source branch');
    const primaryHead = git(root, 'rev-parse', 'HEAD');
    const evidence = await inspectCloseGitIntegration(engine, await reserve(engine, spec.specId));
    expect(evidence.relationship).toBe('fast-forward');
    expect(evidence.changedPaths).toContain('.nevo/config.yaml');
    expect(evidence.projectConfigChanged).toBe(true);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(primaryHead);
    expect(git(root, 'status', '--porcelain')).toBe('');
  }, 90000);

  it('identifies divergent whole-branch changes without publishing a merge', async () => {
    const { root, engine, spec } = await project();
    await writeFile(join(root, 'project-change.txt'), 'separate target change\n');
    git(root, 'add', 'project-change.txt');
    commitStaged(root, 'target diverged');
    const operationId = await reserve(engine, spec.specId);
    const targetHead = git(root, 'rev-parse', 'HEAD');
    const evidence = await inspectCloseGitIntegration(engine, operationId);
    expect(evidence.relationship).toBe('divergent');
    expect(evidence.changedPaths).toContain('project-change.txt');
    expect(evidence.changedPaths).toContain(spec.relativeManifestPath);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(targetHead);
  }, 90000);

  it('fails closed when source HEAD or target worktree changes after reservation', async () => {
    const { root, engine, spec } = await project();
    const operationId = await reserve(engine, spec.specId);
    await mkdir(join(spec.workspaceRoot, 'other'), { recursive: true });
    await writeFile(join(spec.workspaceRoot, 'other', 'change.txt'), 'new file\n');
    git(spec.workspaceRoot, 'add', 'other/change.txt');
    commitStaged(spec.workspaceRoot, 'source changed');
    await expect(inspectCloseGitIntegration(engine, operationId)).rejects.toMatchObject({
      code: 'CLOSE_CONFLICT',
    });
    const otherOperationId = randomUUID();
    // It is a distinct, fresh project so a new reservation can be admitted.
    const newer = await project();
    await reserveCloseOperation(newer.engine, {
      kind: 'worktree-close',
      operationId: otherOperationId,
      specId: newer.spec.specId,
    });
    await writeFile(join(newer.root, 'dirty.txt'), 'untracked\n');
    await expect(inspectCloseGitIntegration(newer.engine, otherOperationId)).rejects.toMatchObject({
      code: 'CLOSE_PREFLIGHT',
    });
    expect(git(root, 'status', '--porcelain')).toBe('');
  }, 120000);
});

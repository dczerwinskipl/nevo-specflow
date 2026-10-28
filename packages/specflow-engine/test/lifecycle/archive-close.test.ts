import { randomUUID } from 'node:crypto';
import { chmod, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';

import {
  archiveSpecificationWithCommit,
  bootstrapProjectHome,
  createSpecificationForTesting,
  inspectArchiveRecovery,
  inspectArchivePhysicalRecovery,
  inspectCloseOperation,
  prepareCloseGitIntegration,
  prepareDivergentCloseCandidate,
  inspectDivergentCloseResolution,
  settleArchivedLinkedConflict,
  reconcileArchivedConflictScratch,
  publishCloseGitFastForward,
  requireVerifiedCloseIntegration,
  readWorkspaceSpecification,
  reserveCloseOperation,
} from '../../src/testing';
import { createGitTestProject, git, commitStaged } from '../support/git-project';

const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0).reverse()) {
    await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
  }
});

async function fixture(includeUnicodeFile = false) {
  const root = await createGitTestProject(
    'archive-in-primary-Ż ',
    'runtime: {}\ngit:\n  enabled: true\n',
  );
  roots.push(root);
  const branch = git(root, 'symbolic-ref', '--short', 'HEAD');
  await writeFile(
    join(root, '.nevo/config.yaml'),
    'runtime: {}\ngit:\n  enabled: true\n  integrationTargetBranch: ' + branch + '\n',
  );
  git(root, 'add', '.nevo/config.yaml');
  commitStaged(root, 'target branch');
  const engine = await bootstrapProjectHome(root);
  const registry = await engine.readRegistry();
  const spec = await createSpecificationForTesting(engine, {
    operationId: randomUUID(),
    title: 'Archive scoped changes',
    created: '2026-10-18',
    archetype: { id: 'minimal', version: 1 },
    target: { kind: 'existing', workspaceId: registry.primaryWorkspaceId },
  });
  git(root, 'add', '--', spec.relativeManifestPath, 'specs/active/' + spec.slug + '/overview.md');
  commitStaged(root, 'create spec');
  if (includeUnicodeFile) {
    const filename = 'Notes [draft] Żółć.txt';
    const active = 'specs/active/' + spec.slug + '/' + filename;
    await writeFile(join(root, active), 'portable archive data\\n');
    git(root, 'add', '--', ':(literal)' + active);
    commitStaged(root, 'add literal Unicode archive file');
  }
  const operationId = randomUUID();
  await reserveCloseOperation(engine, {
    kind: 'specification-close',
    operationId,
    specId: spec.specId,
  });
  return { root, engine, spec, operationId };
}

describe('E2.T14 physical archive and exact scoped Git commit', () => {
  it('refuses a nonempty Engine hooksPath before archive mutation or hook execution', async () => {
    const { root, engine, spec, operationId } = await fixture();
    const hooks = join(engine.context.project.stateRoot, 'engine/integration-hooks-disabled');
    await mkdir(hooks, { recursive: true });
    const markerFile = join(root, 'hook-ran.txt');
    const hook = join(hooks, 'pre-commit');
    await writeFile(hook, '#!/bin/sh\nprintf violated > hook-ran.txt\nexit 29\n');
    await chmod(hook, 0o755);
    const pinnedHead = git(root, 'rev-parse', 'HEAD');
    await expect(archiveSpecificationWithCommit(engine, operationId)).rejects.toMatchObject({
      code: 'CLOSE_RECOVERY_REQUIRED',
    });
    expect((await inspectCloseOperation(engine, operationId))?.stage).toBe('reserved');
    expect(git(root, 'rev-parse', 'HEAD')).toBe(pinnedHead);
    expect(
      await readFile(join(root, 'specs/active', spec.slug, 'specification.yaml'), 'utf8'),
    ).toContain(spec.specId);
    await expect(readFile(markerFile, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
  }, 120000);

  it('inspects the physical archive after a crash before move, after rename, and after manifest rewrite', async () => {
    const { root, engine, spec, operationId } = await fixture();
    await expect(
      archiveSpecificationWithCommit(engine, operationId, () =>
        Promise.reject(new Error('simulated stop after durable archive intent')),
      ),
    ).rejects.toThrow('simulated stop');
    expect((await inspectCloseOperation(engine, operationId))?.stage).toBe('archive-initiated');
    expect(await inspectArchivePhysicalRecovery(engine, operationId)).toBe('source-unmoved');

    const oldPath = join(root, 'specs/active', spec.slug);
    const newPath = join(root, 'specs/archive', spec.slug);
    await mkdir(join(root, 'specs/archive'), { recursive: true });
    await rename(oldPath, newPath);
    expect(await inspectArchivePhysicalRecovery(engine, operationId)).toBe(
      'moved-original-manifest',
    );

    const manifestPath = join(newPath, 'specification.yaml');
    const sourceManifest = parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
    await writeFile(manifestPath, stringify({ ...sourceManifest, status: 'archived' }));
    expect(await inspectArchivePhysicalRecovery(engine, operationId)).toBe(
      'moved-archived-manifest',
    );
    expect(await inspectArchiveRecovery(engine, operationId)).toBe('move-incomplete');
    await expect(archiveSpecificationWithCommit(engine, operationId)).rejects.toMatchObject({
      code: 'CLOSE_PREFLIGHT',
    });
    expect((await inspectCloseOperation(engine, operationId))?.stage).toBe('archive-initiated');
  }, 120000);

  it('settles a known post-archive conflict without losing linked canonical source or scratch ownership', async () => {
    const root = await createGitTestProject(
      'archive-conflict-Ż ',
      'runtime: {}\ngit:\n  enabled: true\n',
    );
    roots.push(root);
    const branch = git(root, 'symbolic-ref', '--short', 'HEAD');
    await writeFile(
      join(root, '.nevo/config.yaml'),
      'runtime: {}\ngit:\n  enabled: true\n  integrationTargetBranch: ' + branch + '\n',
    );
    git(root, 'add', '.nevo/config.yaml');
    commitStaged(root, 'configure');
    const engine = await bootstrapProjectHome(root);
    const spec = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Archived conflict source',
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
    commitStaged(spec.workspaceRoot, 'canonical source');
    await writeFile(join(spec.workspaceRoot, 'conflicting.txt'), 'linked version\n');
    git(spec.workspaceRoot, 'add', 'conflicting.txt');
    commitStaged(spec.workspaceRoot, 'linked edit');
    await writeFile(join(root, 'conflicting.txt'), 'primary version\n');
    git(root, 'add', 'conflicting.txt');
    commitStaged(root, 'primary edit');
    const primaryHead = git(root, 'rev-parse', 'HEAD');
    const operationId = randomUUID();
    await reserveCloseOperation(engine, {
      kind: 'specification-close',
      operationId,
      specId: spec.specId,
      integrateToTargetBranch: true,
    });
    const archived = await archiveSpecificationWithCommit(engine, operationId);
    await prepareCloseGitIntegration(engine, operationId);
    const conflicted = await prepareDivergentCloseCandidate(engine, operationId);
    expect(conflicted.stage).toBe('integration-scratch-conflict');
    expect(conflicted.scratch?.conflictPaths).toEqual(['conflicting.txt']);
    const resolution = await inspectDivergentCloseResolution(engine, operationId);
    expect(resolution.status).toBe('requires-resolution');
    const settled = await settleArchivedLinkedConflict(engine, operationId);
    expect(settled.stage).toBe('archived-linked-awaiting-integration');
    expect(settled.outcome).toBe('archived-linked-awaiting-integration');
    expect(settled.archive?.committedHead).toBe(archived.archive?.committedHead);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(primaryHead);
    expect(git(root, 'status', '--porcelain')).toBe('');
    const registry = await engine.readRegistry();
    expect(registry.specBindings.find((x) => x.specId === spec.specId)?.workspaceId).not.toBe(
      registry.primaryWorkspaceId,
    );
    expect((await readWorkspaceSpecification(spec.workspaceRoot, spec.specId)).location).toBe(
      'archive',
    );
    await expect(
      reserveCloseOperation(engine, {
        kind: 'worktree-close',
        operationId: randomUUID(),
        specId: spec.specId,
      }),
    ).rejects.toMatchObject({ code: 'CLOSE_CONFLICT' });

    await expect(reconcileArchivedConflictScratch(engine, operationId, true)).rejects.toMatchObject(
      {
        code: 'CLOSE_RECOVERY_REQUIRED',
      },
    );
    const scratchRoot = conflicted.scratch!.root;
    git(scratchRoot, 'merge', '--abort');
    git(root, 'worktree', 'remove', '--', scratchRoot);
    await expect(
      reconcileArchivedConflictScratch(engine, operationId, false),
    ).rejects.toMatchObject({
      code: 'CLOSE_RECOVERY_REQUIRED',
    });
    const released = await reconcileArchivedConflictScratch(engine, operationId, true);
    expect(released.scratchRetired).toBe(true);
    expect((await reconcileArchivedConflictScratch(engine, operationId, true)).scratchRetired).toBe(
      true,
    );
    const retryId = randomUUID();
    const result = await reserveCloseOperation(engine, {
      kind: 'worktree-close',
      operationId: retryId,
      specId: spec.specId,
    });
    expect(result.journal.stage).toBe('reserved');
  }, 120000);

  it('integrates the POST-archive source commit for a managed linked Specification', async () => {
    const root = await createGitTestProject(
      'archive-linked-source-Ż ',
      'runtime: {}\ngit:\n  enabled: true\n',
    );
    roots.push(root);
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
      title: 'Linked archival source',
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
    commitStaged(spec.workspaceRoot, 'spec active');
    const original = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    const operationId = randomUUID();
    await reserveCloseOperation(engine, {
      kind: 'specification-close',
      operationId,
      specId: spec.specId,
      integrateToTargetBranch: true,
    });
    const archived = await archiveSpecificationWithCommit(engine, operationId);
    const committedSource = archived.archive?.committedHead;
    expect(archived.stage).toBe('archive-committed');
    expect(committedSource).not.toBe(original);
    expect((await readWorkspaceSpecification(spec.workspaceRoot, spec.specId)).location).toBe(
      'archive',
    );
    const prepared = await prepareCloseGitIntegration(engine, operationId);
    expect(prepared.integration?.sourceCommit).toBe(committedSource);
    expect(prepared.integration?.relationship).toBe('fast-forward');
    const verified = await publishCloseGitFastForward(engine, operationId);
    expect(verified.stage).toBe('integration-verified');
    expect(verified.integration?.publishedCommit).toBe(committedSource);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(committedSource);
    expect((await readWorkspaceSpecification(root, spec.specId)).location).toBe('archive');
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect(await requireVerifiedCloseIntegration(engine, operationId)).toEqual(verified);
    // T15 owns eventual binding handover / archived Close settlement.
    const registry = await engine.readRegistry();
    expect(registry.specBindings.find((x) => x.specId === spec.specId)?.workspaceId).not.toBe(
      registry.primaryWorkspaceId,
    );
  }, 120000);

  it('LC26: archives literal bracketed and Unicode filenames under a spaced Git checkout', async () => {
    const { root, engine, spec, operationId } = await fixture(true);
    const filename = 'Notes [draft] Żółć.txt';
    const active = 'specs/active/' + spec.slug + '/' + filename;
    const archived = 'specs/archive/' + spec.slug + '/' + filename;
    const before = git(root, 'rev-parse', 'HEAD');
    const result = await archiveSpecificationWithCommit(engine, operationId);
    expect(result.stage).toBe('archive-committed');
    expect(result.archive?.committedHead).toBe(git(root, 'rev-parse', 'HEAD'));
    expect(git(root, 'rev-parse', 'HEAD')).not.toBe(before);
    expect(await readFile(join(root, archived), 'utf8')).toBe('portable archive data\\n');
    await expect(readFile(join(root, active), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect(await inspectArchiveRecovery(engine, operationId)).toBe('committed');
  }, 120000);

  it('moves all owned files, preserves canonical specId, and commits only the two scoped trees', async () => {
    const { root, engine, spec, operationId } = await fixture();
    const oldPath = 'specs/active/' + spec.slug;
    const newPath = 'specs/archive/' + spec.slug;
    const before = git(root, 'rev-parse', 'HEAD');
    const journal = await archiveSpecificationWithCommit(engine, operationId);
    expect(journal.stage).toBe('archive-committed');
    expect(journal.archive?.sourceCommit).toBe(before);
    expect(journal.archive?.committedHead).toBe(git(root, 'rev-parse', 'HEAD'));
    expect(journal.archive?.committedTree).toBe(git(root, 'write-tree'));
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect(git(root, 'rev-list', '--parents', '-n', '1', 'HEAD')).toBe(
      journal.archive?.committedHead + ' ' + before,
    );
    expect(
      git(root, 'diff-tree', '--no-commit-id', '--name-only', '--no-renames', '-r', 'HEAD^', 'HEAD')
        .split('\n')
        .sort(),
    ).toEqual(
      [
        oldPath + '/overview.md',
        oldPath + '/specification.yaml',
        newPath + '/overview.md',
        newPath + '/specification.yaml',
      ].sort(),
    );
    const archived = await readWorkspaceSpecification(root, spec.specId);
    expect(archived.specId).toBe(spec.specId);
    expect(archived.location).toBe('archive');
    expect(archived.status).toBe('archived');
    expect(await readFile(join(root, newPath, 'overview.md'), 'utf8')).toContain(spec.slug);
    expect(await inspectArchiveRecovery(engine, operationId)).toBe('committed');
    await expect(archiveSpecificationWithCommit(engine, operationId)).rejects.toMatchObject({
      code: 'CLOSE_PREFLIGHT',
    });
  }, 120000);

  it('refuses dirty unrelated files before publishing any archive intent', async () => {
    const { root, engine, spec, operationId } = await fixture();
    const original = git(root, 'rev-parse', 'HEAD');
    await writeFile(join(root, 'unrelated-change.txt'), 'do not touch\n');
    await expect(archiveSpecificationWithCommit(engine, operationId)).rejects.toMatchObject({
      code: 'CLOSE_PREFLIGHT',
    });
    expect((await inspectCloseOperation(engine, operationId))?.stage).toBe('reserved');
    expect(git(root, 'rev-parse', 'HEAD')).toBe(original);
    expect(
      await readFile(join(root, 'specs/active', spec.slug, 'specification.yaml'), 'utf8'),
    ).toContain(spec.specId);
  }, 120000);

  it('refuses an existing archive destination rather than overwrite it', async () => {
    const { root, engine, spec, operationId } = await fixture();
    const before = git(root, 'rev-parse', 'HEAD');
    await mkdir(join(root, 'specs/archive', spec.slug), { recursive: true });
    await writeFile(join(root, 'specs/archive', spec.slug, 'user.md'), 'important\n');
    await expect(archiveSpecificationWithCommit(engine, operationId)).rejects.toMatchObject({
      code: 'CLOSE_PREFLIGHT',
    });
    expect(git(root, 'rev-parse', 'HEAD')).toBe(before);
    expect((await inspectCloseOperation(engine, operationId))?.stage).toBe('reserved');
  }, 120000);
});

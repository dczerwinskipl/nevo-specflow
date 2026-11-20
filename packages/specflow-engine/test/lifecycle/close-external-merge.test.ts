import { randomUUID } from 'node:crypto';
import { cp, lstat, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  bootstrapProjectHome,
  closeSpecification,
  closeWorktree,
  createSpecificationForTesting,
  inspectCloseOperation,
  readWorkspaceSpecification,
  reserveCloseOperation,
} from '../../src/testing';
import { previewPublicCloseOperation } from '../../src/specs/operations/api';
import { createGitTestProject, git, commitStaged } from '../support/git-project';

const cleanup: string[] = [];
afterEach(async () => {
  for (const root of cleanup.splice(0).reverse()) {
    await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
  }
});

/** A linked Specification worktree, one commit ahead of the pinned integration target. */
async function fixture(beforeSpec?: (root: string) => Promise<void>) {
  const root = await createGitTestProject(
    'close-external-merge-Ż ',
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
  // The worktree below forks from HEAD now, so anything committed here is part of the merge
  // base both branches share.
  await beforeSpec?.(root);
  const engine = await bootstrapProjectHome(root);
  const spec = await createSpecificationForTesting(engine, {
    operationId: randomUUID(),
    title: 'Finish after external merge',
    created: '2026-11-19',
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

describe('#157 finish Close after an external (PR) merge', () => {
  it('finishes without a new merge commit and rebinds the canonical Spec', async () => {
    const { root, engine, spec } = await fixture();
    // The source branch also ships an ordinary application-code change, exactly like the
    // whole-branch guarantee the already-integrated (ancestry) path already gives for free.
    await mkdir(join(spec.workspaceRoot, 'src'), { recursive: true });
    await writeFile(join(spec.workspaceRoot, 'src', 'app.ts'), 'export const value = 1;\n');
    git(spec.workspaceRoot, 'add', '--', 'src/app.ts');
    commitStaged(spec.workspaceRoot, 'also ship an application code change');

    const squashSourcePath = join(spec.workspaceRoot, 'specs', 'active', spec.slug);
    const squashDestinationPath = join(root, 'specs', 'active', spec.slug);
    await mkdir(join(root, 'specs', 'active'), { recursive: true });
    await cp(squashSourcePath, squashDestinationPath, { recursive: true });
    await mkdir(join(root, 'src'), { recursive: true });
    await cp(join(spec.workspaceRoot, 'src', 'app.ts'), join(root, 'src', 'app.ts'));
    git(root, 'add', '-A', '--', 'specs/active/' + spec.slug, 'src/app.ts');
    commitStaged(root, 'simulate external squash merge of ' + spec.slug);
    const squashedHead = git(root, 'rev-parse', 'HEAD');

    const result = await closeWorktree(engine, {
      operationId: randomUUID(),
      specId: spec.specId,
      finishAfterExternalMerge: true,
    });
    expect(result.status).toBe('completed');

    // No new merge commit: the destination's HEAD is exactly the externally-merged commit.
    expect(git(root, 'rev-parse', 'HEAD')).toBe(squashedHead);
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect(git(root, 'worktree', 'list', '--porcelain').match(/worktree /gu)).toHaveLength(1);
    await expect(lstat(spec.workspaceRoot)).rejects.toMatchObject({ code: 'ENOENT' });

    const registry = await engine.readRegistry();
    expect(registry.specBindings.find((x) => x.specId === spec.specId)?.workspaceId).toBe(
      registry.primaryWorkspaceId,
    );
    expect(registry.workspaces.some((x) => x.kind === 'linked')).toBe(false);
  }, 150000);

  it('previews already-merged-externally instead of describing a merge that will not happen', async () => {
    const { root, engine, spec } = await fixture();
    const squashSourcePath = join(spec.workspaceRoot, 'specs', 'active', spec.slug);
    const squashDestinationPath = join(root, 'specs', 'active', spec.slug);
    await mkdir(join(root, 'specs', 'active'), { recursive: true });
    await cp(squashSourcePath, squashDestinationPath, { recursive: true });
    git(root, 'add', '-A', '--', 'specs/active/' + spec.slug);
    commitStaged(root, 'simulate external squash merge of ' + spec.slug);

    const sourceBranch = git(spec.workspaceRoot, 'symbolic-ref', '--short', 'HEAD');
    const targetBranch = git(root, 'symbolic-ref', '--short', 'HEAD');

    // With the flag: no merge will happen, so the preview must not describe one.
    const withFlag = await previewPublicCloseOperation(engine, {
      kind: 'worktree-close',
      operationId: randomUUID(),
      specId: spec.specId,
      finishAfterExternalMerge: true,
    });
    expect(withFlag.merge).toEqual({
      status: 'not-integrated',
      reason: 'already-merged-externally',
      sourceBranch,
      targetBranch,
    });

    // Without the flag, the ordinary preview is unaffected: it still describes the real merge
    // an actual Close of this same plan would perform.
    const withoutFlag = await previewPublicCloseOperation(engine, {
      kind: 'worktree-close',
      operationId: randomUUID(),
      specId: spec.specId,
    });
    expect(withoutFlag.merge).toMatchObject({ status: 'integrates', sourceBranch, targetBranch });
  }, 120000);

  it('refuses a diverged destination subtree, naming the differing path, with no mutation', async () => {
    const { root, engine, spec } = await fixture();
    const squashSourcePath = join(spec.workspaceRoot, 'specs', 'active', spec.slug);
    const squashDestinationPath = join(root, 'specs', 'active', spec.slug);
    await mkdir(join(root, 'specs', 'active'), { recursive: true });
    await cp(squashSourcePath, squashDestinationPath, { recursive: true });
    // A conflicting edit on the target branch after the "squash merge": the subtrees now differ.
    await writeFile(
      join(squashDestinationPath, 'overview.md'),
      (await readFile(join(squashDestinationPath, 'overview.md'), 'utf8')) + '\nedited on target\n',
    );
    git(root, 'add', '-A', '--', 'specs/active/' + spec.slug);
    commitStaged(root, 'simulate a diverging edit on the target branch');
    const beforePrimaryHead = git(root, 'rev-parse', 'HEAD');
    const beforeSourceHead = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    const before = await engine.readRegistry();

    const operationId = randomUUID();
    await expect(
      closeWorktree(engine, { operationId, specId: spec.specId, finishAfterExternalMerge: true }),
    ).rejects.toMatchObject({
      code: 'CLOSE_EXTERNAL_MERGE_MISMATCH',
      // Both the canonical subtree (the whole-folder check) and the specific differing file from
      // the branch-diff list name the mismatch: the proof runs both checks (B1's resolution item 2).
      paths: ['specs/active/' + spec.slug, 'specs/active/' + spec.slug + '/overview.md'],
    });

    expect(git(root, 'rev-parse', 'HEAD')).toBe(beforePrimaryHead);
    expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).toBe(beforeSourceHead);
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect((await engine.readRegistry()).specBindings).toEqual(before.specBindings);
    expect((await engine.readRegistry()).workspaces).toEqual(before.workspaces);
    expect(git(root, 'worktree', 'list', '--porcelain').match(/worktree /gu)).toHaveLength(2);
  }, 150000);

  it('refuses when the destination is missing an application-code change from the same source branch, naming it', async () => {
    const { root, engine, spec } = await fixture();
    // The source branch changes both the Spec and application code; the "external merge" only
    // picked up the Spec's own folder, exactly the partial-merge gap #157's whole-branch proof closes.
    await mkdir(join(spec.workspaceRoot, 'src'), { recursive: true });
    await writeFile(join(spec.workspaceRoot, 'src', 'app.ts'), 'export const value = 1;\n');
    git(spec.workspaceRoot, 'add', '--', 'src/app.ts');
    commitStaged(spec.workspaceRoot, 'also ship an application code change');

    const squashDestinationPath = join(root, 'specs', 'active', spec.slug);
    await mkdir(join(root, 'specs', 'active'), { recursive: true });
    await cp(join(spec.workspaceRoot, 'specs', 'active', spec.slug), squashDestinationPath, {
      recursive: true,
    });
    git(root, 'add', '-A', '--', 'specs/active/' + spec.slug);
    commitStaged(root, 'simulate a partial external squash merge (Spec files only)');
    const beforePrimaryHead = git(root, 'rev-parse', 'HEAD');
    const beforeSourceHead = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    const before = await engine.readRegistry();

    const operationId = randomUUID();
    await expect(
      closeWorktree(engine, { operationId, specId: spec.specId, finishAfterExternalMerge: true }),
    ).rejects.toMatchObject({
      code: 'CLOSE_EXTERNAL_MERGE_MISMATCH',
      paths: ['src/app.ts'],
    });

    expect(git(root, 'rev-parse', 'HEAD')).toBe(beforePrimaryHead);
    expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).toBe(beforeSourceHead);
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect((await engine.readRegistry()).specBindings).toEqual(before.specBindings);
    expect((await engine.readRegistry()).workspaces).toEqual(before.workspaces);
    expect(git(root, 'worktree', 'list', '--porcelain').match(/worktree /gu)).toHaveLength(2);
  }, 150000);

  it('finishes when the source branch deletes a file and the destination mirrors the same deletion', async () => {
    const { root, engine, spec } = await fixture(async (projectRoot) => {
      await mkdir(join(projectRoot, 'docs'), { recursive: true });
      await writeFile(join(projectRoot, 'docs', 'legacy.md'), 'legacy content\n');
      git(projectRoot, 'add', '--', 'docs/legacy.md');
      commitStaged(projectRoot, 'add a file the source branch will later delete');
    });
    git(spec.workspaceRoot, 'rm', '--', 'docs/legacy.md');
    commitStaged(spec.workspaceRoot, 'remove the legacy doc');

    const squashDestinationPath = join(root, 'specs', 'active', spec.slug);
    await mkdir(join(root, 'specs', 'active'), { recursive: true });
    await cp(join(spec.workspaceRoot, 'specs', 'active', spec.slug), squashDestinationPath, {
      recursive: true,
    });
    // The destination mirrors the same deletion, exactly as a correct squash merge would.
    git(root, 'rm', '--', 'docs/legacy.md');
    git(root, 'add', '-A', '--', 'specs/active/' + spec.slug);
    commitStaged(root, 'simulate external squash merge including the mirrored deletion');
    const squashedHead = git(root, 'rev-parse', 'HEAD');

    const result = await closeWorktree(engine, {
      operationId: randomUUID(),
      specId: spec.specId,
      finishAfterExternalMerge: true,
    });
    expect(result.status).toBe('completed');
    expect(git(root, 'rev-parse', 'HEAD')).toBe(squashedHead);
    expect(git(root, 'status', '--porcelain')).toBe('');
  }, 150000);

  it('refuses when the source branch deletes a file the destination still has, naming it', async () => {
    const { root, engine, spec } = await fixture(async (projectRoot) => {
      await mkdir(join(projectRoot, 'docs'), { recursive: true });
      await writeFile(join(projectRoot, 'docs', 'legacy.md'), 'legacy content\n');
      git(projectRoot, 'add', '--', 'docs/legacy.md');
      commitStaged(projectRoot, 'add a file the source branch will later delete');
    });
    git(spec.workspaceRoot, 'rm', '--', 'docs/legacy.md');
    commitStaged(spec.workspaceRoot, 'remove the legacy doc');

    const squashDestinationPath = join(root, 'specs', 'active', spec.slug);
    await mkdir(join(root, 'specs', 'active'), { recursive: true });
    await cp(join(spec.workspaceRoot, 'specs', 'active', spec.slug), squashDestinationPath, {
      recursive: true,
    });
    // The "external merge" only picked up the Spec's folder; the destination still has the file
    // the source branch deleted — a genuine mismatch, not a legitimate shared absence.
    git(root, 'add', '-A', '--', 'specs/active/' + spec.slug);
    commitStaged(root, 'simulate a partial external squash merge (deletion not carried over)');
    const beforePrimaryHead = git(root, 'rev-parse', 'HEAD');
    const beforeSourceHead = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
    const before = await engine.readRegistry();

    const operationId = randomUUID();
    await expect(
      closeWorktree(engine, { operationId, specId: spec.specId, finishAfterExternalMerge: true }),
    ).rejects.toMatchObject({
      code: 'CLOSE_EXTERNAL_MERGE_MISMATCH',
      paths: ['docs/legacy.md'],
    });

    expect(git(root, 'rev-parse', 'HEAD')).toBe(beforePrimaryHead);
    expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).toBe(beforeSourceHead);
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect((await engine.readRegistry()).specBindings).toEqual(before.specBindings);
    expect((await engine.readRegistry()).workspaces).toEqual(before.workspaces);
    expect(git(root, 'worktree', 'list', '--porcelain').match(/worktree /gu)).toHaveLength(2);
  }, 150000);

  it('guards the request field as part of the immutable reserved intent', async () => {
    const { engine, spec } = await fixture();
    const operationId = randomUUID();
    await reserveCloseOperation(engine, {
      kind: 'worktree-close',
      operationId,
      specId: spec.specId,
      finishAfterExternalMerge: true,
    });
    await expect(
      reserveCloseOperation(engine, {
        kind: 'worktree-close',
        operationId,
        specId: spec.specId,
        finishAfterExternalMerge: false,
      }),
    ).rejects.toMatchObject({ code: 'CLOSE_CONFLICT' });
    expect((await inspectCloseOperation(engine, operationId))?.plan.finishAfterExternalMerge).toBe(
      true,
    );
  }, 120000);

  it(
    // Owner decision 2026-11-20: Specification Close never supports finishAfterExternalMerge.
    // This scenario used to assert the opposite — that it "finished" by only ever proving the
    // destination's pre-archive (specs/active) identity, never `'archive'` — which was a false
    // success: the canonical Specification stayed `active` at the destination forever while the
    // operation reported `completed`/`integrated-and-removed`. It now asserts the explicit refusal,
    // even though the destination genuinely has the externally-merged content.
    'refuses finishAfterExternalMerge for Specification Close, with no mutation, even when the destination already has the content',
    async () => {
      const { root, engine, spec } = await fixture();
      const squashSourcePath = join(spec.workspaceRoot, 'specs', 'active', spec.slug);
      const squashDestinationPath = join(root, 'specs', 'active', spec.slug);
      await mkdir(join(root, 'specs', 'active'), { recursive: true });
      await cp(squashSourcePath, squashDestinationPath, { recursive: true });
      git(root, 'add', '-A', '--', 'specs/active/' + spec.slug);
      commitStaged(root, 'simulate external squash merge of ' + spec.slug);
      const beforePrimaryHead = git(root, 'rev-parse', 'HEAD');
      const beforeSourceHead = git(spec.workspaceRoot, 'rev-parse', 'HEAD');

      const operationId = randomUUID();
      await expect(
        closeSpecification(engine, {
          operationId,
          specId: spec.specId,
          finishAfterExternalMerge: true,
        }),
      ).rejects.toMatchObject({ code: 'CLOSE_EXTERNAL_MERGE_UNSUPPORTED' });

      expect(git(root, 'rev-parse', 'HEAD')).toBe(beforePrimaryHead);
      expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).toBe(beforeSourceHead);
      expect(git(root, 'status', '--porcelain')).toBe('');
      expect((await readWorkspaceSpecification(spec.workspaceRoot, spec.specId)).location).toBe(
        'active',
      );
      expect(git(root, 'worktree', 'list', '--porcelain').match(/worktree /gu)).toHaveLength(2);
      expect(await inspectCloseOperation(engine, operationId)).toBeUndefined();
    },
    150000,
  );
});

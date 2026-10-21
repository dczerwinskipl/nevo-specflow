import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  bootstrapProjectHome,
  withProjectControlLock,
  assertResourcesAvailable,
  createSpecificationForTesting,
  inspectCloseOperation,
  listCloseJournals,
  previewCloseOperation,
  reserveCloseOperation,
  type SpecFlowEngine,
} from '../src/testing';
import { createGitTestProject, git } from './support/git-project';
import { closeJournalPath } from '../src/specs/lifecycle/journal-store';

const roots: string[] = [];
afterEach(async () => {
  // Linked test worktrees must be removed before their Git common directory.
  // Windows can temporarily hold file handles after Git subprocess exit.
  for (const path of roots.splice(0).reverse()) {
    await rm(path, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
  }
});

async function fixture(target: 'current' | 'different' | 'none' = 'current') {
  const root = await createGitTestProject(
    'specflow-lifecycle-Ż space ',
    'runtime: {}\ngit:\n  enabled: true\n',
  );
  roots.push(root);
  const branch = git(root, 'symbolic-ref', '--short', 'HEAD');
  await writeFile(
    join(root, '.nevo/config.yaml'),
    'runtime: {}\ngit:\n  enabled: true\n' +
      (target === 'none'
        ? ''
        : '  integrationTargetBranch: ' + (target === 'current' ? branch : 'other-branch') + '\n'),
  );
  git(root, 'add', '.nevo/config.yaml');
  // With target=none, createGitTestProject already committed the identical
  // config. Do not invent a second empty commit just to satisfy this fixture.
  if (git(root, 'status', '--porcelain', '--', '.nevo/config.yaml')) {
    git(
      root,
      '-c',
      'user.name=SpecFlow Test',
      '-c',
      'user.email=specflow@example.invalid',
      'commit',
      '-qm',
      'project branch policy',
    );
  }
  return { root, engine: await bootstrapProjectHome(root), branch };
}

async function specification(engine: SpecFlowEngine, title: string, linked = false) {
  const created = await createSpecificationForTesting(engine, {
    operationId: randomUUID(),
    title,
    created: '2026-10-17',
    target: linked
      ? { kind: 'new-worktree', baseRef: 'HEAD' }
      : { kind: 'existing', workspaceId: engine.workspace.workspaceId },
  });
  if (linked) roots.push(dirname(created.workspaceRoot));
  git(
    created.workspaceRoot,
    'add',
    '--',
    created.relativeManifestPath,
    'specs/active/' + created.slug + '/overview.md',
  );
  git(
    created.workspaceRoot,
    '-c',
    'user.name=SpecFlow Test',
    '-c',
    'user.email=specflow@example.invalid',
    'commit',
    '-qm',
    'commit authored source',
  );
  return created;
}

describe('E2.T10 — read-only lifecycle admission and durable shared Git resource claims', () => {
  it.each(['modified', 'staged', 'untracked'] as const)(
    'LC11: %s linked source rejects Close without any journal or primary mutation',
    async (dirty) => {
      const { root, engine } = await fixture();
      const spec = await specification(engine, 'Source dirty ' + dirty, true);
      const sourceHead = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
      const primaryHead = git(root, 'rev-parse', 'HEAD');
      const registry = await engine.readRegistry();
      if (dirty === 'modified') {
        await writeFile(
          join(spec.workspaceRoot, spec.relativeManifestPath),
          (await readFile(join(spec.workspaceRoot, spec.relativeManifestPath), 'utf8')) +
            '# local edit\n',
        );
      } else {
        const name = dirty === 'staged' ? 'staged-source.txt' : 'untracked-source.txt';
        await writeFile(join(spec.workspaceRoot, name), 'uncommitted content\n');
        if (dirty === 'staged') git(spec.workspaceRoot, 'add', '--', name);
      }
      expect(git(spec.workspaceRoot, 'status', '--porcelain')).not.toBe('');
      const operationId = randomUUID();
      await expect(
        reserveCloseOperation(engine, {
          kind: 'worktree-close',
          operationId,
          specId: spec.specId,
        }),
      ).rejects.toMatchObject({ code: 'CLOSE_PREFLIGHT' });
      expect(await inspectCloseOperation(engine, operationId)).toBeUndefined();
      expect(await engine.readRegistry()).toEqual(registry);
      expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).toBe(sourceHead);
      expect(git(root, 'rev-parse', 'HEAD')).toBe(primaryHead);
      expect(git(root, 'status', '--porcelain')).toBe('');
    },
    120000,
  );

  it.each(['modified', 'staged', 'untracked'] as const)(
    'LC12: %s primary index/worktree rejects linked integration without mutation',
    async (dirty) => {
      const { root, engine } = await fixture();
      const spec = await specification(engine, 'Primary dirty ' + dirty, true);
      const primaryHead = git(root, 'rev-parse', 'HEAD');
      const sourceHead = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
      const registry = await engine.readRegistry();
      if (dirty === 'modified') {
        await writeFile(join(root, '.gitignore'), '.nevo/local/\n# local primary edit\n');
      } else {
        const name = dirty === 'staged' ? 'staged-primary.txt' : 'untracked-primary.txt';
        await writeFile(join(root, name), 'uncommitted primary content\n');
        if (dirty === 'staged') git(root, 'add', '--', name);
      }
      expect(git(root, 'status', '--porcelain')).not.toBe('');
      const beforePhysical = git(root, 'status', '--porcelain');
      const operationId = randomUUID();
      await expect(
        reserveCloseOperation(engine, {
          kind: 'worktree-close',
          operationId,
          specId: spec.specId,
        }),
      ).rejects.toMatchObject({ code: 'CLOSE_PREFLIGHT' });
      expect(await inspectCloseOperation(engine, operationId)).toBeUndefined();
      expect(await engine.readRegistry()).toEqual(registry);
      expect(git(root, 'rev-parse', 'HEAD')).toBe(primaryHead);
      expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).toBe(sourceHead);
      expect(git(root, 'status', '--porcelain')).toBe(beforePhysical);
      expect(git(spec.workspaceRoot, 'status', '--porcelain')).toBe('');
    },
    120000,
  );

  it.each(['missing', 'invalid', 'duplicate', 'symlink'] as const)(
    'LC15: committed %s canonical linked source cannot Close or publish a journal',
    async (kind) => {
      const { root, engine } = await fixture();
      const spec = await specification(engine, 'Source integrity ' + kind, true);
      const manifest = join(spec.workspaceRoot, spec.relativeManifestPath);
      if (kind === 'missing') {
        await rm(manifest);
      } else if (kind === 'invalid') {
        await writeFile(manifest, 'id: [broken YAML\n');
      } else if (kind === 'duplicate') {
        const duplicate = join(spec.workspaceRoot, 'specs/archive/' + spec.slug);
        await mkdir(duplicate, { recursive: true });
        await copyFile(manifest, join(duplicate, 'specification.yaml'));
      } else {
        const redirect = join(spec.workspaceRoot, '.nevo/local/redirected-spec.yaml');
        await copyFile(manifest, redirect);
        await rm(manifest);
        await symlink(redirect, manifest, 'file');
      }
      git(spec.workspaceRoot, 'add', '-A', '--', 'specs/');
      git(
        spec.workspaceRoot,
        '-c',
        'user.name=SpecFlow Test',
        '-c',
        'user.email=specflow@example.invalid',
        'commit',
        '-qm',
        'commit invalid canonical source variant',
      );
      const primaryHead = git(root, 'rev-parse', 'HEAD');
      const sourceHead = git(spec.workspaceRoot, 'rev-parse', 'HEAD');
      const before = await engine.readRegistry();
      const operationId = randomUUID();
      await expect(
        reserveCloseOperation(engine, {
          kind: 'worktree-close',
          operationId,
          specId: spec.specId,
        }),
      ).rejects.toThrow();
      expect(await inspectCloseOperation(engine, operationId)).toBeUndefined();
      expect(await engine.readRegistry()).toEqual(before);
      expect(git(root, 'rev-parse', 'HEAD')).toBe(primaryHead);
      expect(git(spec.workspaceRoot, 'rev-parse', 'HEAD')).toBe(sourceHead);
      expect(git(root, 'status', '--porcelain')).toBe('');
      expect(git(spec.workspaceRoot, 'status', '--porcelain')).toBe('');
    },
    120000,
  );

  it('LC14: another canonical linked occupant forbids worktree removal', async () => {
    const { root, engine } = await fixture();
    const first = await specification(engine, 'First linked occupant', true);
    const second = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Second linked occupant',
      created: '2026-10-17',
      target: { kind: 'existing', workspaceId: first.workspaceId },
    });
    git(
      first.workspaceRoot,
      'add',
      '--',
      second.relativeManifestPath,
      'specs/active/' + second.slug + '/overview.md',
    );
    git(
      first.workspaceRoot,
      '-c',
      'user.name=SpecFlow Test',
      '-c',
      'user.email=specflow@example.invalid',
      'commit',
      '-qm',
      'commit second canonical linked occupant',
    );
    const primaryHead = git(root, 'rev-parse', 'HEAD');
    const sourceHead = git(first.workspaceRoot, 'rev-parse', 'HEAD');
    const registry = await engine.readRegistry();
    expect(
      registry.specBindings.filter((entry) => entry.workspaceId === first.workspaceId),
    ).toHaveLength(2);
    const operationId = randomUUID();
    await expect(
      reserveCloseOperation(engine, {
        kind: 'worktree-close',
        operationId,
        specId: first.specId,
      }),
    ).rejects.toMatchObject({ code: 'CLOSE_SHARED_WORKTREE' });
    expect(await inspectCloseOperation(engine, operationId)).toBeUndefined();
    expect(await engine.readRegistry()).toEqual(registry);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(primaryHead);
    expect(git(first.workspaceRoot, 'rev-parse', 'HEAD')).toBe(sourceHead);
    expect(git(first.workspaceRoot, 'status', '--porcelain')).toBe('');
    expect(git(root, 'status', '--porcelain')).toBe('');
  }, 120000);

  it('previews primary close without changing Git/index/registry or worktrees', async () => {
    const { engine, root, branch } = await fixture();
    const created = await specification(engine, 'Archive on primary');
    const gitHead = git(root, 'rev-parse', 'HEAD');
    const registryBefore = await engine.readRegistry();
    const preview = await previewCloseOperation(engine, {
      kind: 'specification-close',
      operationId: randomUUID(),
      specId: created.specId,
    });

    expect(preview).toMatchObject({
      kind: 'specification-close',
      specId: created.specId,
      location: 'active',
      registryRevision: registryBefore.revision,
      source: { workspaceId: engine.workspace.workspaceId, branch, head: gitHead },
      target: { workspaceId: engine.workspace.workspaceId, branch, head: gitHead },
      targetBranch: branch,
    });
    expect(preview.resources).toContain('checkout:' + engine.workspace.workspaceId);
    expect(preview.resources).toContain('ref:refs/heads/' + branch.toLowerCase());
    expect(git(root, 'rev-parse', 'HEAD')).toBe(gitHead);
    expect(git(root, 'status', '--porcelain', '--untracked-files=all')).toBe('');
    expect(await engine.readRegistry()).toEqual(registryBefore);
    expect(await listCloseJournals(engine.context)).toEqual([]);
  }, 90000);

  it('reserves the primary index across different Spec IDs and preserves retry ownership', async () => {
    const { engine, root } = await fixture();
    const first = await specification(engine, 'First closable');
    const second = await specification(engine, 'Second closable');
    const operationId = randomUUID();
    const request = { kind: 'specification-close' as const, specId: first.specId, operationId };
    const head = git(root, 'rev-parse', 'HEAD');
    const before = await engine.readRegistry();
    const claimed = await reserveCloseOperation(engine, request);

    expect(claimed.existing).toBe(false);
    expect(claimed.journal.stage).toBe('reserved');
    expect((await inspectCloseOperation(engine, operationId))?.plan).toEqual(claimed.journal.plan);
    expect(await reserveCloseOperation(engine, request)).toEqual({
      journal: claimed.journal,
      existing: true,
    });
    await expect(
      reserveCloseOperation(engine, {
        kind: 'specification-close',
        operationId: randomUUID(),
        specId: second.specId,
      }),
    ).rejects.toMatchObject({ code: 'CLOSE_CONFLICT' });

    expect(git(root, 'rev-parse', 'HEAD')).toBe(head);
    expect(await engine.readRegistry()).toEqual(before);
    expect(await listCloseJournals(engine.context)).toHaveLength(1);
    await withProjectControlLock(engine.context, async () => {
      // A new Create in this checkout is excluded by the SAME journal-derived
      // claim, even when its Specification ID differs.
      await expect(
        assertResourcesAvailable(engine.context, [
          'checkout:' + engine.workspace.workspaceId,
          'spec:' + randomUUID(),
        ]),
      ).rejects.toMatchObject({ code: 'CLOSE_CONFLICT' });
    });

    // An identical retry remains a reader once first-admission clean-tree
    // preflight is no longer possible; it must not re-publish or own effects.
    await writeFile(join(root, first.relativeManifestPath), 'external edit\n');
    expect((await reserveCloseOperation(engine, request)).existing).toBe(true);
    await expect(
      reserveCloseOperation(engine, { ...request, specId: second.specId }),
    ).rejects.toMatchObject({ code: 'CLOSE_CONFLICT' });
  }, 90000);

  it('blocks Close after an unfinished Create reserves the same primary checkout', async () => {
    const { engine } = await fixture();
    const created = await specification(engine, 'Closable before pending create');
    await expect(
      createSpecificationForTesting(
        engine,
        {
          operationId: randomUUID(),
          title: 'Pending Create in same checkout',
          created: '2026-10-17',
          target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
        },
        {
          afterEffect: (stage) =>
            stage === 'reservation'
              ? Promise.reject(new Error('intentionally interrupted Create'))
              : Promise.resolve(),
        },
      ),
    ).rejects.toThrow('intentionally interrupted Create');

    await expect(
      reserveCloseOperation(engine, {
        kind: 'specification-close',
        operationId: randomUUID(),
        specId: created.specId,
      }),
    ).rejects.toMatchObject({ code: 'CLOSE_CONFLICT' });
    expect(await listCloseJournals(engine.context)).toEqual([]);
  }, 90000);

  it('allows linked archive-only without target configuration or primary branch mutation', async () => {
    const { engine, root } = await fixture('none');
    const first = await specification(engine, 'Local archive first', true);
    const second = await specification(engine, 'Local archive second', true);
    const homeHead = git(root, 'rev-parse', 'HEAD');
    const one = await reserveCloseOperation(engine, {
      kind: 'specification-close',
      operationId: randomUUID(),
      specId: first.specId,
      integrateToTargetBranch: false,
    });
    const two = await reserveCloseOperation(engine, {
      kind: 'specification-close',
      operationId: randomUUID(),
      specId: second.specId,
      integrateToTargetBranch: false,
    });

    expect(one.existing).toBe(false);
    expect(two.existing).toBe(false);
    // An omitted option defaults to integration for linked Specifications;
    // it must not reinterpret a pinned archive-only intent as an identical retry.
    await expect(
      reserveCloseOperation(engine, {
        kind: 'specification-close',
        operationId: one.journal.plan.operationId,
        specId: first.specId,
      }),
    ).rejects.toMatchObject({ code: 'CLOSE_CONFLICT' });
    expect(
      (
        await reserveCloseOperation(engine, {
          kind: 'specification-close',
          operationId: one.journal.plan.operationId,
          specId: first.specId,
          integrateToTargetBranch: false,
        })
      ).existing,
    ).toBe(true);
    expect(one.journal.plan.targetBranch).toBeUndefined();
    expect(one.journal.plan.target).toBeUndefined();
    expect(one.journal.plan.integrateToTargetBranch).toBe(false);
    expect(two.journal.plan.source.workspaceId).not.toBe(one.journal.plan.source.workspaceId);
    expect(git(root, 'rev-parse', 'HEAD')).toBe(homeHead);
    await expect(
      previewCloseOperation(engine, {
        kind: 'worktree-close',
        operationId: randomUUID(),
        specId: second.specId,
      }),
    ).rejects.toMatchObject({ code: 'CLOSE_PREFLIGHT' });
  }, 120000);

  it('blocks wrong primary branch, uncommitted content and primary Worktree close', async () => {
    const { engine: wrong } = await fixture('different');
    const wrongSpec = await specification(wrong, 'Wrong configured branch');
    await expect(
      previewCloseOperation(wrong, {
        kind: 'specification-close',
        specId: wrongSpec.specId,
      }),
    ).rejects.toMatchObject({ code: 'CLOSE_PREFLIGHT' });
    const { engine: current, root } = await fixture();
    const spec = await specification(current, 'Dirty worktree');
    await writeFile(join(root, 'do-not-touch.txt'), 'untouched\n');
    await expect(
      previewCloseOperation(current, {
        kind: 'specification-close',
        specId: spec.specId,
      }),
    ).rejects.toMatchObject({ code: 'CLOSE_PREFLIGHT' });
    expect(await readFile(join(root, 'do-not-touch.txt'), 'utf8')).toBe('untouched\n');
    await expect(
      previewCloseOperation(current, { kind: 'worktree-close', specId: spec.specId }),
    ).rejects.toMatchObject({ code: 'CLOSE_PREFLIGHT' });
  }, 120000);

  it('rejects an unfinished Git merge even when porcelain reports a clean checkout', async () => {
    const { engine, root, branch } = await fixture();
    const spec = await specification(engine, 'No-delta merge under way');
    git(root, 'checkout', '-b', 'empty-side');
    git(
      root,
      '-c',
      'user.name=SpecFlow Test',
      '-c',
      'user.email=specflow@example.invalid',
      'commit',
      '--allow-empty',
      '-qm',
      'empty branch change',
    );
    git(root, 'checkout', branch);
    git(
      root,
      '-c',
      'user.name=SpecFlow Test',
      '-c',
      'user.email=specflow@example.invalid',
      'merge',
      '--no-commit',
      '--no-ff',
      'empty-side',
    );
    expect(git(root, 'status', '--porcelain=v1')).toBe('');
    await expect(
      previewCloseOperation(engine, {
        kind: 'specification-close',
        operationId: randomUUID(),
        specId: spec.specId,
      }),
    ).rejects.toMatchObject({ code: 'CLOSE_PREFLIGHT' });
    expect(await listCloseJournals(engine.context)).toEqual([]);
  }, 90000);

  it('rejects tampered or redirected journal resources and never overwrites them', async () => {
    const { engine } = await fixture();
    const created = await specification(engine, 'Immutable claims');
    const operationId = randomUUID();
    await reserveCloseOperation(engine, {
      kind: 'specification-close',
      specId: created.specId,
      operationId,
    });
    const path = closeJournalPath(engine.context, operationId);
    const original = JSON.parse(await readFile(path, 'utf8')) as {
      plan: { resources: string[] };
    };
    const corrupted = {
      ...original,
      plan: { ...original.plan, resources: ['spec:' + created.specId] },
    };
    await writeFile(path, JSON.stringify(corrupted));
    await expect(inspectCloseOperation(engine, operationId)).rejects.toMatchObject({
      code: 'CLOSE_JOURNAL_CORRUPT',
    });
    await expect(listCloseJournals(engine.context)).rejects.toMatchObject({
      code: 'CLOSE_JOURNAL_CORRUPT',
    });
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(corrupted);

    // A forged "completed" state without Git/registry/filesystem proofs must
    // not release reserved checkout/index/ref ownership.
    await writeFile(
      path,
      JSON.stringify({
        ...original,
        stage: 'completed',
        outcome: 'integrated-and-removed',
      }),
    );
    await expect(listCloseJournals(engine.context)).rejects.toMatchObject({
      code: 'CLOSE_JOURNAL_CORRUPT',
    });
  }, 90000);
});

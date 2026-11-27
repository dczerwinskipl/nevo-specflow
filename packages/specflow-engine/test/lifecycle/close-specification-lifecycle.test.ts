import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  abandonSpecification,
  archiveSpecificationWithCommit,
  bootstrapProjectHome,
  closeSpecification,
  createTask,
  finishStep,
  installProjectDefinitions,
  startSpecificationExecution,
  openWorkflow,
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
} from '../../src/testing';
import { siblingSpecificationDirectories } from '../../src/specs/lifecycle/preflight';
import { createGitTestProject, git, commitStaged } from '../support/git-project';

const cleanup: string[] = [];
afterEach(async () => {
  for (const root of cleanup.splice(0).reverse()) {
    await rm(root, { recursive: true, force: true, maxRetries: 6, retryDelay: 250 });
  }
});

async function fixture(linked: boolean, archetype: 'minimal' | 'feature' = 'minimal') {
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
  commitStaged(root, 'pin integration target');
  const engine = await bootstrapProjectHome(root);
  if (archetype === 'feature') {
    // The workflow binding of `feature` comes from the project's definitions (the install commits them).
    await installProjectDefinitions(engine);
  }

  const registry = await engine.readRegistry();
  const spec = await createSpecificationForTesting(engine, {
    operationId: randomUUID(),
    title: 'Lifecycle archive test',
    created: '2026-10-18',
    archetype: { id: archetype, version: 1 },
    target: linked
      ? { kind: 'new-worktree' as const, baseRef: 'HEAD' }
      : { kind: 'existing' as const, workspaceId: registry.primaryWorkspaceId },
  });
  if (linked) {
    cleanup.push(dirname(spec.workspaceRoot));
  }

  git(
    spec.workspaceRoot,
    'add',
    '--',
    ...(archetype === 'feature'
      ? ['specs/active/' + spec.slug]
      : [spec.relativeManifestPath, 'specs/active/' + spec.slug + '/overview.md']),
  );
  commitStaged(spec.workspaceRoot, 'commit authored specification');

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

  it('refuses a draft Task before any Specification run (D07) until the owner abandons it', async () => {
    // Auto-commit is off (the default): workflow writes are in the ledger until a step's finish.
    const { root, engine, spec } = await fixture(false, 'feature');
    const owner = { class: 'human', details: { actorId: 'local:owner', trust: 'local' } } as const;
    const directory = 'specs/active/' + spec.slug;
    const dirty = () =>
      git(root, 'status', '--porcelain', '--untracked-files=all')
        .split('\n')
        .filter(Boolean)
        .map((line) => line.slice(3))
        .sort();
    await createTask(await openWorkflow(engine), {
      specId: spec.specId,
      taskId: 'docs',
      title: 'Document it',
      type: 'implementation',
      actor: owner,
    });
    expect(dirty()).toEqual([
      `${directory}/tasks/docs/task.md`,
      `${directory}/tasks/docs/task.yaml`,
      `${directory}/tasks/index.yaml`,
    ]);

    await expect(
      closeSpecification(engine, { operationId: randomUUID(), specId: spec.specId }),
    ).rejects.toMatchObject({
      code: 'CLOSE_BLOCKED',
      blockers: [{ kind: 'draft-tasks', subjectIds: ['docs'] }],
    });

    // "Next": the finish of a step commits the Specification's execution state (its post action).
    const started = await startSpecificationExecution(await openWorkflow(engine), {
      specId: spec.specId,
      archetype: 'feature',
      actor: owner,
    });
    if (started.kind === 'terminal') {
      throw new Error('The Specification run did not start.');
    }

    const finished = await finishStep(await openWorkflow(engine), {
      subject: { kind: 'specification', specId: spec.specId },
      step: started.context.step.id,
      attempt: started.context.attempt,
      input: {},
      actor: owner,
    });
    expect(finished.postActions).toMatchObject([
      { action: 'commit-execution-state', status: 'completed' },
    ]);
    const [post] = finished.postActions ?? [];
    expect(post?.status === 'completed' ? post.commit?.paths.length : 0).toBeGreaterThan(0);
    // The step by its title, never cut (B5); the step id and attempt are in the body.
    expect(git(root, 'log', '-1', '--format=%s')).toBe(
      `spec(workflow): finish "${started.context.step.title}" in ${spec.slug}`,
    );
    expect(git(root, 'log', '-1', '--format=%b')).toContain(
      `Step ${started.context.step.id}, attempt ${started.context.attempt}.`,
    );
    expect(dirty()).toEqual([]);

    const abandoned = await abandonSpecification(await openWorkflow(engine), {
      specId: spec.specId,
      reason: 'Not needed any more.',
      actor: owner,
    });
    expect(abandoned.cancelledTasks).toEqual(['docs']);
    expect(dirty().length).toBeGreaterThan(0);

    // Anything else dirty still refuses the Close, and the refusal names it.
    await writeFile(join(root, 'stray.txt'), 'not the workflow\n');
    await expect(
      closeSpecification(engine, { operationId: randomUUID(), specId: spec.specId }),
    ).rejects.toMatchObject({ code: 'CLOSE_PREFLIGHT', paths: ['stray.txt'] });
    await rm(join(root, 'stray.txt'));

    // The abandon is not committed by hand: the archive commit takes the execution state along.
    const head = git(root, 'rev-parse', 'HEAD');
    await expect(
      closeSpecification(engine, { operationId: randomUUID(), specId: spec.specId }),
    ).resolves.toMatchObject({ status: 'completed' });
    expect((await readWorkspaceSpecification(root, spec.specId)).location).toBe('archive');
    expect(git(root, 'rev-list', '--count', head + '..HEAD')).toBe('1');
    expect(dirty()).toEqual([]);
    expect(
      git(root, 'show', 'HEAD:specs/archive/' + spec.slug + '/tasks/docs/task.yaml'),
    ).toContain('status: cancelled');
  }, 180000);

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
      archetype: { id: 'minimal', version: 1 },
      target: { kind: 'existing', workspaceId: sourceWorkspaceId },
    });
    const c = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Independent sibling C',
      created: '2026-10-20',
      archetype: { id: 'minimal', version: 1 },
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
    commitStaged(a.workspaceRoot, 'commit sibling specifications');
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
    expect((await readWorkspaceSpecification(a.workspaceRoot, a.specId)).location).toBe('active');
    expect((await readWorkspaceSpecification(a.workspaceRoot, b.specId)).location).toBe('archive');
    expect((await readWorkspaceSpecification(a.workspaceRoot, c.specId)).location).toBe('active');
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
    if (blocked instanceof Error) {
      expect(blocked.message).toContain('workspace-scoped Close');
    }

    expect(await inspectCloseOperation(engine, refusedOp)).toBeUndefined();
    expect(git(a.workspaceRoot, 'rev-parse', 'HEAD')).toBe(archivedHead);
    expect((await engine.readRegistry()).specBindings).toEqual(before.specBindings);
  }, 120000);

  it("#181: a sibling's own pending ledger entry and pre-existing staged file never block Close of another Specification sharing the checkout", async () => {
    // Auto-commit is off (the default): A's workflow write sits in the ledger until a step finishes.
    const { root, engine, spec: a } = await fixture(false, 'feature');
    const registry = await engine.readRegistry();
    const b = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Closed while A has pending work',
      created: '2026-11-20',
      archetype: { id: 'minimal', version: 1 },
      target: { kind: 'existing', workspaceId: registry.primaryWorkspaceId },
    });
    git(root, 'add', '--', b.relativeManifestPath, 'specs/active/' + b.slug + '/overview.md');
    commitStaged(root, 'commit sibling specification B');

    const owner = { class: 'human', details: { actorId: 'local:owner', trust: 'local' } } as const;
    // A started step: ledger-held, uncommitted execution state under A's own directory.
    await createTask(await openWorkflow(engine), {
      specId: a.specId,
      taskId: 'docs',
      title: 'Document it',
      type: 'implementation',
      actor: owner,
    });
    // Fix 1's scenario: one of A's own execution-state files is STAGED (not just working-tree-dirty
    // / untracked, as `createTask` alone leaves it) — the sibling isolation only ever exempts a
    // sibling's own execution state, never its arbitrary documents, which must still refuse.
    git(root, 'add', '--', 'specs/active/' + a.slug + '/tasks/docs/task.yaml');

    const dirty = () =>
      git(root, 'status', '--porcelain', '--untracked-files=all')
        .split('\n')
        .filter(Boolean)
        .map((line) => line.slice(3))
        .sort();
    const beforeDirty = dirty();
    expect(beforeDirty.length).toBeGreaterThan(0);

    const result = await closeSpecification(engine, {
      operationId: randomUUID(),
      specId: b.specId,
    });
    expect(result).toMatchObject({
      status: 'completed',
      journal: { outcome: 'archived-in-primary' },
    });

    // A's ledger entry, its staged file, and every other one of its paths are untouched.
    expect(dirty()).toEqual(
      beforeDirty.filter((path) => !path.startsWith('specs/active/' + b.slug)),
    );
    expect((await readWorkspaceSpecification(root, a.specId)).location).toBe('active');
    expect((await readWorkspaceSpecification(root, b.specId)).location).toBe('archive');

    // A's own entries are never checked against another (now-closed) known directory: a later
    // Close of A itself is still refused by D07 for A's own still-draft Task (`CLOSE_BLOCKED`), not
    // by some unrelated Git/ledger error a broken ownership check (own entries matched to the wrong
    // directory) would otherwise produce.
    await expect(
      closeSpecification(engine, { operationId: randomUUID(), specId: a.specId }),
    ).rejects.toMatchObject({ code: 'CLOSE_BLOCKED', blockers: [{ kind: 'draft-tasks' }] });
  }, 180000);

  it('#181: an unexplained dirty path belonging to no registered Specification still refuses, naming it', async () => {
    const { root, engine, spec: a } = await fixture(false);
    const registry = await engine.readRegistry();
    const b = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Closed beside an unexplained dirty path',
      created: '2026-11-20',
      archetype: { id: 'minimal', version: 1 },
      target: { kind: 'existing', workspaceId: registry.primaryWorkspaceId },
    });
    git(root, 'add', '--', b.relativeManifestPath, 'specs/active/' + b.slug + '/overview.md');
    commitStaged(root, 'commit sibling specification B');
    void a;

    await writeFile(join(root, 'scratch-notes.txt'), 'not any Specification\n');
    await expect(
      closeSpecification(engine, { operationId: randomUUID(), specId: b.specId }),
    ).rejects.toMatchObject({ code: 'CLOSE_PREFLIGHT', paths: ['scratch-notes.txt'] });
    await rm(join(root, 'scratch-notes.txt'));
  }, 120000);

  it('#181 Fix 4: a physically-discovered Specification without a specBindings entry is excluded from the sibling set', async () => {
    const { root, engine, spec: a } = await fixture(false);
    const registry = await engine.readRegistry();
    const b = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Physically present, about to lose its binding',
      created: '2026-11-20',
      archetype: { id: 'minimal', version: 1 },
      target: { kind: 'existing', workspaceId: registry.primaryWorkspaceId },
    });
    git(root, 'add', '--', b.relativeManifestPath, 'specs/active/' + b.slug + '/overview.md');
    commitStaged(root, 'commit sibling specification B');

    const live = await engine.readRegistry();
    // B is physically discoverable (a valid manifest on disk) but its own registry binding is
    // simulated absent: a physically-discovered but unregistered/orphan directory (Fix 4).
    const withoutBinding = {
      ...live,
      specBindings: live.specBindings.filter((entry) => entry.specId !== b.specId),
    };
    expect(
      await siblingSpecificationDirectories(root, live.primaryWorkspaceId, live, a.specId),
    ).toEqual([{ specId: b.specId, directory: 'specs/active/' + b.slug }]);
    expect(
      await siblingSpecificationDirectories(
        root,
        live.primaryWorkspaceId,
        withoutBinding,
        a.specId,
      ),
    ).toEqual([]);
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
      archetype: { id: 'minimal', version: 1 },
      target: { kind: 'existing', workspaceId },
    });
    const c = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Workspace sibling C',
      created: '2026-10-20',
      archetype: { id: 'minimal', version: 1 },
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
    commitStaged(a.workspaceRoot, 'add sibling Specs');
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
    for (const { specId, location } of [
      { specId: a.specId, location: 'active' },
      { specId: b.specId, location: 'archive' },
      { specId: c.specId, location: 'active' },
    ]) {
      const binding = current.specBindings.find((x) => x.specId === specId);
      expect(binding?.workspaceId).toBe(registry.primaryWorkspaceId);
      expect(binding?.generation).toBe(revision + 1);
      expect((await readWorkspaceSpecification(root, specId)).location).toBe(location);
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
      archetype: { id: 'minimal', version: 1 },
      target: { kind: 'existing', workspaceId },
    });
    git(
      a.workspaceRoot,
      'add',
      '--',
      b.relativeManifestPath,
      'specs/active/' + b.slug + '/overview.md',
    );
    commitStaged(a.workspaceRoot, 'sibling before CAS crash');
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
      archetype: { id: 'minimal', version: 1 },
      target: { kind: 'existing', workspaceId },
    });
    git(
      a.workspaceRoot,
      'add',
      '--',
      b.relativeManifestPath,
      'specs/active/' + b.slug + '/overview.md',
    );
    commitStaged(a.workspaceRoot, 'commit shared source before ignored user file');
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
      expect((await readWorkspaceSpecification(root, specId)).location).toBe('active');
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
        archetype: { id: 'minimal', version: 1 },
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

    commitStaged(a.workspaceRoot, 'committed shared siblings');
    await closeSpecification(engine, {
      operationId: randomUUID(),
      specId: siblings[0]!.specId,
      integrateToTargetBranch: false,
    });
    await writeFile(join(root, 'target-independent.txt'), 'diverge destination\n');
    git(root, 'add', '--', 'target-independent.txt');
    commitStaged(root, 'advance target without touching Specs');
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
    for (const { specId, location } of [
      { specId: a.specId, location: 'active' },
      { specId: siblings[0]!.specId, location: 'archive' },
      { specId: siblings[1]!.specId, location: 'active' },
    ]) {
      expect(current.specBindings.find((x) => x.specId === specId)?.workspaceId).toBe(
        registry.primaryWorkspaceId,
      );
      expect((await readWorkspaceSpecification(root, specId)).location).toBe(location);
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
      archetype: { id: 'minimal', version: 1 },
      target: { kind: 'existing', workspaceId },
    });
    git(
      a.workspaceRoot,
      'add',
      '--',
      b.relativeManifestPath,
      'specs/active/' + b.slug + '/overview.md',
    );
    commitStaged(a.workspaceRoot, 'shared conflict siblings');
    await writeFile(join(root, 'shared-conflict.txt'), 'target owns text\n');
    git(root, 'add', '--', 'shared-conflict.txt');
    commitStaged(root, 'target introduces conflict');
    await writeFile(join(a.workspaceRoot, 'shared-conflict.txt'), 'source owns different text\n');
    git(a.workspaceRoot, 'add', '--', 'shared-conflict.txt');
    commitStaged(a.workspaceRoot, 'source introduces conflict');
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
    expect((await readWorkspaceSpecification(a.workspaceRoot, a.specId)).location).toBe('active');
    expect((await readWorkspaceSpecification(a.workspaceRoot, b.specId)).location).toBe('active');
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
      archetype: { id: 'minimal', version: 1 },
      target: { kind: 'existing', workspaceId: a.workspaceId },
    });
    git(
      a.workspaceRoot,
      'add',
      '--',
      b.relativeManifestPath,
      'specs/active/' + b.slug + '/overview.md',
    );
    commitStaged(a.workspaceRoot, 'shared identity sources');
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
      expect((await readWorkspaceSpecification(root, a.specId)).location).toBe('active');
      expect((await readWorkspaceSpecification(root, b.specId)).location).toBe('active');
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
    commitStaged(root, 'change configured integration branch');
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

  it('refuses finishAfterExternalMerge before any mutation (owner decision 2026-11-20): only Worktree Close may finish this way', async () => {
    const { root, engine, spec } = await fixture(false);
    const beforeHead = git(root, 'rev-parse', 'HEAD');
    const operationId = randomUUID();

    await expect(
      closeSpecification(engine, {
        operationId,
        specId: spec.specId,
        finishAfterExternalMerge: true,
      }),
    ).rejects.toMatchObject({ code: 'CLOSE_EXTERNAL_MERGE_UNSUPPORTED' });

    // No mutation at all: Specification Close's contract requires ending up archived at the
    // destination, which this mode never proves, so it refuses before touching Git, the
    // Specification or the journal.
    expect(git(root, 'rev-parse', 'HEAD')).toBe(beforeHead);
    expect(git(root, 'status', '--porcelain')).toBe('');
    expect((await readWorkspaceSpecification(root, spec.specId)).location).toBe('active');
    expect(await inspectCloseOperation(engine, operationId)).toBeUndefined();
  }, 60000);
});

import { subscribe, unsubscribe } from 'node:diagnostics_channel';
import { randomUUID } from 'node:crypto';
import { rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  inspectCreateOptions,
  openSpecFlowEngine,
  readCanonicalSpecDocument,
  readCanonicalSpecSources,
  readRegistrySnapshot,
  resolveSpecificationForRead,
  type SpecFlowEngine,
  inspectWorkspaceForRead,
  inspectWorkspaces,
} from '../src';
import {
  bootstrapProjectHome,
  createSpecificationForTesting,
  installDefinitionsForTesting,
} from '../src/testing';
import { createGitTestProject, git } from './support/git-project';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((root) => rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })),
  );
});

async function countGit<T>(work: () => Promise<T>): Promise<{ result: T; spawns: string[][] }> {
  const spawns: string[][] = [];
  const listener = (message: unknown): void => {
    spawns.push([...(message as { args: readonly string[] }).args]);
  };

  subscribe('nevo.specflow.engine.git-process', listener);
  try {
    return { result: await work(), spawns };
  } finally {
    unsubscribe('nevo.specflow.engine.git-process', listener);
  }
}

async function project(gitEnabled: boolean): Promise<{ root: string; engine: SpecFlowEngine }> {
  const root = await createGitTestProject(
    'specflow-no-git-reads-',
    'runtime: {}\ngit:\n  enabled: ' + String(gitEnabled) + '\n',
  );
  roots.push(root, root + '-worktrees');

  return { root, engine: await bootstrapProjectHome(root) };
}

async function primaryTarget(engine: SpecFlowEngine) {
  return {
    kind: 'existing' as const,
    workspaceId: (await engine.readRegistry()).primaryWorkspaceId,
  };
}

/** Every Engine READ operation behind the overview/workspace/documents/tasks/create-options endpoints. */
const readOperations: readonly (readonly [
  string,
  (engine: SpecFlowEngine, specId: string) => Promise<unknown>,
])[] = [
  ['overview current', (engine) => readCanonicalSpecSources(engine)],
  ['overview archive', (engine) => readCanonicalSpecSources(engine, () => true)],
  ['workspace', (engine, specId) => readCanonicalSpecSources(engine, (id) => id === specId)],
  ['document manifest', (engine, specId) => readCanonicalSpecDocument(engine, specId, 'manifest')],
  ['document overview', (engine, specId) => readCanonicalSpecDocument(engine, specId, 'overview')],
  ['resolve specification', (engine, specId) => resolveSpecificationForRead(engine, specId)],
  ['registry', (engine) => readRegistrySnapshot(engine)],
  ['create-options', (engine) => inspectCreateOptions(engine)],
  [
    'workspace read inspection',
    (engine) => inspectWorkspaceForRead(engine, engine.workspace.workspaceId),
  ],
  ['workspaces list', (engine) => inspectWorkspaces(engine)],
];

describe('read endpoints never spawn Git (regression guard)', () => {
  describe.each([false, true])('git.enabled = %s', (gitEnabled) => {
    it.each(readOperations)(
      '%s spawns zero Git processes',
      async (_name, read) => {
        if (gitEnabled && (_name === 'create-options' || _name === 'workspaces list')) {
          return;
        } // budgeted separately below

        const { engine } = await project(gitEnabled);
        const created = await createSpecificationForTesting(engine, {
          operationId: randomUUID(),
          title: 'Guarded read',
          created: '2026-10-20',
          archetype: { id: 'minimal', version: 1 },
          target: await primaryTarget(engine),
        });
        const { spawns } = await countGit(() => read(engine, created.specId));
        expect(spawns).toEqual([]);
      },
      240000,
    );
  });
});

describe('git-disabled project end to end', () => {
  it('serves reads and creates into the existing workspace without any Git process', async () => {
    const { engine } = await project(false);
    const target = await primaryTarget(engine);
    // Installing the definitions is a project-file mutation under the control lock, whose admission
    // proves the Project Home with Git (docs/architecture/runtime/project-home-and-workspaces.md):
    // setup, not part of the Git-free create and reads measured here.
    await installDefinitionsForTesting(engine);
    const { spawns, result } = await countGit(async () => {
      const created = await createSpecificationForTesting(engine, {
        operationId: randomUUID(),
        title: 'No git at all',
        created: '2026-10-20',
        archetype: { id: 'minimal', version: 1 },
        target,
      });
      const options = await inspectCreateOptions(engine);
      const sources = await readCanonicalSpecSources(engine);
      const document = await readCanonicalSpecDocument(engine, created.specId, 'overview');

      return { created, options, sources, document };
    });
    expect(spawns).toEqual([]);
    expect(result.options.newWorktree).toEqual({ status: 'disabled', reason: 'git-disabled' });
    expect(result.options.workspaces).toHaveLength(1);
    expect(result.options.workspaces[0]).toMatchObject({
      kind: 'primary',
      state: 'available',
      selectable: true,
      specCount: 1,
    });
    expect(result.options.baseRefs).toEqual([]);
    expect(result.sources.map((s) => s.specId)).toEqual([result.created.specId]);
    expect(result.document.status).toBe('available');
  }, 240000);
});

describe('git-enabled create-options Git budget', () => {
  it('bounds inherent reads by workspaces, refs and unique commits, with no verification processes', async () => {
    const { root, engine } = await project(true);
    const commits: string[] = [];
    for (const title of ['Linked one', 'Linked two']) {
      const created = await createSpecificationForTesting(engine, {
        operationId: randomUUID(),
        title,
        created: '2026-10-20',
        archetype: { id: 'minimal', version: 1 },
        target: { kind: 'new-worktree', baseRef: 'HEAD' },
      });
      commits.push(git(created.workspaceRoot, 'rev-parse', 'HEAD'));
    }

    commits.push(git(root, 'rev-parse', 'HEAD'));

    // The alias and configured HEAD share the primary commit: each adds a resolution, not
    // another ls-tree/show inspection. Different linked scaffold commits still need their own.
    git(root, 'branch', 'same-commit-alias');

    const { spawns, result } = await countGit(() => inspectCreateOptions(engine));
    expect(result.workspaces).toHaveLength(3);
    expect(result.baseRefs).toHaveLength(4);
    expect(new Set(commits).size).toBe(3);
    const commands = spawns.map((args) => (args[0] === '-c' ? args.slice(2) : args));
    const expected = [
      ['worktree', 'list', '--porcelain', '-z'],
      ['for-each-ref', '--format=%(refname)', 'refs/heads'],
      ...result.workspaces.map(() => ['status', '--porcelain=v1', '--untracked-files=all']),
      ...[...result.baseRefs.map((base) => base.ref), 'HEAD'].map((ref) => [
        'rev-parse',
        '--verify',
        '--end-of-options',
        ref + '^{commit}',
      ]),
      ...commits.flatMap((commit) => [
        ['ls-tree', '-z', commit, '--', '.nevo/config.yaml'],
        ['show', commit + ':.nevo/config.yaml'],
      ]),
    ];
    // Exact allowlist excludes identity/ignore verification and mutations. The process bound
    // is 2 listing reads + W statuses + R refs + 1 configured default + 2 unique config reads.
    expect(spawns).toHaveLength(
      2 + result.workspaces.length + result.baseRefs.length + 1 + 2 * commits.length,
    );
    expect(commands.map((args) => JSON.stringify(args)).sort()).toEqual(
      expected.map((args) => JSON.stringify(args)).sort(),
    );
    const registry = await countGit(() => readRegistrySnapshot(engine));
    expect(registry.spawns).toEqual([]);
  }, 240000);
});

describe('filesystem-only availability on reads', () => {
  it('reports a workspace deleted or replaced on disk as unavailable without Git', async () => {
    const { engine } = await project(true);
    const linked = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Linked gone',
      created: '2026-10-20',
      archetype: { id: 'minimal', version: 1 },
      target: { kind: 'new-worktree', baseRef: 'HEAD' },
    });
    const registry = await engine.readRegistry();
    const root = registry.workspaces.find((w) => w.workspaceId === linked.workspaceId)!.root;
    await rename(root, root + '-moved');
    roots.push(root + '-moved');

    const { spawns, result } = await countGit(() => readCanonicalSpecSources(engine));
    expect(spawns).toEqual([]);
    expect(result.find((s) => s.specId === linked.specId)?.status).toBe('workspace_unavailable');
  }, 240000);

  it('reopening the Engine re-verifies Project Home with Git exactly where it is opened', async () => {
    const { root } = await project(false);
    const { spawns } = await countGit(() => openSpecFlowEngine({ cwd: root }));
    expect(spawns.length).toBeGreaterThan(0);
  }, 240000);
});

describe('mutations keep full Git verification', () => {
  it('a Git-enabled create still re-verifies Project Home with Git', async () => {
    const { engine } = await project(true);
    const target = await primaryTarget(engine);
    const { spawns } = await countGit(() =>
      createSpecificationForTesting(engine, {
        operationId: randomUUID(),
        title: 'Mutation verifies',
        created: '2026-10-20',
        archetype: { id: 'minimal', version: 1 },
        target,
      }),
    );
    const verbs = spawns.map((args) => args[0]);
    expect(verbs).toContain('worktree');
    expect(verbs).toContain('check-ignore');
  }, 240000);
});

describe('verification split between reads and mutations', () => {
  it('keeps full Git verification on the non-read (mutation) registry path', async () => {
    const { engine } = await project(false);
    const { spawns } = await countGit(() => engine.readRegistry());
    expect(spawns.length).toBeGreaterThanOrEqual(5);
  }, 240000);

  it('refuses a read of a linked checkout whose Git link was redirected, without Git', async () => {
    const { engine } = await project(true);
    const linked = await createSpecificationForTesting(engine, {
      operationId: randomUUID(),
      title: 'Redirected link',
      created: '2026-10-20',
      archetype: { id: 'minimal', version: 1 },
      target: { kind: 'new-worktree', baseRef: 'HEAD' },
    });
    const registry = await engine.readRegistry();
    const root = registry.workspaces.find((w) => w.workspaceId === linked.workspaceId)!.root;
    await rm(join(root, '.git'), { force: true });
    await writeFile(join(root, '.git'), 'gitdir: ' + join(root, 'elsewhere') + '\n');

    const { spawns } = await countGit(async () => {
      await expect(readCanonicalSpecSources(engine)).rejects.toMatchObject({
        code: 'REGISTRY_WORKSPACE_MISMATCH',
      });
    });
    expect(spawns).toEqual([]);
  }, 240000);
});

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
} from '../src';
import { bootstrapProjectHome, createSpecificationForTesting } from '../src/testing';
import { createGitTestProject } from './support/git-project';

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
];

describe('read endpoints never spawn Git (regression guard)', () => {
  describe.each([false, true])('git.enabled = %s', (gitEnabled) => {
    it.each(readOperations)(
      '%s spawns zero Git processes',
      async (_name, read) => {
        if (gitEnabled && _name === 'create-options') {
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
  it('uses at most 8 Git processes for three workspaces and none for registry-only facts', async () => {
    const { engine } = await project(true);
    for (const title of ['Linked one', 'Linked two']) {
      await createSpecificationForTesting(engine, {
        operationId: randomUUID(),
        title,
        created: '2026-10-20',
        archetype: { id: 'minimal', version: 1 },
        target: { kind: 'new-worktree', baseRef: 'HEAD' },
      });
    }

    const { spawns, result } = await countGit(() => inspectCreateOptions(engine));
    expect(result.workspaces).toHaveLength(3);
    expect(spawns.length).toBeLessThanOrEqual(8);
    const verbs = spawns.map((args) =>
      args.find((a) => a !== '-c' && a !== 'core.optionalLocks=false'),
    );
    expect(verbs.filter((v) => v === 'worktree')).toHaveLength(1);
    expect(verbs.filter((v) => v === 'for-each-ref')).toHaveLength(1);
    expect(verbs).not.toContain('check-ignore');
    expect(verbs).not.toContain('rev-parse');
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

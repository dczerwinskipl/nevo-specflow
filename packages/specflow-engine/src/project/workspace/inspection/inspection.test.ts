import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { createGitTestProject, git } from '../../../../test/support/git-project';
import {
  addWorkspace,
  bindSpecToWorkspace,
  bootstrapProjectHome,
  createSpecificationScaffold,
  provisionLinkedWorkspaceIdentity,
  seedCatalogueForTesting,
  updateWorkspaceRegistry,
  type SpecFlowEngine,
} from '../../../testing';
import { WORKSPACE_IDENTITY_RELATIVE_PATH } from '../identity';
import { GitCapabilityError } from '../../../git/errors';
import {
  inspectRegistryWorkspaces,
  inspectWorkspaceForRead,
  inspectWorkspaces,
} from './inspection';

const outage = vi.hoisted(() => ({ on: false }));
vi.mock('../../../version-control/git/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../../version-control/git/client')>();

  return {
    ...original,
    createLocalGitClient: (...args: Parameters<typeof original.createLocalGitClient>) => {
      const client = original.createLocalGitClient(...args);

      return {
        ...client,
        listWorktrees: () =>
          outage.on
            ? Promise.reject(new GitCapabilityError('GIT_UNAVAILABLE', 'Git is unavailable.'))
            : client.listWorktrees(),
      };
    },
  };
});

vi.setConfig({ testTimeout: 90_000 });

const catalogue = await seedCatalogueForTesting();
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })),
  );
});

async function fixture(configYaml: string) {
  const root = await createGitTestProject('workspace-inspection-', configYaml);
  roots.push(root);
  const engine = await bootstrapProjectHome(root);
  const linked = async (branch: string) => {
    const path = await realpath(await mkdtemp(join(tmpdir(), 'workspace-inspection-linked-')));
    roots.push(path);
    git(root, 'worktree', 'add', '-q', '-b', branch, path);
    const registration = await provisionLinkedWorkspaceIdentity(
      engine.context,
      path,
      randomUUID(),
      false,
    );
    await updateWorkspaceRegistry(engine.context, (registry) =>
      addWorkspace(registry, registration),
    );

    return registration;
  };

  return { root, engine, linked };
}

async function persistSpec(root: string, specId: string, title: string): Promise<void> {
  const scaffold = createSpecificationScaffold({
    catalogue,
    archetypeId: 'minimal',
    specId,
    title,
    created: '2026-10-14',
  });
  for (const file of scaffold.files) {
    await mkdir(join(root, file.relativePath, '..'), { recursive: true });
    await writeFile(join(root, file.relativePath), file.content, 'utf8');
  }
}

async function bind(engine: SpecFlowEngine, specId: string, workspaceId: string): Promise<void> {
  await updateWorkspaceRegistry(engine.context, (registry) =>
    bindSpecToWorkspace(registry, specId, workspaceId),
  );
}

describe('workspace inspection', () => {
  it('lists primary, linked and unavailable checkouts with bound Specifications and no Git facts', async () => {
    const { root, engine, linked } = await fixture('runtime: {}\n');
    const live = await linked('spec/live');
    const gone = await linked('spec/gone');
    const specId = randomUUID();
    await persistSpec(live.root, specId, 'Bound to linked');
    await bind(engine, specId, live.workspaceId);
    await rm(gone.root, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });

    const result = await inspectWorkspaces(engine);
    const byId = new Map(result.map((item) => [item.workspaceId, item]));

    expect(result).toHaveLength(3);
    expect(byId.get(engine.workspace.workspaceId)).toMatchObject({
      kind: 'primary',
      root,
      name: basename(root),
      isRuntimeWorkspace: true,
      available: true,
      specifications: [],
    });
    expect(byId.get(live.workspaceId)).toMatchObject({
      kind: 'linked',
      root: live.root,
      isRuntimeWorkspace: false,
      available: true,
      specifications: [{ specId, title: 'Bound to linked' }],
    });
    expect(byId.get(gone.workspaceId)).toMatchObject({
      available: false,
      unavailableReason: 'checkout-unavailable',
    });
    expect(result.every((item) => item.git === undefined)).toBe(true);

    await expect(inspectWorkspaceForRead(engine, live.workspaceId)).resolves.toMatchObject({
      status: 'available',
      root: live.root,
    });
    await expect(inspectWorkspaceForRead(engine, gone.workspaceId)).resolves.toMatchObject({
      status: 'unavailable',
    });
    await expect(inspectWorkspaceForRead(engine, 'unknown-workspace')).resolves.toEqual({
      status: 'not-registered',
    });
  });

  it('adds branch and dirty facts only when Git is enabled', async () => {
    const { engine, linked } = await fixture('runtime: {}\ngit:\n  enabled: true\n');
    const live = await linked('spec/facts');
    await writeFile(join(live.root, 'scratch.txt'), 'dirty\n');

    const result = await inspectWorkspaces(engine);
    const byId = new Map(result.map((item) => [item.workspaceId, item]));

    expect(byId.get(live.workspaceId)?.git).toEqual({
      branch: 'spec/facts',
      detached: false,
      dirty: true,
    });
    expect(byId.get(engine.workspace.workspaceId)?.git).toMatchObject({
      detached: false,
      dirty: false,
    });
  });

  it('reports a moved or substituted checkout as unavailable, and a Git outage as not reachable', async () => {
    const { engine, linked } = await fixture('runtime: {}\ngit:\n  enabled: true\n');
    const live = await linked('spec/mismatch');
    await writeFile(join(live.root, WORKSPACE_IDENTITY_RELATIVE_PATH), '{}');

    const result = await inspectWorkspaces(engine);
    expect(result.find((item) => item.workspaceId === live.workspaceId)).toMatchObject({
      available: false,
      unavailableReason: 'checkout-mismatch',
    });
    await expect(inspectWorkspaceForRead(engine, live.workspaceId)).resolves.toMatchObject({
      status: 'unavailable',
    });

    outage.on = true;
    try {
      const registry = await engine.readRegistry();
      const down = await inspectRegistryWorkspaces(engine, registry, true);
      expect(down.gitReachable).toBe(false);
      expect(
        down.workspaces.find((item) => item.workspaceId === engine.workspace.workspaceId),
      ).toMatchObject({ available: false, unavailableReason: 'git-unavailable' });
    } finally {
      outage.on = false;
    }
  });
});

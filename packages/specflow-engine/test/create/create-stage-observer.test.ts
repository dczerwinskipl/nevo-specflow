import { randomUUID } from 'node:crypto';
import { rm } from 'node:fs/promises';

import { afterEach, describe, expect, it } from 'vitest';

import {
  bootstrapProjectHome,
  createSpecificationForTesting as createSpecification,
  inspectCreateSpecification,
  type CreateStageObservation,
} from '../../src/testing';
import { createGitTestProject, git } from '../support/git-project';

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots
      .splice(0)
      .map((path) => rm(path, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 })),
  );
});

async function project(gitEnabled: boolean) {
  const root = await createGitTestProject(
    'specflow-create-observer ',
    'runtime: {}\ngit:\n  enabled: ' + String(gitEnabled) + '\n',
  );
  roots.push(root);
  return bootstrapProjectHome(root);
}

describe('create stage observer', () => {
  it('reports every durable stage of an existing-target create in order, and nothing else', async () => {
    const engine = await project(false);
    const seen: CreateStageObservation[] = [];
    await createSpecification(
      engine,
      {
        operationId: randomUUID(),
        title: 'Observed create',
        created: '2026-10-14',
        archetype: { id: 'minimal', version: 1 },
        target: { kind: 'existing', workspaceId: engine.workspace.workspaceId },
      },
      { onStage: (observation) => seen.push(observation) },
    );
    expect(seen.map((item) => item.stage)).toEqual([
      'reserved',
      'git-provisioned',
      'manifest-writing',
      'manifest-written',
      'registry-writing',
      'registry-linked',
      'completed',
    ]);
    expect(new Set(seen.map((item) => item.target))).toEqual(new Set(['existing']));
    expect(Object.keys(seen[0]!).sort()).toEqual(['stage', 'target']);
  }, 90000);

  it('reports the Git stages of a new worktree and survives a throwing observer', async () => {
    const engine = await project(true);
    const seen: CreateStageObservation[] = [];
    const created = await createSpecification(
      engine,
      {
        operationId: randomUUID(),
        title: 'Observed linked create',
        created: '2026-10-14',
        archetype: { id: 'minimal', version: 1 },
        target: { kind: 'new-worktree', baseRef: 'HEAD' },
      },
      {
        onStage: (observation) => {
          seen.push(observation);
          throw new Error('observer failure must not break the create');
        },
      },
    );
    expect(created.specId).toBeDefined();
    expect(seen.map((item) => item.stage)).toContain('git-initiated');
    expect(seen.at(-1)).toEqual({ stage: 'completed', target: 'new-worktree' });
  }, 120000);

  it('marks the reservation observation of a retry as replayed', async () => {
    const engine = await project(false);
    const input = {
      operationId: randomUUID(),
      title: 'Replayed create',
      created: '2026-10-14',
      archetype: { id: 'minimal', version: 1 },
      target: { kind: 'existing' as const, workspaceId: engine.workspace.workspaceId },
    };
    await createSpecification(engine, input);
    const seen: CreateStageObservation[] = [];
    await createSpecification(engine, input, { onStage: (observation) => seen.push(observation) });
    expect(seen).toEqual([{ stage: 'completed', target: 'existing', replayed: true }]);
  }, 90000);
});

describe('create stage observer: replay of a reserved operation', () => {
  it('rejects a retry whose reserved plan is no longer valid instead of announcing it', async () => {
    const engine = await project(true);
    const input = {
      operationId: randomUUID(),
      title: 'Replay behind a rejection',
      created: '2026-10-14',
      archetype: { id: 'minimal', version: 1 },
      target: { kind: 'new-worktree' as const, baseRef: 'HEAD' },
    };
    await expect(
      createSpecification(engine, input, {
        afterEffect: (effect) =>
          effect === 'reservation'
            ? Promise.reject(new Error('Stop after reservation'))
            : Promise.resolve(),
      }),
    ).rejects.toThrow('Stop after reservation');
    const journal = await inspectCreateSpecification(engine, input.operationId);
    if (journal?.target.kind !== 'new-worktree') throw new Error('Expected a linked reservation.');
    git(engine.context.project.homeRoot, 'branch', journal.target.branch);

    const seen: CreateStageObservation[] = [];
    await expect(
      createSpecification(engine, input, { onStage: (observation) => seen.push(observation) }),
    ).rejects.toBeDefined();
    expect(seen).toEqual([]);
  }, 120000);
});

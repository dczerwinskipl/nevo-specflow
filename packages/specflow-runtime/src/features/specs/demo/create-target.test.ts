import { describe, expect, it } from 'vitest';
import type { DemoCreateRequest } from '@nevo/specflow-contracts/demo';
import { createDemoEnvironment } from '../../../demo';
import { DemoTargetError } from './create-target';
import { demoWorkspaceIds as ids } from './seed';

const op = (n: number) => `7f3a91c2-4b6e-4d1a-9c0e-${String(n).padStart(12, '0')}`;
function setup() {
  let sequence = 0;
  const env = createDemoEnvironment({
    id: () => String(++sequence),
    uuid: () => `9a000000-0000-4000-8000-${String(++sequence).padStart(12, '0')}`,
  });
  const body = (n: number, extra: Partial<DemoCreateRequest> = {}): DemoCreateRequest => ({
    operationId: op(n),
    title: 'Nowa obsługa płatności',
    catalogueRevision: env.state.catalogue.revision,
    archetypeId: 'minimal',
    archetypeVersion: 1,
    optionalDocumentIds: [],
    ...extra,
  });
  const count = (workspaceId: string) =>
    env.specs.createOptions().workspaces.find((w) => w.workspaceId === workspaceId)?.specCount;

  return { env, body, count };
}

const failure = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    if (error instanceof DemoTargetError) {
      return [error.status, error.code];
    }

    throw error;
  }
};

describe('target-aware demo create', () => {
  it('pins the target only for an explicit integrationTargetWorkspaceId, never to itself', () => {
    const { env, body } = setup();
    const pinnedResult = env.specs.create(
      'alice',
      body(1, {
        target: {
          kind: 'new-worktree',
          branch: 'feature/pinned',
          integrationTargetWorkspaceId: ids.platform,
        },
      }),
    );
    const plainResult = env.specs.create(
      'alice',
      body(2, { target: { kind: 'new-worktree', branch: 'feature/plain' } }),
    );
    const workspaces = env.specs.createOptions().workspaces;
    const pinned = workspaces.find((w) => w.workspaceId === pinnedResult.workspaceId);
    expect(pinned?.integrationDestination).toEqual({
      workspaceId: ids.platform,
      branch: 'feature/platform',
    });
    // No selector = follow the project target: no pin at all.
    const plain = workspaces.find((w) => w.workspaceId === plainResult.workspaceId);
    expect(plain).toBeDefined();
    expect(plain?.integrationDestination).toBeUndefined();
  });
  it('main (no target) increments the primary workspace and returns the real create shape', () => {
    const { env, body, count } = setup();
    const result = env.specs.create('alice', body(1));
    expect(result).toMatchObject({
      operationId: op(1),
      kind: 'specification-create',
      status: 'completed',
      slug: 'nowa-obsluga-platnosci',
      workspaceId: ids.main,
      relativeManifestPath: 'specs/nowa-obsluga-platnosci/manifest.json',
    });
    expect(count(ids.main)).toBe(1);
    expect(env.state.specifications.get(result.specId)).toMatchObject({
      workspaceId: ids.main,
      branch: 'develop',
    });
  });
  it('existing increments only the chosen workspace', () => {
    const { env, body, count } = setup();
    const result = env.specs.create(
      'alice',
      body(1, { target: { kind: 'existing', workspaceId: ids.platform } }),
    );
    expect(result.workspaceId).toBe(ids.platform);
    expect([count(ids.platform), count(ids.main), count(ids.architecture)]).toEqual([3, 0, 3]);
  });
  it('new-worktree registers a linked workspace and its branch for later options', () => {
    const { env, body, count } = setup();
    const result = env.specs.create(
      'alice',
      body(1, {
        target: {
          kind: 'new-worktree',
          baseRef: 'feature/platform',
          branch: 'feature/payments-v2',
          integrationTargetWorkspaceId: ids.platform,
        },
      }),
    );
    expect(count(result.workspaceId)).toBe(1);
    const after = env.specs.createOptions();
    expect(after.workspaces.at(-1)).toMatchObject({
      workspaceId: result.workspaceId,
      kind: 'linked',
      branch: 'feature/payments-v2',
      state: 'available',
      selectable: true,
    });
    expect(after.baseRefs.at(-1)).toEqual({
      ref: 'feature/payments-v2',
      checkedOutWorkspaceId: result.workspaceId,
    });
    expect(env.state.specifications.get(result.specId)).toMatchObject({
      integrationTargetWorkspaceId: ids.platform,
    });
    expect(env.state.locations.get(result.specId)).toMatchObject({
      kind: 'simulated-worktree',
      branch: 'feature/payments-v2',
    });
    // the explicit branch is now taken
    expect(
      failure(() =>
        env.specs.create(
          'alice',
          body(2, { target: { kind: 'new-worktree', branch: 'feature/payments-v2' } }),
        ),
      ),
    ).toEqual([409, 'BRANCH_ALREADY_EXISTS']);
  });
  it('generates a unique branch from the pattern', () => {
    const { env, body } = setup();
    const a = env.specs.create('alice', body(1, { target: { kind: 'new-worktree' } }));
    const b = env.specs.create('alice', body(2, { target: { kind: 'new-worktree' } }));
    expect(a.slug).toBe('nowa-obsluga-platnosci');
    expect(b.slug).toBe('nowa-obsluga-platnosci-2');
    expect(env.state.specifications.get(a.specId)?.branch).toBe('feature/nowa-obsluga-platnosci');
    expect(env.state.specifications.get(b.specId)?.branch).toBe('feature/nowa-obsluga-platnosci-2');
  });
  it('is idempotent per operationId and rejects a changed body', () => {
    const { env, body, count } = setup();
    const first = env.specs.create('alice', body(1));
    expect(env.specs.create('alice', body(1))).toEqual(first);
    expect(count(ids.main)).toBe(1);
    expect(env.state.specifications.size).toBe(1);
    expect(failure(() => env.specs.create('alice', body(1, { title: 'Inny' })))).toEqual([
      409,
      'CREATE_CONFLICT',
    ]);
    expect(env.specs.operationStatus('alice', op(1))).toMatchObject({
      status: 'completed',
      result: first,
    });
    expect(env.specs.operationStatus('alice', op(9))).toEqual({
      operationId: op(9),
      status: 'not-started',
    });
  });
  it('rejects failed validation without any state change', () => {
    const { env, body, count } = setup();
    for (const target of [
      { kind: 'existing' as const, workspaceId: ids.spike },
      { kind: 'new-worktree' as const, baseRef: 'nope' },
      { kind: 'new-worktree' as const, integrationTargetWorkspaceId: ids.payments },
      { kind: 'new-worktree' as const, branch: 'main' },
    ]) {
      expect(failure(() => env.specs.create('alice', body(1, { target })))).toBeDefined();
    }

    expect(env.state.specifications.size).toBe(0);
    expect(count(ids.main)).toBe(0);
    expect(env.specs.createOptions().workspaces).toHaveLength(6);
  });
  it('honours scenarios for options and forced failures', () => {
    const { env, body } = setup();
    expect(env.specs.createOptions(['git-disabled']).newWorktree.status).toBe('disabled');
    expect(
      failure(() =>
        env.specs.create('alice', body(1, { target: { kind: 'new-worktree' } }), ['git-disabled']),
      ),
    ).toEqual([409, 'DEMO_WORKSPACE_UNAVAILABLE']);
    expect(failure(() => env.specs.create('alice', body(2), ['forbidden']))).toEqual([
      403,
      'forbidden',
    ]);
    expect(failure(() => env.specs.create('alice', body(3), ['stale-workspace']))).toEqual([
      409,
      'DEMO_WORKSPACE_UNAVAILABLE',
    ]);
    expect(env.state.specifications.size).toBe(0);
  });
  it('recovery-required holds the operation until resolved', () => {
    const { env, body, count } = setup();
    const input = body(1, { target: { kind: 'new-worktree', branch: 'feature/rec' } });
    expect(failure(() => env.specs.create('alice', input, ['recovery-required']))).toEqual([
      503,
      'CREATE_RECOVERY_REQUIRED',
    ]);
    expect(env.state.specifications.size).toBe(0);
    expect(failure(() => env.specs.create('alice', input))).toEqual([
      503,
      'CREATE_RECOVERY_REQUIRED',
    ]);
    expect(env.specs.operationStatus('alice', op(1))).toMatchObject({
      status: 'recovery-required',
      step: 'workspace-prepared',
      branch: 'feature/rec',
    });
    const done = env.specs.operationStatus('alice', op(1), ['recovery-resolved']);
    expect(done.status).toBe('completed');
    expect(done.result?.workspaceId).toBe(done.workspaceId);
    expect(env.specs.create('alice', input)).toEqual(done.result);
    expect(count(done.workspaceId!)).toBe(1);
    expect(env.state.specifications.size).toBe(1);
  });
  it('network-uncertain commits and replays to the same result', () => {
    const { env, body } = setup();
    const outcome = env.specs.createWithOutcome('alice', body(1), ['network-uncertain']);
    expect(outcome.fresh).toBe(true);
    expect(env.specs.createWithOutcome('alice', body(1)).result).toEqual(outcome.result);
    expect(env.specs.createWithOutcome('alice', body(1)).fresh).toBe(false);
  });
});

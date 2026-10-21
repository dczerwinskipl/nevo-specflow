import { describe, expect, it } from 'vitest';
import {
  applyOptionsScenario,
  demoOptionsScenarios,
  demoWorkspaceIds as ids,
  DemoTargetError,
  isValidBranchName,
  parseScenarios,
  resolveTarget,
  seedCreateOptions,
  slugify,
} from './create-options';

const options = seedCreateOptions;
const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    if (error instanceof DemoTargetError) return [error.status, error.code];
    throw error;
  }
  return undefined;
};

describe('seed registry', () => {
  it('matches the documented happy-path table', () => {
    const seed = options();
    expect(seed.primaryWorkspaceId).toBe(ids.main);
    expect(
      seed.workspaces.map((w) => [w.branch, w.kind, w.specCount, w.state, w.selectable]),
    ).toEqual([
      ['develop', 'primary', 0, 'available', true],
      ['feature/platform', 'linked', 2, 'available', true],
      ['feature/payments', 'linked', 1, 'dirty', true],
      ['spec/architecture', 'linked', 3, 'available', true],
      [undefined, 'linked', 0, 'detached', false],
      [undefined, 'linked', 1, 'unavailable', false],
    ]);
    expect(seed.newWorktree).toEqual({ status: 'available' });
    expect(seed.defaultBaseRef).toBe('develop');
    expect(seed.integrationTargetBranch).toBe('develop');
    expect(seed.baseRefs).toHaveLength(7);
  });
  it('mirrors the Engine integration invariants (pin only on linked, never self, derived selectability)', () => {
    const seed = options();
    for (const name of [undefined, ...demoOptionsScenarios]) {
      const value = name ? applyOptionsScenario(seed, name) : seed;
      for (const w of value.workspaces) {
        if (w.integrationDestination) {
          expect(w.kind).toBe('linked');
          expect(w.integrationDestination.workspaceId).not.toBe(w.workspaceId);
        }
        if (w.integrationSelectable)
          expect(w.state === 'available' && (w.kind === 'primary' || w.managed)).toBe(true);
      }
    }
    // The only seeded pin: feature/payments is pinned to the primary workspace (develop).
    expect(
      seed.workspaces
        .filter((w) => w.integrationDestination)
        .map((w) => [w.branch, w.integrationDestination]),
    ).toEqual([['feature/payments', { workspaceId: ids.main, branch: 'develop' }]]);
    expect(seed.workspaces.find((w) => w.kind === 'primary')?.managed).toBe(false);
  });
  it('managed-false makes an unmanaged linked workspace unselectable as a target', () => {
    const value = applyOptionsScenario(options(), 'managed-false');
    expect(value.workspaces.find((w) => w.workspaceId === ids.architecture)).toMatchObject({
      managed: false,
      selectable: true,
      integrationSelectable: false,
    });
  });
  it('primary-other-branch leaves the project target branch on a linked workspace only', () => {
    const value = applyOptionsScenario(options(), 'primary-other-branch');
    const primary = value.workspaces.find((w) => w.kind === 'primary');
    expect(primary?.branch).not.toBe(value.integrationTargetBranch);
    expect(
      value.workspaces.some(
        (w) => w.branch === value.integrationTargetBranch && w.kind === 'linked',
      ),
    ).toBe(true);
  });
  it('pin-drift points a pin at a branch the pinned workspace no longer has', () => {
    const value = applyOptionsScenario(options(), 'pin-drift');
    const pinned = value.workspaces.find((w) => w.integrationDestination);
    const target = value.workspaces.find(
      (w) => w.workspaceId === pinned?.integrationDestination?.workspaceId,
    );
    expect(target?.branch).not.toBe(pinned?.integrationDestination?.branch);
  });
});

describe('options scenarios', () => {
  const apply = (name: (typeof demoOptionsScenarios)[number]) =>
    applyOptionsScenario(options(), name);
  it('never mutates the input and keeps default identical to the seed', () => {
    const seed = options();
    for (const name of demoOptionsScenarios) applyOptionsScenario(seed, name);
    expect(seed).toEqual(options());
    expect(apply('default')).toEqual(options());
  });
  it('shapes git, integration and selectability variants', () => {
    expect(apply('git-disabled')).toMatchObject({
      newWorktree: { status: 'disabled', reason: 'git-disabled' },
      baseRefs: [],
      defaultBaseRef: 'HEAD',
    });
    expect(apply('git-disabled').workspaces).toHaveLength(1);
    expect(apply('git-disabled').integrationTargetBranch).toBeUndefined();
    expect(apply('git-unavailable').newWorktree.reason).toBe('git-unavailable');
    expect(apply('membership-mismatch').newWorktree.reason).toBe('git-membership-mismatch');
    expect(apply('no-integration-target').integrationTargetBranch).toBeUndefined();
    expect(apply('no-linked').workspaces).toHaveLength(1);
    const none = apply('linked-none-selectable').workspaces;
    expect(none.filter((w) => w.kind === 'linked').every((w) => !w.selectable)).toBe(true);
    expect(none[0]?.selectable).toBe(true);
    expect(apply('none-available').workspaces.every((w) => !w.selectable)).toBe(true);
    expect(apply('primary-dirty').workspaces[0]).toMatchObject({
      state: 'dirty',
      selectable: true,
      integrationSelectable: false,
      reason: 'dirty',
    });
    expect(apply('platform-dirty').workspaces[1]).toMatchObject({ state: 'dirty' });
    expect(apply('primary-detached').workspaces[0]).toMatchObject({
      selectable: false,
      reason: 'detached',
    });
    expect(apply('primary-detached').workspaces[0]?.branch).toBeUndefined();
    expect(apply('head-base').defaultBaseRef).toBe('HEAD');
    expect(apply('head-base-no-branch').workspaces[0]?.branch).toBeUndefined();
    expect(apply('many-workspaces').workspaces).toHaveLength(14);
    expect(apply('managed-false').workspaces[3]?.managed).toBe(false);
    expect(apply('long-names').workspaces[1]?.branch?.length).toBeGreaterThan(60);
  });
});

describe('parseScenarios', () => {
  it('parses comma lists, accepts empty and rejects unknown names', () => {
    expect(parseScenarios(undefined)).toEqual([]);
    expect(parseScenarios('git-disabled, branch-taken')).toEqual(['git-disabled', 'branch-taken']);
    expect(parseScenarios('nope')).toBeUndefined();
  });
});

describe('branch names and slugs', () => {
  it.each(['feature/x', 'spec/a-b_c', 'release/1.4'])('accepts %s', (name) =>
    expect(isValidBranchName(name)).toBe(true),
  );
  it.each(['', ' a', 'a b', 'a..b', 'a@{b', 'x.lock', '/a', 'a/', 'a.', '-a', 'a//b', 'a~b', '@'])(
    'rejects %j',
    (name) => expect(isValidBranchName(name)).toBe(false),
  );
  it('slugifies titles with Polish diacritics', () => {
    expect(slugify('  Nowa obsługa płatności! ')).toBe('nowa-obsluga-platnosci');
    expect(slugify('???')).toBe('specification');
  });
});

describe('resolveTarget', () => {
  it('maps no target to the primary workspace', () => {
    expect(resolveTarget(options(), undefined, 's')).toMatchObject({
      kind: 'main',
      workspaceId: ids.main,
    });
    expect(
      code(() =>
        resolveTarget(applyOptionsScenario(options(), 'primary-detached'), undefined, 's'),
      ),
    ).toEqual([409, 'DEMO_WORKSPACE_UNAVAILABLE']);
  });
  it('requires an existing workspace to be selectable', () => {
    const target = (workspaceId: string) => ({ kind: 'existing' as const, workspaceId });
    expect(resolveTarget(options(), target(ids.platform), 's').workspaceId).toBe(ids.platform);
    expect(resolveTarget(options(), target(ids.payments), 's').workspaceId).toBe(ids.payments);
    for (const id of [ids.spike, ids.legacy, '0b8f1c1e-0a11-4c6e-9a01-0000000000ff'])
      expect(code(() => resolveTarget(options(), target(id), 's'))).toEqual([
        409,
        'DEMO_WORKSPACE_UNAVAILABLE',
      ]);
  });
  it('generates, validates and de-duplicates new worktree branches', () => {
    const fresh = { kind: 'new-worktree' as const };
    expect(resolveTarget(options(), fresh, 'plat')).toMatchObject({
      kind: 'new-worktree',
      branch: 'feature/plat',
      baseRef: 'develop',
    });
    expect(resolveTarget(options(), fresh, 'platform').branch).toBe('feature/platform-2');
    expect(resolveTarget(options(), { ...fresh, branch: ' feature/a ' }, 's').branch).toBe(
      'feature/a',
    );
    expect(
      code(() => resolveTarget(options(), { ...fresh, branch: 'feature/platform' }, 's')),
    ).toEqual([409, 'BRANCH_ALREADY_EXISTS']);
    expect(code(() => resolveTarget(options(), { ...fresh, branch: 'release/1.4' }, 's'))).toEqual([
      409,
      'BRANCH_ALREADY_EXISTS',
    ]);
    expect(code(() => resolveTarget(options(), { ...fresh, branch: 'a..b' }, 's'))).toEqual([
      400,
      'CREATE_OPERATION_INVALID',
    ]);
  });
  it('validates baseRef and integration target', () => {
    const fresh = { kind: 'new-worktree' as const };
    expect(resolveTarget(options(), { ...fresh, baseRef: 'release/1.4' }, 's').baseRef).toBe(
      'release/1.4',
    );
    expect(code(() => resolveTarget(options(), { ...fresh, baseRef: 'nope' }, 's'))).toEqual([
      422,
      'BASE_REF_NOT_FOUND',
    ]);
    expect(
      resolveTarget(options(), { ...fresh, integrationTargetWorkspaceId: ids.platform }, 's')
        .integrationTargetWorkspaceId,
    ).toBe(ids.platform);
    for (const id of [ids.payments, ids.spike, '0b8f1c1e-0a11-4c6e-9a01-0000000000ff'])
      expect(
        code(() => resolveTarget(options(), { ...fresh, integrationTargetWorkspaceId: id }, 's')),
      ).toEqual([400, 'CREATE_OPERATION_INVALID']);
  });
  it('rejects new worktrees when git is disabled or unavailable', () => {
    for (const name of ['git-disabled', 'git-unavailable', 'membership-mismatch'] as const)
      expect(
        code(() =>
          resolveTarget(applyOptionsScenario(options(), name), { kind: 'new-worktree' }, 's'),
        ),
      ).toEqual([409, 'DEMO_WORKSPACE_UNAVAILABLE']);
  });
});

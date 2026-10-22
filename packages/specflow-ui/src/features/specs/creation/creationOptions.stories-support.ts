import type { DemoCreateOptions, DemoCreatedSpec } from '@nevo/specflow-contracts/demo';

/**
 * Deterministic `create-options` fixtures for stories and unit tests. They mirror the shapes of
 * the demo contract (PR #53 mirror); the live demo Runtime serves the same seed, but stories never
 * reach the network: they provide these through the `demoCreationApi.createOptions` seam.
 */
type Workspace = DemoCreateOptions['workspaces'][number];
const uuid = (n: number) => `0b8f1c1e-0a11-4c6e-9a01-${String(n).padStart(12, '0')}`;
export const workspaceIds = {
  main: uuid(1),
  platform: uuid(2),
  payments: uuid(3),
  architecture: uuid(4),
  spike: uuid(5),
  legacy: uuid(6),
} as const;
const destination = (workspaceId: string, branch: string) => ({ workspaceId, branch });

export type OptionsVariant =
  | 'default'
  | 'git-disabled'
  | 'git-unavailable'
  | 'membership-mismatch'
  | 'no-linked'
  | 'linked-none-selectable'
  | 'none-available'
  | 'no-integration-target'
  | 'target-dirty'
  | 'platform-dirty'
  | 'primary-dirty'
  | 'primary-other-branch'
  | 'pin-drift'
  | 'primary-detached'
  | 'head-base'
  | 'head-base-no-branch'
  | 'many-workspaces'
  | 'managed-false'
  | 'long-names'
  | 'no-selectable-targets'
  /** Git enabled: the Engine commits the scaffold; `main` is protected, nothing else is. */
  | 'commits'
  /** Git enabled, the primary checkout is on the protected `main`. */
  | 'protected-primary'
  /** Git enabled, the primary checkout is on a branch outside `allowedBranches`. */
  | 'not-allowed-primary'
  /** Git enabled, every linked workspace is on a protected branch. */
  | 'protected-all-linked'
  /** Git enabled, the generated branch (`release/<slug>`) is protected. */
  | 'new-branch-protected'
  /** Git enabled, but the project's Git configuration is invalid. */
  | 'git-policy-invalid';

export function seedOptions(): DemoCreateOptions {
  const ids = workspaceIds;
  return {
    primaryWorkspaceId: ids.main,
    workspaces: [
      {
        workspaceId: ids.main,
        kind: 'primary',
        name: 'acme-app',
        path: '/work/acme-app',
        managed: false,
        specCount: 0,
        state: 'available',
        selectable: true,
        integrationSelectable: true,
        branch: 'develop',
      },
      {
        workspaceId: ids.platform,
        kind: 'linked',
        name: 'platform',
        path: '/work/acme-app-worktrees/platform',
        managed: true,
        specCount: 2,
        state: 'available',
        selectable: true,
        integrationSelectable: true,
        branch: 'feature/platform',
      },
      {
        workspaceId: ids.payments,
        kind: 'linked',
        name: 'payments',
        path: '/work/acme-app-worktrees/payments',
        managed: true,
        specCount: 1,
        state: 'dirty',
        selectable: true,
        integrationSelectable: false,
        // Pinned at creation to the primary workspace (develop).
        integrationDestination: destination(ids.main, 'develop'),
        branch: 'feature/payments',
        reason: 'dirty',
      },
      {
        workspaceId: ids.architecture,
        kind: 'linked',
        name: 'architecture',
        path: '/work/acme-app-worktrees/architecture',
        managed: true,
        specCount: 3,
        state: 'available',
        selectable: true,
        integrationSelectable: true,
        branch: 'spec/architecture',
      },
      {
        workspaceId: ids.spike,
        kind: 'linked',
        name: 'spike',
        path: '/work/acme-app-worktrees/spike',
        managed: true,
        specCount: 0,
        state: 'detached',
        selectable: false,
        integrationSelectable: false,
        reason: 'detached',
      },
      {
        workspaceId: ids.legacy,
        kind: 'linked',
        name: 'legacy',
        path: '/work/acme-app-worktrees/legacy',
        managed: true,
        specCount: 1,
        state: 'unavailable',
        selectable: false,
        integrationSelectable: false,
        reason: 'checkout-unavailable',
      },
    ],
    newWorktree: { status: 'available' },
    defaultBaseRef: 'develop',
    branchPattern: 'feature/{slug}',
    worktreesRoot: { path: '/work/acme-app-worktrees', exists: true },
    integrationTargetBranch: 'develop',
    baseRefs: [
      { ref: 'develop', checkedOutWorkspaceId: ids.main },
      { ref: 'feature/platform', checkedOutWorkspaceId: ids.platform },
      { ref: 'feature/payments', checkedOutWorkspaceId: ids.payments },
      { ref: 'spec/architecture', checkedOutWorkspaceId: ids.architecture },
      { ref: 'release/1.4' },
      { ref: 'main' },
      { ref: 'feature/legacy' },
    ],
  };
}

const strip = (workspace: Workspace): Workspace => {
  const copy: Record<string, unknown> = { ...workspace };
  for (const key of Object.keys(copy)) if (copy[key] === undefined) delete copy[key];
  return copy as unknown as Workspace;
};
const dirty = (workspace: Workspace): Workspace =>
  strip({
    ...workspace,
    state: 'dirty',
    integrationSelectable: false,
    reason: 'dirty',
  });
const blocked = (workspace: Workspace): Workspace =>
  strip({
    ...workspace,
    selectable: false,
    integrationSelectable: false,
    state: workspace.state === 'dirty' ? 'unavailable' : workspace.state,
    reason: 'checkout-unavailable',
  });

export function createOptionsFixture(variant: OptionsVariant = 'default'): DemoCreateOptions {
  const next = seedOptions();
  const primary = () => next.workspaces.find((w) => w.kind === 'primary')!;
  const mapWorkspaces = (fn: (w: Workspace) => Workspace, only: (w: Workspace) => boolean) => {
    next.workspaces = next.workspaces.map((w) => (only(w) ? fn(w) : w));
  };
  switch (variant) {
    case 'default':
      break;
    case 'commits':
      next.commits = { protectedBranches: ['main'] };
      break;
    case 'protected-primary':
      next.commits = { protectedBranches: ['main'] };
      mapWorkspaces(
        (w) =>
          strip({
            ...w,
            branch: 'main',
            selectable: false,
            integrationSelectable: true,
            reason: 'branch-protected',
          }),
        (w) => w.kind === 'primary',
      );
      next.baseRefs = next.baseRefs.map((b) =>
        b.ref === 'develop'
          ? { ref: b.ref }
          : b.ref === 'main'
            ? { ...b, checkedOutWorkspaceId: workspaceIds.main }
            : b,
      );
      break;
    case 'not-allowed-primary':
      next.commits = { protectedBranches: [], allowedBranches: ['feature/**', 'spec/**'] };
      mapWorkspaces(
        (w) => strip({ ...w, selectable: false, reason: 'branch-not-allowed' }),
        (w) => w.kind === 'primary',
      );
      break;
    case 'protected-all-linked':
      next.commits = { protectedBranches: ['main', 'feature/**', 'spec/**'] };
      mapWorkspaces(
        (w) => ({ ...w, selectable: false, reason: 'branch-protected' }),
        (w) => w.kind === 'linked' && w.branch !== undefined,
      );
      break;
    case 'new-branch-protected':
      next.branchPattern = 'release/{slug}';
      next.commits = { protectedBranches: ['main', 'release/**'] };
      next.newWorktree = { status: 'available', branchProtected: true };
      break;
    case 'git-policy-invalid':
      next.newWorktree = { status: 'unavailable', reason: 'git-policy-invalid' };
      break;
    case 'git-disabled':
      next.newWorktree = { status: 'disabled', reason: 'git-disabled' };
      next.workspaces = [
        strip({
          ...primary(),
          branch: undefined,
          integrationDestination: undefined,
          integrationSelectable: false,
        }),
      ];
      next.baseRefs = [];
      next.defaultBaseRef = 'HEAD';
      delete next.integrationTargetBranch;
      break;
    case 'git-unavailable':
      next.newWorktree = { status: 'unavailable', reason: 'git-unavailable' };
      break;
    case 'membership-mismatch':
      next.newWorktree = { status: 'unavailable', reason: 'git-membership-mismatch' };
      break;
    case 'no-linked':
      next.workspaces = [primary()];
      break;
    case 'linked-none-selectable':
      mapWorkspaces(blocked, (w) => w.kind === 'linked');
      break;
    case 'none-available':
      next.newWorktree = { status: 'unavailable', reason: 'git-unavailable' };
      next.workspaces = next.workspaces.map((w) =>
        w.kind === 'primary' ? strip({ ...blocked(w), state: 'unavailable' }) : blocked(w),
      );
      break;
    case 'no-integration-target':
      delete next.integrationTargetBranch;
      break;
    case 'target-dirty':
    case 'primary-dirty':
      mapWorkspaces(dirty, (w) => w.kind === 'primary');
      break;
    case 'platform-dirty':
      mapWorkspaces(dirty, (w) => w.workspaceId === workspaceIds.platform);
      break;
    case 'primary-other-branch':
      // The project target branch (develop) sits on a LINKED workspace; the primary is elsewhere.
      mapWorkspaces(
        (w) => ({ ...w, branch: 'release/1.4' }),
        (w) => w.kind === 'primary',
      );
      mapWorkspaces(
        (w) => ({ ...w, branch: 'develop' }),
        (w) => w.workspaceId === workspaceIds.platform,
      );
      next.baseRefs = [
        { ref: 'develop', checkedOutWorkspaceId: workspaceIds.platform },
        { ref: 'release/1.4', checkedOutWorkspaceId: workspaceIds.main },
        ...next.baseRefs.filter(
          (b) => !['develop', 'feature/platform', 'release/1.4'].includes(b.ref),
        ),
      ];
      break;
    case 'pin-drift':
      // The pinned target (primary) is now on another branch than the one pinned.
      mapWorkspaces(
        (w) => ({ ...w, integrationDestination: destination(workspaceIds.main, 'release/1.3') }),
        (w) => w.workspaceId === workspaceIds.payments,
      );
      break;
    case 'primary-detached':
      mapWorkspaces(
        (w) =>
          strip({
            ...w,
            branch: undefined,
            state: 'detached',
            selectable: false,
            integrationSelectable: false,
            reason: 'detached',
          }),
        (w) => w.kind === 'primary',
      );
      next.defaultBaseRef = 'HEAD';
      break;
    case 'head-base':
      next.defaultBaseRef = 'HEAD';
      break;
    case 'head-base-no-branch':
      next.defaultBaseRef = 'HEAD';
      mapWorkspaces(
        (w) => strip({ ...w, branch: undefined }),
        (w) => w.kind === 'primary',
      );
      delete next.integrationTargetBranch;
      break;
    case 'many-workspaces':
      for (let index = 0; index < 8; index += 1) {
        const workspaceId = uuid(100 + index);
        const branch = `feature/team-${index + 1}`;
        next.workspaces.push({
          workspaceId,
          kind: 'linked',
          name: `team-${index + 1}`,
          path: `/work/acme-app-worktrees/team-${index + 1}`,
          managed: true,
          specCount: index % 4,
          state: 'available',
          selectable: true,
          integrationSelectable: true,
          branch,
        });
        next.baseRefs.push({ ref: branch, checkedOutWorkspaceId: workspaceId });
      }
      break;
    case 'no-selectable-targets':
      next.workspaces = next.workspaces.map((w) => strip({ ...w, integrationSelectable: false }));
      break;
    case 'managed-false':
      mapWorkspaces(
        (w) => ({ ...w, managed: false, integrationSelectable: false }),
        (w) => w.workspaceId === workspaceIds.architecture,
      );
      break;
    case 'long-names': {
      const long = 'feature/platform/very-long-descriptive-branch-name-for-overflow-checks-0001';
      mapWorkspaces(
        (w) => strip({ ...w, branch: long }),
        (w) => w.workspaceId === workspaceIds.platform,
      );
      next.baseRefs = next.baseRefs.map((b) =>
        b.ref === 'feature/platform' ? { ...b, ref: long } : b,
      );
      break;
    }
  }
  return next;
}

/** A completed create response as the demo Runtime returns it. */
export function createdSpecFixture(
  operationId: string,
  patch: Partial<DemoCreatedSpec> = {},
): DemoCreatedSpec {
  return {
    specId: 'created',
    documentIds: ['specification'],
    operationId,
    kind: 'specification-create',
    status: 'completed',
    slug: 'created',
    workspaceId: workspaceIds.main,
    relativeManifestPath: 'specs/created/manifest.json',
    ...patch,
  };
}

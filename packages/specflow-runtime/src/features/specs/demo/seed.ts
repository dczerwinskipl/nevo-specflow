import type { DemoCreateOptions } from '@nevo/specflow-contracts/demo';
import { localBranchRef } from '@nevo/specflow-contracts/specs';

/**
 * Synthetic workspace registry (the default seed) of the demo create options.
 * Pure data and functions only: scenarios live in `scenarios.ts`, target validation in
 * `create-target.ts`, the in-memory state in `creation-state.ts`.
 */
export type DemoWorkspace = DemoCreateOptions['workspaces'][number];

export const uuid = (n: number) => `0b8f1c1e-0a11-4c6e-9a01-${String(n).padStart(12, '0')}`;
export const demoWorkspaceIds = {
  main: uuid(1),
  platform: uuid(2),
  payments: uuid(3),
  architecture: uuid(4),
  spike: uuid(5),
  legacy: uuid(6),
} as const;

/**
 * The workspace each seeded Specification (the current and archived samples) is bound to. The
 * seed's `specCount` values and the seeded Specification reads (`workspaceId`) both derive from it,
 * so the registry and the Specifications agree; a created Specification carries its own.
 */
export const demoSeedSpecWorkspaces: Readonly<Record<string, string>> = {
  admission: demoWorkspaceIds.platform,
  security: demoWorkspaceIds.platform,
  review: demoWorkspaceIds.payments,
  packaging: demoWorkspaceIds.architecture,
  providers: demoWorkspaceIds.architecture,
  localization: demoWorkspaceIds.architecture,
  'archived-shell': demoWorkspaceIds.main,
};

/** The workspace a seeded Specification is bound to (the primary one for any other id). */
export const seededSpecWorkspace = (specId: string): string =>
  demoSeedSpecWorkspaces[specId] ?? demoWorkspaceIds.main;

const seededSpecCount = (workspaceId: string) =>
  Object.values(demoSeedSpecWorkspaces).filter((id) => id === workspaceId).length;

/** Synthetic machine layout: the repository folder and the folder that receives worktrees. */
export const demoRepositoryName = 'acme-app';
export const demoWorktreesRoot = '/work/acme-app-worktrees';
export const linkedPath = (folder: string) => `${demoWorktreesRoot}/${folder}`;

export const destination = (workspaceId: string, branch: string) => ({ workspaceId, branch });

/**
 * Engine rule of `integrationSelectable`: a workspace can be an explicit integration target only
 * when it is clean and on a local branch (`state === 'available'`) and is the primary or a
 * Nevo-managed linked workspace.
 */
export const isIntegrationSelectable = (workspace: DemoWorkspace) =>
  workspace.state === 'available' && (workspace.kind === 'primary' || workspace.managed);

/**
 * Brings a workspace list in line with the Engine invariants: `integrationSelectable` can only be
 * true when {@link isIntegrationSelectable} holds,
 * a pin exists only on linked workspaces and never points at its own workspace.
 */
export function normalize(options: DemoCreateOptions): DemoCreateOptions {
  options.workspaces = options.workspaces.map((workspace) => {
    const next: DemoWorkspace = {
      ...workspace,
      integrationSelectable:
        workspace.integrationSelectable === true && isIntegrationSelectable(workspace),
    };
    const pin = workspace.integrationDestination;
    if (workspace.kind !== 'linked' || pin?.workspaceId === workspace.workspaceId) {
      delete next.integrationDestination;
    }

    return next;
  });

  return options;
}

/** Default seed: the realistic happy path (IMPLEMENTATION-SPEC section 2). */
export function seedCreateOptions(): DemoCreateOptions {
  const ids = demoWorkspaceIds;

  return {
    primaryWorkspaceId: ids.main,
    workspaces: [
      {
        workspaceId: ids.main,
        kind: 'primary',
        name: demoRepositoryName,
        path: '/work/acme-app',
        // The Engine never marks the primary workspace as Nevo-managed and gives it no pin.
        managed: false,
        specCount: seededSpecCount(ids.main),
        state: 'available',
        selectable: true,
        integrationSelectable: true,
        branch: 'develop',
      },
      {
        workspaceId: ids.platform,
        kind: 'linked',
        name: 'platform',
        path: linkedPath('platform'),
        managed: true,
        specCount: seededSpecCount(ids.platform),
        state: 'available',
        selectable: true,
        integrationSelectable: true,
        branch: 'feature/platform',
      },
      {
        workspaceId: ids.payments,
        kind: 'linked',
        name: 'payments',
        path: linkedPath('payments'),
        managed: true,
        specCount: seededSpecCount(ids.payments),
        state: 'dirty',
        selectable: true,
        integrationSelectable: false,
        // Pinned at creation to the primary workspace (develop): the Existing tile shows it.
        integrationDestination: destination(ids.main, 'develop'),
        branch: 'feature/payments',
        reason: 'dirty',
      },
      {
        workspaceId: ids.architecture,
        kind: 'linked',
        name: 'architecture',
        path: linkedPath('architecture'),
        managed: true,
        specCount: seededSpecCount(ids.architecture),
        state: 'available',
        selectable: true,
        integrationSelectable: true,
        branch: 'spec/architecture',
      },
      {
        workspaceId: ids.spike,
        kind: 'linked',
        name: 'spike',
        path: linkedPath('spike'),
        managed: true,
        specCount: seededSpecCount(ids.spike),
        state: 'detached',
        selectable: false,
        integrationSelectable: false,
        reason: 'detached',
      },
      {
        workspaceId: ids.legacy,
        kind: 'linked',
        name: 'legacy',
        path: linkedPath('legacy'),
        managed: true,
        specCount: seededSpecCount(ids.legacy),
        state: 'unavailable',
        selectable: false,
        integrationSelectable: false,
        reason: 'checkout-unavailable',
      },
    ],
    newWorktree: { status: 'available' },
    defaultBaseRef: 'develop',
    branchPattern: 'feature/{slug}',
    worktreesRoot: { path: demoWorktreesRoot, exists: true },
    integrationTargetBranch: 'develop',
    // Git is on, so the Engine commits the scaffold; only `main` is protected in the demo project.
    commits: { protectedBranches: ['main'] },
    baseRefs: [
      // Full refs, like the Engine; workspace branches and the default stay short names.
      { ref: localBranchRef('develop'), checkedOutWorkspaceId: ids.main },
      { ref: localBranchRef('feature/platform'), checkedOutWorkspaceId: ids.platform },
      { ref: localBranchRef('feature/payments'), checkedOutWorkspaceId: ids.payments },
      { ref: localBranchRef('spec/architecture'), checkedOutWorkspaceId: ids.architecture },
      { ref: localBranchRef('release/1.4') },
      { ref: localBranchRef('main') },
      { ref: localBranchRef('feature/legacy') },
    ],
  };
}

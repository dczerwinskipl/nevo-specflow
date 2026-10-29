import type { DemoCreateOptions } from '@nevo/specflow-contracts/demo';

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
        path: linkedPath('platform'),
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
        path: linkedPath('payments'),
        managed: true,
        specCount: 1,
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
        path: linkedPath('spike'),
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
        path: linkedPath('legacy'),
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
    worktreesRoot: { path: demoWorktreesRoot, exists: true },
    integrationTargetBranch: 'develop',
    // Git is on, so the Engine commits the scaffold; only `main` is protected in the demo project.
    commits: { protectedBranches: ['main'] },
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

import type { WorkspaceList, WorkspaceListItem } from '@nevo/specflow-contracts/workspaces';

/*
 * The workspaces of the dogfooding project the owner reviewed (2026-11-14), plus the stress cases
 * of the review: a 98-character worktree name and an unavailable worktree.
 */

const root = 'C:\\Users\\domin\\nevo-verify\\dogfood';

export const repoWorkspace: WorkspaceListItem = {
  workspaceId: '3e1203d1-8939-4039-9dc6-6c8c0016576c',
  kind: 'primary',
  name: 'repo',
  path: `${root}\\repo`,
  available: true,
  isRuntimeWorkspace: true,
  specifications: [],
  dirty: true,
};

export const worktreeWorkspace: WorkspaceListItem = {
  workspaceId: 'f83eb625-434a-43d5-815d-d6f639bd23ae',
  kind: 'linked',
  name: 'test-dogfooding-docs',
  path: `${root}\\repo-worktrees\\test-dogfooding-docs`,
  available: true,
  isRuntimeWorkspace: false,
  specifications: [
    { specId: 'f27be260-4d82-4e23-a302-dbabfd1390bb', title: 'Test dogfooding docs' },
  ],
  dirty: false,
};

const longName =
  'feature-workspace-aware-documentation-reader-search-results-refinement-after-owner-review-mobile';

export const longWorktreeWorkspace: WorkspaceListItem = {
  workspaceId: '7a0d2c55-1d1e-4c39-9a51-2f1f0e8f4b11',
  kind: 'linked',
  name: longName,
  path: `${root}\\repo-worktrees\\${longName}`,
  available: true,
  isRuntimeWorkspace: false,
  specifications: [
    {
      specId: '0b6f8f0e-4b8e-4f3e-a3a8-6d1f3c3b9e20',
      title: 'Workspace-aware documentation reader with search refinement for mobile review',
    },
  ],
  dirty: true,
};

export const unavailableWorkspace: WorkspaceListItem = {
  workspaceId: 'c2b1f4a8-5e0f-4a55-9b3c-8f0d7e6a1c42',
  kind: 'linked',
  name: 'spike-provider-limits',
  path: `${root}\\repo-worktrees\\spike-provider-limits`,
  available: false,
  unavailableReason: 'checkout-unavailable',
  isRuntimeWorkspace: false,
  specifications: [],
  dirty: false,
};

export const workspaceList = (
  extra: readonly WorkspaceListItem[] = [],
  repo: WorkspaceListItem = repoWorkspace,
): WorkspaceList => ({
  projectFolderId: repoWorkspace.workspaceId,
  workspaces: [repo, worktreeWorkspace, ...extra],
});

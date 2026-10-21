import { resolve } from 'node:path';

import type { SpecFlowEngine } from '../application';
import { GitCapabilityError } from '../git/errors';
import { executeGit } from '../git/process';
import { WorkspaceRegistryError, inspectRegisteredWorkspace } from '../project/workspace-registry';
import { createLocalGitClient } from '../version-control/git/client';
import { validateBaseRef } from '../version-control/git/refs';
import { readProjectGitPolicy } from '../version-control/worktrees/config';
import { discoverSpecifications } from './discovery';

export type CreateWorkspaceState = 'available' | 'unavailable' | 'detached' | 'dirty';
export type CreateOptionsReason =
  | 'git-disabled'
  | 'git-unavailable'
  | 'checkout-unavailable'
  | 'git-membership-mismatch'
  | 'detached'
  | 'dirty';

export interface CreateWorkspaceOption {
  readonly workspaceId: string;
  readonly kind: 'primary' | 'linked';
  readonly managed: boolean;
  readonly specCount: number;
  readonly state: CreateWorkspaceState;
  readonly selectable: boolean;
  /** Integration requires a clean, attached, registered physical checkout. */
  readonly integrationSelectable?: boolean;
  readonly integrationDestination?: { readonly workspaceId: string; readonly branch: string };
  readonly branch?: string;
  readonly reason?: CreateOptionsReason;
}

export interface CreateBaseRefOption {
  readonly ref: string;
  readonly checkedOutWorkspaceId?: string;
}

export interface PublicCreateOptions {
  readonly primaryWorkspaceId: string;
  readonly workspaces: readonly CreateWorkspaceOption[];
  readonly newWorktree: {
    readonly status: 'available' | 'disabled' | 'unavailable';
    readonly reason?: CreateOptionsReason;
  };
  readonly defaultBaseRef: string;
  readonly branchPattern: string;
  readonly integrationTargetBranch?: string;
  readonly baseRefs: readonly CreateBaseRefOption[];
}

/**
 * Authorized caller-facing read model. This is NOT an admission reservation.
 * Create rechecks policy, registry, physical identity and Git state when used.
 */
export async function inspectCreateOptions(engine: SpecFlowEngine): Promise<PublicCreateOptions> {
  const registry = await engine.readRegistry();
  const policy = (await readProjectGitPolicy(engine.context)).policy;
  const git = createLocalGitClient(engine.context.project.homeRoot);

  let available = true;
  try {
    const commonDir = await git.inspectRepository();
    if (!samePath(commonDir, engine.context.project.gitCommonDir)) {
      throw new WorkspaceRegistryError(
        'REGISTRY_WORKSPACE_MISMATCH',
        'Project Home Git identity changed during create-options inspection.',
      );
    }
  } catch (error) {
    if (
      error instanceof GitCapabilityError &&
      (error.code === 'GIT_UNAVAILABLE' || error.code === 'NOT_GIT_REPOSITORY')
    ) {
      available = false;
    } else {
      throw error;
    }
  }

  const worktrees = available ? await git.listWorktrees() : [];
  const branches = available ? await git.listLocalRefs() : [];
  const discovered = await discoverSpecifications(engine);
  const counts = new Map<string, number>();
  for (const spec of discovered)
    counts.set(spec.workspaceId, (counts.get(spec.workspaceId) ?? 0) + 1);

  const workspaces: CreateWorkspaceOption[] = [];
  for (const workspace of registry.workspaces) {
    const common = {
      workspaceId: workspace.workspaceId,
      kind: workspace.kind,
      managed: workspace.managed,
      specCount: counts.get(workspace.workspaceId) ?? 0,
    };
    const checked = await inspectRegisteredWorkspace(
      engine.context,
      registry,
      workspace.workspaceId,
    );
    if (checked.status === 'unavailable' || !available) {
      workspaces.push({
        ...common,
        state: 'unavailable',
        selectable: false,
        reason: available ? 'checkout-unavailable' : 'git-unavailable',
      });
      continue;
    }
    const gitWorktree = worktrees.find((item) => samePath(item.root, checked.root));
    if (!gitWorktree || gitWorktree.prunable) {
      workspaces.push({
        ...common,
        state: 'unavailable',
        selectable: false,
        reason: 'git-membership-mismatch',
      });
      continue;
    }
    if (!gitWorktree.branch?.startsWith('refs/heads/')) {
      workspaces.push({ ...common, state: 'detached', selectable: false, reason: 'detached' });
      continue;
    }
    const branch = gitWorktree.branch.slice('refs/heads/'.length);
    const status = await executeGit(checked.root, [
      '-c',
      'core.optionalLocks=false',
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
    ]);
    if (status.exitCode !== 0) {
      workspaces.push({
        ...common,
        state: 'unavailable',
        selectable: false,
        reason: 'checkout-unavailable',
      });
      continue;
    }
    if (status.stdout.length !== 0) {
      workspaces.push({
        ...common,
        state: 'dirty',
        selectable: true,
        branch,
        reason: 'dirty',
      });
      continue;
    }
    workspaces.push({ ...common, state: 'available', selectable: true, branch });
  }
  // A concurrent rebind/registration invalidates the whole snapshot.
  if ((await engine.readRegistry()).revision !== registry.revision)
    throw new WorkspaceRegistryError(
      'REGISTRY_CONFLICT',
      'Workspace registry changed during create-options inspection.',
    );

  const checkedOut = new Map(
    workspaces
      .filter((item) => (item.state === 'available' || item.state === 'dirty') && item.branch)
      .map((item) => ['refs/heads/' + item.branch, item.workspaceId]),
  );
  const integrationChoices = workspaces.map((item) => {
    const registration = registry.workspaces.find(
      (candidate) => candidate.workspaceId === item.workspaceId,
    );
    return {
      ...item,
      integrationSelectable:
        item.state === 'available' && (item.kind === 'primary' || item.managed),
      ...(registration?.kind === 'linked' && registration.integrationDestination
        ? {
            integrationDestination: {
              workspaceId: registration.integrationDestination.workspaceId,
              branch: registration.integrationDestination.branch,
            },
          }
        : {}),
    };
  });
  return {
    primaryWorkspaceId: registry.primaryWorkspaceId,
    workspaces: integrationChoices,
    newWorktree: available
      ? policy.enabled
        ? { status: 'available' }
        : { status: 'disabled', reason: 'git-disabled' }
      : { status: 'unavailable', reason: 'git-unavailable' },
    defaultBaseRef: policy.baseRef,
    branchPattern: policy.branchPattern,
    ...(policy.integrationTargetBranch !== undefined
      ? { integrationTargetBranch: policy.integrationTargetBranch }
      : {}),
    baseRefs: branches
      .filter((ref) => {
        if (!ref.startsWith('refs/heads/')) return false;
        try {
          validateBaseRef(ref);
          return true;
        } catch (error) {
          if (error instanceof GitCapabilityError && error.code === 'GIT_POLICY_INVALID')
            return false;
          throw error;
        }
      })
      .map((ref) => ({
        // Canonical form is accepted by Create even for names like feature/x.
        ref,
        ...(checkedOut.get(ref) !== undefined
          ? { checkedOutWorkspaceId: checkedOut.get(ref) }
          : {}),
      })),
  };
}

function samePath(left: string, right: string): boolean {
  const a = resolve(left);
  const b = resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

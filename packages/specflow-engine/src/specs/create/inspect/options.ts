import { stat } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import type { SpecFlowEngine } from '../../../application';
import { GitCapabilityError } from '../../../git/errors';
import { WorkspaceRegistryError } from '../../../project/workspace/registry/registry';
import { inspectRegistryWorkspaces } from '../../../project/workspace/inspection/inspection';
import { createLocalGitClient } from '../../../version-control/git/client';
import { validateBaseRef } from '../../../version-control/git/refs';
import { engineCommitRefusal } from '../../../version-control/commits/branch-patterns';
import {
  effectiveWorktreesRoot,
  readProjectGitPolicy,
} from '../../../version-control/worktrees/config';
import {
  DEFAULT_BASE_REF,
  DEFAULT_BRANCH_PATTERN,
  expandBranchPattern,
  type GitWorktreePolicy,
} from '../../../version-control/worktrees/policy';
import { runReadRequest } from '../../../project/request-verification-memo';

export type CreateWorkspaceState = 'available' | 'unavailable' | 'detached' | 'dirty';
export type CreateOptionsReason =
  | 'git-disabled'
  | 'git-unavailable'
  | 'checkout-unavailable'
  | 'git-membership-mismatch'
  | 'detached'
  | 'dirty'
  /** Only with `git.enabled`: the branch matches `git.commits.protectedBranches`. */
  | 'branch-protected'
  /** Only with `git.enabled`: `git.commits.allowedBranches` is set and the branch matches none. */
  | 'branch-not-allowed'
  /** The Git section of the configuration is invalid: no Git fact and no policy value is served. */
  | 'git-policy-invalid';

export interface CreateWorkspaceOption {
  readonly workspaceId: string;
  readonly kind: 'primary' | 'linked';
  /** Display label: the checkout's folder name (for the primary one, the repository folder). */
  readonly name: string;
  /** Display path of the registered checkout. */
  readonly path: string;
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
    /** Only with `git.enabled` and only `true`: the generated branch name is protected. */
    readonly branchProtected?: true;
  };
  readonly defaultBaseRef: string;
  readonly branchPattern: string;
  /** Effective folder (local `git.worktreesRoot` or the default) that receives new worktrees. */
  readonly worktreesRoot: { readonly path: string; readonly exists: boolean };
  readonly integrationTargetBranch?: string;
  /**
   * Present exactly when the Engine commits the scaffold of a new Specification, i.e. when
   * `git.enabled` (even with empty lists). Absent when Git is disabled.
   */
  readonly commits?: {
    readonly protectedBranches: readonly string[];
    readonly allowedBranches?: readonly string[];
  };
  readonly baseRefs: readonly CreateBaseRefOption[];
}

/**
 * Whether Create will commit the scaffold (`git.enabled`). False when the policy cannot be read: the
 * Create itself then fails with the policy error. Reads configuration only; spawns no Git process.
 */
export async function willCommitCreatedScaffold(engine: SpecFlowEngine): Promise<boolean> {
  try {
    return (await readProjectGitPolicy(engine.context)).policy.enabled;
  } catch {
    return false;
  }
}

/**
 * Authorized caller-facing read model. This is NOT an admission reservation.
 * Create rechecks policy, registry, physical identity and Git state when used.
 */
export function inspectCreateOptions(
  engine: SpecFlowEngine,
  options: InspectCreateOptionsOptions = {},
): Promise<PublicCreateOptions> {
  // Read-only: verify each workspace once for this request.
  return runReadRequest(() => inspectCreateOptionsInRequest(engine, options));
}

export interface InspectCreateOptionsOptions {
  /**
   * Called with the Engine's own description of why the Git policy is invalid (no paths). The
   * read then degrades instead of failing; this is where an operator-facing log line goes.
   */
  readonly onPolicyProblem?: (problem: string) => void;
}

/** Values that stand in for an unreadable policy; none of them is ever served as a policy fact. */
const UNREADABLE_POLICY: GitWorktreePolicy = {
  enabled: false,
  branchPattern: DEFAULT_BRANCH_PATTERN,
  baseRef: DEFAULT_BASE_REF,
  commits: { protectedBranches: [] },
};

async function readPolicyOrDegrade(
  engine: SpecFlowEngine,
  options: InspectCreateOptionsOptions,
): Promise<{ readonly policy: GitWorktreePolicy; readonly policyInvalid: boolean }> {
  try {
    return { policy: (await readProjectGitPolicy(engine.context)).policy, policyInvalid: false };
  } catch (error) {
    if (!(error instanceof GitCapabilityError) || error.code !== 'GIT_POLICY_INVALID') {
      throw error;
    }

    options.onPolicyProblem?.(error.message);

    return { policy: UNREADABLE_POLICY, policyInvalid: true };
  }
}

async function inspectCreateOptionsInRequest(
  engine: SpecFlowEngine,
  options: InspectCreateOptionsOptions,
): Promise<PublicCreateOptions> {
  const registry = await engine.readRegistry();
  // An invalid Git section must not hide what needs no Git: registered workspaces are still
  // verified on disk, but Create reads the policy for EVERY target (to know whether it commits),
  // so none of them is selectable and the Git part is unavailable until the configuration is fixed.
  const { policy, policyInvalid } = await readPolicyOrDegrade(engine, options);
  // Git facts are fetched ONLY when Git is enabled. A Git-disabled project answers
  // from the registry and filesystem checks alone and spawns no Git process.
  // Otherwise: one `worktree list`, one `for-each-ref`, then bounded-parallel
  // `status` for the workspaces that need it.
  const gitEnabled = policy.enabled;
  const git = createLocalGitClient(engine.context.project.homeRoot);
  const [branchesResult, inspectedResult] = await Promise.allSettled([
    gitEnabled ? git.listLocalRefs() : Promise.resolve([] as readonly string[]),
    inspectRegistryWorkspaces(engine, registry, gitEnabled),
  ]);
  const { workspaces: inspected, gitReachable } = settledValue(inspectedResult);
  const branches = gitReachable ? settledValue(branchesResult) : [];

  const workspaces = inspected.map((item): CreateWorkspaceOption => {
    const common = {
      workspaceId: item.workspaceId,
      kind: item.kind,
      name: item.name,
      path: item.root,
      managed: item.managed,
      specCount: item.specCount,
    };
    if (item.available && policyInvalid) {
      return { ...common, state: 'unavailable', selectable: false, reason: 'git-policy-invalid' };
    }

    if (!item.available) {
      return {
        ...common,
        state: 'unavailable',
        selectable: false,
        reason:
          item.unavailableReason === undefined || item.unavailableReason === 'checkout-mismatch'
            ? 'checkout-unavailable'
            : item.unavailableReason,
      };
    }

    // Git disabled: the filesystem verification is the whole answer.
    if (!item.git) {
      return { ...common, state: 'available', selectable: true };
    }

    if (item.git.detached) {
      return { ...common, state: 'detached', selectable: false, reason: 'detached' };
    }

    const branch = item.git.branch!;
    const refusal = engineCommitRefusal(policy.commits, branch);
    // The Engine would not commit the scaffold here: the checkout stays visible but not selectable.
    if (refusal) {
      return {
        ...common,
        state: item.git.dirty ? 'dirty' : 'available',
        selectable: false,
        branch,
        reason: refusal,
      };
    }

    return item.git.dirty
      ? { ...common, state: 'dirty', selectable: true, branch, reason: 'dirty' }
      : { ...common, state: 'available', selectable: true, branch };
  });
  // A concurrent rebind/registration invalidates the whole snapshot.
  if ((await engine.readRegistry()).revision !== registry.revision) {
    throw new WorkspaceRegistryError(
      'REGISTRY_CONFLICT',
      'Workspace registry changed during create-options inspection.',
    );
  }

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
  // A local `git.worktreesRoot` inside the repository is an invalid Git setting like any other:
  // the read degrades (new worktrees unavailable) instead of failing as a whole.
  const worktreesRoot = await describeWorktreesRoot(engine, policy, options);

  return {
    primaryWorkspaceId: registry.primaryWorkspaceId,
    workspaces: integrationChoices,
    newWorktree:
      policyInvalid || worktreesRoot.invalid
        ? { status: 'unavailable', reason: 'git-policy-invalid' }
        : !gitEnabled
          ? { status: 'disabled', reason: 'git-disabled' }
          : gitReachable
            ? {
                status: 'available',
                ...(branchPatternIsProtected(policy) ? { branchProtected: true as const } : {}),
              }
            : { status: 'unavailable', reason: 'git-unavailable' },
    defaultBaseRef: policy.baseRef,
    branchPattern: policy.branchPattern,
    worktreesRoot: worktreesRoot.value,
    ...(policy.integrationTargetBranch !== undefined
      ? { integrationTargetBranch: policy.integrationTargetBranch }
      : {}),
    ...(gitEnabled
      ? {
          commits: {
            protectedBranches: [...policy.commits.protectedBranches],
            ...(policy.commits.allowedBranches
              ? { allowedBranches: [...policy.commits.allowedBranches] }
              : {}),
          },
        }
      : {}),
    baseRefs: branches
      .filter((ref) => {
        if (!ref.startsWith('refs/heads/')) {
          return false;
        }

        try {
          validateBaseRef(ref);

          return true;
        } catch (error) {
          if (error instanceof GitCapabilityError && error.code === 'GIT_POLICY_INVALID') {
            return false;
          }

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

/**
 * Advisory: expands the branch pattern with a representative slug and short id. The Engine decides
 * on the real branch name at Create, and a typed branch override can always escape.
 */
function branchPatternIsProtected(
  policy: Awaited<ReturnType<typeof readProjectGitPolicy>>['policy'],
): boolean {
  const branch = expandBranchPattern(policy.branchPattern, 'a0', '0000000', 'nevo-1');

  return engineCommitRefusal(policy.commits, branch) !== undefined;
}

async function describeWorktreesRoot(
  engine: SpecFlowEngine,
  policy: Awaited<ReturnType<typeof readProjectGitPolicy>>['policy'],
  options: InspectCreateOptionsOptions,
): Promise<{
  readonly value: { readonly path: string; readonly exists: boolean };
  readonly invalid: boolean;
}> {
  let path: string;
  try {
    path = effectiveWorktreesRoot(engine.context, policy);
  } catch (error) {
    if (!(error instanceof GitCapabilityError) || error.code !== 'GIT_POLICY_INVALID') {
      throw error;
    }

    options.onPolicyProblem?.(error.message);
    // The configured value is unusable: show where worktrees would go by default.
    const home = engine.context.project.homeRoot;

    return {
      value: {
        path: join(dirname(home), basename(home) + '-worktrees'),
        exists: false,
      },
      invalid: true,
    };
  }

  // Anything but a readable directory (missing, no permission, ...) is "does not exist yet".
  const found = await stat(path).catch(() => undefined);

  return { value: { path, exists: found?.isDirectory() === true }, invalid: false };
}

function settledValue<T>(result: PromiseSettledResult<T>): T {
  if (result.status === 'rejected') {
    throw result.reason;
  }

  return result.value;
}

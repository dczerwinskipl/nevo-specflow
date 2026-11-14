import { basename, resolve } from 'node:path';

import type { SpecFlowEngine } from '../../application';
import { READ_GIT_CONCURRENCY, mapBounded } from '../../concurrency';
import { GitCapabilityError } from '../../git/errors';
import { executeGit } from '../../git/process';
import { discoverSpecifications } from '../discovery';
import { createLocalGitClient } from '../../version-control/git/client';
import { readProjectGitPolicy } from '../../version-control/worktrees/config';
import { runReadRequest } from '../../project/request-verification-memo';
import {
  inspectRegisteredWorkspace,
  WorkspaceRegistryError,
  type RegisteredWorkspaceInspection,
  type WorkspaceRegistry,
} from '../../project/workspace/registry/registry';

export type WorkspaceUnavailableReason =
  /** The registered root failed verification, on disk or by `git status`. */
  | 'checkout-unavailable'
  /** The path no longer is the registered checkout (moved, symlinked or redirected). */
  | 'checkout-mismatch'
  /** Git is enabled but cannot be reached. */
  | 'git-unavailable'
  /** Git is enabled and does not list the checkout as a live worktree. */
  | 'git-membership-mismatch';

export interface WorkspaceGitFacts {
  /** Absent when the checkout is detached. */
  readonly branch?: string;
  readonly detached: boolean;
  readonly dirty: boolean;
}

export interface InspectedWorkspace {
  readonly workspaceId: string;
  readonly kind: 'primary' | 'linked';
  /** The checkout's folder name (for the primary one, the repository folder). */
  readonly name: string;
  /** Absolute registered root. */
  readonly root: string;
  readonly managed: boolean;
  /** True for the checkout the Engine was opened in. */
  readonly isRuntimeWorkspace: boolean;
  readonly available: boolean;
  readonly unavailableReason?: WorkspaceUnavailableReason;
  /** Specifications whose manifest was read from this checkout. */
  readonly specifications: readonly { readonly specId: string; readonly title: string }[];
  /** Specifications bound to this checkout, including those whose manifest is not readable. */
  readonly specCount: number;
  /** Only when Git is enabled and the checkout is available. */
  readonly git?: WorkspaceGitFacts;
}

export type WorkspaceReadInspection =
  RegisteredWorkspaceInspection | { readonly status: 'not-registered' };

/**
 * Every registered checkout with its availability, bound Specifications and, only when
 * `git.enabled`, its branch / detached / dirty facts. An invalid Git section degrades to "no Git
 * facts" (the Create read reports the policy problem itself).
 */
export function inspectWorkspaces(engine: SpecFlowEngine): Promise<readonly InspectedWorkspace[]> {
  return runReadRequest(async () => {
    const registry = await engine.readRegistry();

    return (await inspectRegistryWorkspaces(engine, registry, await isGitEnabled(engine)))
      .workspaces;
  });
}

/**
 * Disk-only verification of one registered checkout for a read. Spawns no Git process (inside a
 * read request) and never serves an unverified root.
 */
export async function inspectWorkspaceForRead(
  engine: SpecFlowEngine,
  workspaceId: string,
): Promise<WorkspaceReadInspection> {
  return runReadRequest(async () => {
    const registry = await engine.readRegistry();
    if (!registry.workspaces.some((item) => item.workspaceId === workspaceId)) {
      return { status: 'not-registered' };
    }

    const checked = await verifyForRead(engine, registry, workspaceId);

    return checked.status === 'mismatch'
      ? { status: 'unavailable', workspace: checked.workspace, reason: checked.reason }
      : checked;
  });
}

/** A checkout that no longer is the registered one is unavailable, not a failure of the whole read. */
async function verifyForRead(
  engine: SpecFlowEngine,
  registry: WorkspaceRegistry,
  workspaceId: string,
): Promise<
  | RegisteredWorkspaceInspection
  | { status: 'mismatch'; workspace: WorkspaceRegistry['workspaces'][number]; reason: string }
> {
  try {
    return await inspectRegisteredWorkspace(engine.context, registry, workspaceId);
  } catch (error) {
    if (error instanceof WorkspaceRegistryError && error.code === 'REGISTRY_WORKSPACE_MISMATCH') {
      return {
        status: 'mismatch',
        workspace: registry.workspaces.find((item) => item.workspaceId === workspaceId)!,
        reason: error.message,
      };
    }

    throw error;
  }
}

/** Shared by Create options so both reads answer from one model of the checkout list. */
export async function inspectRegistryWorkspaces(
  engine: SpecFlowEngine,
  registry: WorkspaceRegistry,
  gitEnabled: boolean,
): Promise<{ readonly workspaces: readonly InspectedWorkspace[]; readonly gitReachable: boolean }> {
  const git = createLocalGitClient(engine.context.project.homeRoot);
  const [worktreesResult, verified] = await Promise.all([
    gitEnabled
      ? git.listWorktrees().then(
          (value) => ({ value }),
          (reason: unknown) => ({ reason }),
        )
      : Promise.resolve({ value: [] }),
    mapBounded(registry.workspaces, READ_GIT_CONCURRENCY, (workspace) =>
      verifyForRead(engine, registry, workspace.workspaceId),
    ),
  ]);
  // One bad checkout never fails the list: Specifications bound to a checkout that failed its
  // verification are not discovered (discovery would rethrow a mismatch); they are only counted.
  const unusable = new Set(
    registry.workspaces
      .filter((_, index) => verified[index]!.status !== 'available')
      .map((workspace) => workspace.workspaceId),
  );
  const boundTo = new Map(
    registry.specBindings.map((binding) => [binding.specId, binding.workspaceId]),
  );
  const discovered = await discoverSpecifications(engine, (specId) => {
    const workspaceId = boundTo.get(specId);

    return workspaceId === undefined || !unusable.has(workspaceId);
  });
  if ('reason' in worktreesResult && !isGitUnavailable(worktreesResult.reason)) {
    throw worktreesResult.reason;
  }

  const worktrees = 'value' in worktreesResult ? worktreesResult.value : undefined;
  // Explicit, so an outage is not mistaken for "reachable" when every checkout fails its disk check.
  const gitReachable = gitEnabled && worktrees !== undefined;
  const bound = new Map<string, { specId: string; title: string }[]>();
  const counts = new Map<string, number>();
  for (const [, workspaceId] of boundTo) {
    if (unusable.has(workspaceId)) {
      counts.set(workspaceId, (counts.get(workspaceId) ?? 0) + 1);
    }
  }

  for (const spec of discovered) {
    counts.set(spec.workspaceId, (counts.get(spec.workspaceId) ?? 0) + 1);
    if (spec.status === 'available') {
      const list = bound.get(spec.workspaceId) ?? [];
      list.push({ specId: spec.specId, title: spec.specification.title });
      bound.set(spec.workspaceId, list);
    }
  }

  const workspaces = await mapBounded(
    registry.workspaces,
    READ_GIT_CONCURRENCY,
    async (workspace, index) => {
      const common = {
        workspaceId: workspace.workspaceId,
        kind: workspace.kind,
        name: basename(workspace.root),
        root: workspace.root,
        managed: workspace.managed,
        isRuntimeWorkspace: workspace.workspaceId === engine.workspace.workspaceId,
        specifications: bound.get(workspace.workspaceId) ?? [],
        specCount: counts.get(workspace.workspaceId) ?? 0,
      };
      const checked = verified[index]!;
      if (checked.status === 'mismatch') {
        return { ...common, available: false, unavailableReason: 'checkout-mismatch' as const };
      }

      if (checked.status === 'unavailable') {
        return { ...common, available: false, unavailableReason: 'checkout-unavailable' as const };
      }

      if (!gitEnabled) {
        return { ...common, available: true };
      }

      if (!worktrees) {
        return { ...common, available: false, unavailableReason: 'git-unavailable' as const };
      }

      const listed = worktrees.find((item) => samePath(item.root, checked.root));
      if (!listed || listed.prunable) {
        return {
          ...common,
          available: false,
          unavailableReason: 'git-membership-mismatch' as const,
        };
      }

      if (!listed.branch?.startsWith('refs/heads/')) {
        return { ...common, available: true, git: { detached: true, dirty: false } };
      }

      const branch = listed.branch.slice('refs/heads/'.length);
      const status = await executeGit(checked.root, [
        '-c',
        'core.optionalLocks=false',
        'status',
        '--porcelain=v1',
        '--untracked-files=all',
      ]);
      if (status.exitCode !== 0) {
        return {
          ...common,
          available: false,
          unavailableReason: 'checkout-unavailable' as const,
        };
      }

      return {
        ...common,
        available: true,
        git: { branch, detached: false, dirty: status.stdout.length !== 0 },
      };
    },
  );

  return { workspaces, gitReachable };
}

/** The Git section only decides whether Git facts are read; a broken one means "no Git facts". */
async function isGitEnabled(engine: SpecFlowEngine): Promise<boolean> {
  try {
    return (await readProjectGitPolicy(engine.context)).policy.enabled;
  } catch (error) {
    if (error instanceof GitCapabilityError && error.code === 'GIT_POLICY_INVALID') {
      return false;
    }

    throw error;
  }
}

function samePath(left: string, right: string): boolean {
  const a = resolve(left);
  const b = resolve(right);

  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function isGitUnavailable(error: unknown): boolean {
  return (
    error instanceof GitCapabilityError &&
    (error.code === 'GIT_UNAVAILABLE' ||
      error.code === 'NOT_GIT_REPOSITORY' ||
      error.code === 'GIT_OPERATION_FAILED')
  );
}

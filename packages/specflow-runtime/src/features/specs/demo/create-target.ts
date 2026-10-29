import {
  deriveSpecSlug,
  engineCommitRefusal,
  isValidBranchName,
} from '@nevo/specflow-contracts/specs';
import type {
  DemoCreateErrorCode,
  DemoCreateOptions,
  DemoCreateTarget,
} from '@nevo/specflow-contracts/demo';

import type { DemoWorkspace } from './seed';

/**
 * Create target validation of the demo. It uses the SAME slug and branch rules as the real Create
 * (`deriveSpecSlug`, `isValidBranchName` of the contracts), so a long title or a typed branch
 * behaves identically in demo and project mode.
 */

/** Slug of a title; `specification` when nothing usable remains (the Engine uses `spec-<short id>`). */
export function demoSlugFor(title: string): string {
  return deriveSpecSlug(title) || 'specification';
}

export class DemoTargetError extends Error {
  readonly status: 400 | 403 | 409 | 422 | 503;
  /** `'forbidden'` has no wire code: a 403 answers `{ error: 'forbidden' }` only. */
  readonly code: DemoCreateErrorCode | 'forbidden';
  constructor(
    status: 400 | 403 | 409 | 422 | 503,
    code: DemoCreateErrorCode | 'forbidden',
    message: string,
  ) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export interface ResolvedTarget {
  kind: 'main' | 'existing' | 'new-worktree';
  /** Workspace that receives the spec (existing/main) — undefined for a not-yet-created worktree. */
  workspaceId?: string;
  /** Branch of the new worktree (explicit or generated). */
  branch?: string;
  baseRef: string;
  integrationTargetWorkspaceId?: string;
}

const taken = (options: DemoCreateOptions, branch: string) =>
  options.baseRefs.some((b) => b.ref === branch) ||
  options.workspaces.some((w) => w.branch === branch);

/**
 * Validates a create `target` against the current options and resolves what Create would do.
 * Throws `DemoTargetError` with the mapped demo error code.
 */
export function resolveTarget(
  options: DemoCreateOptions,
  target: DemoCreateTarget | undefined,
  slug: string,
): ResolvedTarget {
  const unavailable = (message: string) =>
    new DemoTargetError(409, 'DEMO_WORKSPACE_UNAVAILABLE', message);
  // Like the Engine: a checkout whose branch the Engine would not commit on is refused as policy.
  const refusedByBranch = (workspace: DemoWorkspace) =>
    workspace.reason === 'git-policy-invalid'
      ? new DemoTargetError(503, 'GIT_POLICY_INVALID', 'GIT_POLICY_INVALID')
      : workspace.reason === 'branch-protected' || workspace.reason === 'branch-not-allowed'
        ? new DemoTargetError(422, 'BRANCH_PROTECTED', 'BRANCH_PROTECTED')
        : unavailable('Wybrane środowisko pracy nie jest już dostępne.');
  if (!target) {
    const primary = options.workspaces.find((w) => w.workspaceId === options.primaryWorkspaceId);
    if (primary && !primary.selectable) {
      throw refusedByBranch(primary);
    }

    if (!primary?.selectable) {
      throw unavailable('Bieżący katalog nie jest teraz dostępny.');
    }

    return { kind: 'main', workspaceId: primary.workspaceId, baseRef: primary.branch ?? 'HEAD' };
  }

  if (target.kind === 'existing') {
    const workspace = options.workspaces.find((w) => w.workspaceId === target.workspaceId);
    if (workspace && !workspace.selectable) {
      throw refusedByBranch(workspace);
    }

    if (!workspace?.selectable) {
      throw unavailable('Wybrane środowisko pracy nie jest już dostępne.');
    }

    return {
      kind: 'existing',
      workspaceId: workspace.workspaceId,
      baseRef: workspace.branch ?? 'HEAD',
    };
  }

  if (options.newWorktree.reason === 'git-policy-invalid') {
    throw new DemoTargetError(503, 'GIT_POLICY_INVALID', 'GIT_POLICY_INVALID');
  }

  if (options.newWorktree.status !== 'available') {
    throw unavailable('Tworzenie nowego środowiska pracy nie jest teraz dostępne.');
  }

  const baseRef = target.baseRef ?? options.defaultBaseRef;
  if (target.baseRef !== undefined && !options.baseRefs.some((b) => b.ref === target.baseRef)) {
    throw new DemoTargetError(422, 'BASE_REF_NOT_FOUND', 'BASE_REF_NOT_FOUND');
  }

  if (target.integrationTargetWorkspaceId !== undefined) {
    const workspace = options.workspaces.find(
      (w) => w.workspaceId === target.integrationTargetWorkspaceId,
    );
    if (workspace?.integrationSelectable !== true)
    // Like the Engine: an unusable explicit target is plain `CREATE_OPERATION_INVALID`.
    {
      throw new DemoTargetError(400, 'CREATE_OPERATION_INVALID', 'CREATE_OPERATION_INVALID');
    }
  }

  let branch = target.branch?.trim();
  if (target.branch !== undefined) {
    if (!branch || !isValidBranchName(branch)) {
      throw new DemoTargetError(400, 'CREATE_OPERATION_INVALID', 'CREATE_OPERATION_INVALID');
    }

    if (taken(options, branch)) {
      throw new DemoTargetError(409, 'BRANCH_ALREADY_EXISTS', 'BRANCH_ALREADY_EXISTS');
    }
  } else {
    const base = options.branchPattern.replace('{slug}', slug);
    branch = base;
    for (let n = 2; taken(options, branch); n += 1) {
      branch = `${base}-${n}`;
    }
  }

  // Never silently renamed (like the Engine): a protected branch name is refused.
  if (options.commits && engineCommitRefusal(options.commits, branch)) {
    throw new DemoTargetError(422, 'BRANCH_PROTECTED', 'BRANCH_PROTECTED');
  }

  return {
    kind: 'new-worktree',
    branch,
    baseRef,
    ...(target.integrationTargetWorkspaceId !== undefined
      ? { integrationTargetWorkspaceId: target.integrationTargetWorkspaceId }
      : {}),
  };
}

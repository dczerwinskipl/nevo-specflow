import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { SpecFlowEngine } from '../../application';
import { executeGit } from '../../git/process';
import {
  MAX_MANAGED_WORKSPACE_SPECIFICATIONS,
  inspectRegisteredWorkspace,
} from '../../project/workspace-registry';
import { readProjectGitPolicy } from '../../version-control/worktrees/config';
import { resolveSpecification } from '../discovery';
import { listWorkspaceSpecifications } from '../repository';
import { isValidSpecificationId } from '../model';
import {
  CloseOperationError,
  fingerprintCloseIntent,
  resourcesForClosePlan,
  type ClosePlan,
  type CloseWorkspaceEvidence,
} from './model';
import { sortedResources } from './resources';

export type CloseRequest =
  | { readonly kind: 'worktree-close'; readonly operationId?: string; readonly specId: string }
  | {
      readonly kind: 'workspace-close';
      readonly operationId?: string;
      readonly workspaceId: string;
    }
  | {
      readonly kind: 'specification-close';
      readonly operationId?: string;
      readonly specId: string;
      readonly integrateToTargetBranch?: boolean;
    };

function invalid(message: string): CloseOperationError {
  return new CloseOperationError('CLOSE_PREFLIGHT', message);
}

async function gitValue(root: string, args: readonly string[], reason: string): Promise<string> {
  const value = await executeGit(root, args);
  const result = value.stdout.trim();
  if (value.exitCode !== 0 || !result) throw invalid(reason);
  return result;
}

/**
 * Git can have an unfinished merge/rebase/cherry-pick and an empty porcelain
 * status (e.g. an empty-content merge --no-commit). Verify Git admin state
 * rather than trusting a clean index as evidence that no operation is active.
 */
async function requireNoGitOperation(root: string): Promise<void> {
  for (const name of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'REBASE_HEAD']) {
    const result = await executeGit(root, ['rev-parse', '--verify', '--quiet', name]);
    if (result.exitCode === 0) {
      throw invalid('Checkout has an unfinished Git operation: ' + name + '.');
    }
    if (result.exitCode !== 1) throw invalid('Cannot inspect Git operation state.');
  }
  for (const name of ['rebase-merge', 'rebase-apply', 'sequencer']) {
    const path = await gitValue(
      root,
      ['rev-parse', '--git-path', name],
      'Cannot resolve Git sequencer directory.',
    );
    try {
      await lstat(resolve(root, path));
      throw invalid('Checkout has unfinished Git sequencer state: ' + name + '.');
    } catch (error) {
      if (!isMissing(error)) throw error;
    }
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

/** Read-only: git status may refresh index by default; disable optional locks. */
export async function inspectCleanGitWorkspace(workspace: {
  readonly workspaceId: string;
  readonly root: string;
  readonly instanceId?: string;
}): Promise<CloseWorkspaceEvidence> {
  const root = workspace.root;
  await requireNoGitOperation(root);
  const state = await executeGit(root, [
    '-c',
    'core.optionalLocks=false',
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
  ]);
  if (state.exitCode !== 0 || state.stdout) {
    throw invalid(
      'Checkout has staged, modified or untracked files, or Git status is unavailable.',
    );
  }
  const branchRef = await gitValue(
    root,
    ['symbolic-ref', '--quiet', 'HEAD'],
    'Checkout must be on an attached local branch.',
  );
  if (!branchRef.startsWith('refs/heads/')) throw invalid('Checkout branch is not a local ref.');
  const head = await gitValue(
    root,
    ['rev-parse', '--verify', 'HEAD'],
    'Checkout HEAD is unavailable.',
  );
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/iu.test(head)) throw invalid('Invalid Git HEAD.');
  return {
    workspaceId: workspace.workspaceId,
    root,
    branch: branchRef.slice('refs/heads/'.length),
    head,
    ...(workspace.instanceId ? { instanceId: workspace.instanceId } : {}),
  };
}

/**
 * Pure read admission: no Git mutation, registry changes, inferred default
 * destination, generated archive commits or workflow/worker fake evidence.
 */
export async function previewCloseOperation(
  engine: SpecFlowEngine,
  request: CloseRequest,
  /** Only the workspace-scoped delegate may bypass exclusive legacy admission. */
  allowShared = false,
): Promise<ClosePlan> {
  if (request.kind === 'workspace-close') return previewWorkspaceClose(engine, request);
  const operationId = request.operationId ?? randomUUID();
  if (request.kind !== 'worktree-close' && request.kind !== 'specification-close') {
    throw new CloseOperationError('CLOSE_INVALID', 'Unknown lifecycle operation kind.');
  }
  if (!isValidSpecificationId(request.specId)) {
    throw new CloseOperationError('CLOSE_INVALID', 'Invalid Specification identity.');
  }
  const canonical = await resolveSpecification(engine, request.specId);
  if (canonical.status !== 'available') {
    throw new CloseOperationError(
      'CLOSE_UNAVAILABLE',
      'Canonical Specification source is unavailable.',
    );
  }
  const registry = await engine.readRegistry();
  const sourceWorkspace = registry.workspaces.find(
    (item) => item.workspaceId === canonical.workspaceId,
  );
  if (!sourceWorkspace) throw invalid('Canonical workspace registration disappeared.');
  const linked = sourceWorkspace.kind === 'linked';
  if (linked && !sourceWorkspace.managed)
    throw invalid('Unmanaged linked worktree cannot be closed.');
  // An archive-only Specification Close does not retire its checkout, so
  // sibling bindings and dependent integration destinations are not obstacles.
  // Whole-branch integration is admitted separately below.
  if (request.kind === 'worktree-close' && !linked) {
    throw invalid('Close Worktree requires a managed linked checkout.');
  }
  if (request.kind === 'specification-close') {
    if (canonical.specification.location !== 'active') {
      throw invalid('Only an active Specification can be archived.');
    }
    if (
      request.integrateToTargetBranch !== undefined &&
      typeof request.integrateToTargetBranch !== 'boolean'
    ) {
      throw new CloseOperationError('CLOSE_INVALID', 'Invalid integration selection.');
    }
    if (!linked && request.integrateToTargetBranch !== undefined) {
      throw new CloseOperationError(
        'CLOSE_INVALID',
        'Integration selection is not applicable in primary.',
      );
    }
  }
  const integrate =
    request.kind === 'worktree-close' ||
    (request.kind === 'specification-close' && linked && (request.integrateToTargetBranch ?? true));
  if (linked && integrate) {
    if (
      registry.workspaces.some(
        (candidate) =>
          candidate.kind === 'linked' &&
          candidate.integrationDestination?.workspaceId === sourceWorkspace.workspaceId,
      )
    ) {
      throw invalid('A registered source worktree still depends on this integration destination.');
    }
    const occupants = registry.specBindings.filter(
      (item) => item.workspaceId === sourceWorkspace.workspaceId,
    );
    if (!allowShared && (occupants.length !== 1 || occupants[0]?.specId !== request.specId)) {
      throw new CloseOperationError(
        'CLOSE_SHARED_WORKTREE',
        request.kind === 'specification-close'
          ? 'Multiple Specifications share this worktree. Archive this Specification without integration, or use an explicit workspace-scoped Close.'
          : 'Legacy spec-scoped Worktree Close requires exclusive occupancy; use workspace-scoped Close for a shared checkout.',
      );
    }
  }
  const source = await inspectCleanGitWorkspace(sourceWorkspace);
  const needsTarget = integrate || !linked;
  let target: CloseWorkspaceEvidence | undefined;
  let targetBranch: string | undefined;
  let configRevision: string | undefined;
  if (needsTarget) {
    const pinned =
      integrate && sourceWorkspace.kind === 'linked'
        ? sourceWorkspace.integrationDestination
        : undefined;
    if (pinned) {
      if (pinned.workspaceId === source.workspaceId) {
        throw invalid('Integration source and destination are the same physical checkout.');
      }
      const registration = registry.workspaces.find(
        (item) => item.workspaceId === pinned.workspaceId,
      );
      if (
        !registration ||
        registration.instanceId !== pinned.instanceId ||
        (registration.kind === 'linked' && !registration.managed)
      ) {
        throw invalid('Pinned integration target has an invalid registry incarnation.');
      }
      const inspected = await inspectRegisteredWorkspace(
        engine.context,
        registry,
        pinned.workspaceId,
      );
      if (inspected.status !== 'available') {
        throw invalid('Pinned integration target checkout is unavailable.');
      }
      target = await inspectCleanGitWorkspace(registration);
      targetBranch = pinned.branch;
      if (target.branch !== targetBranch) {
        throw invalid('Integration destination changed its attached local branch.');
      }
    } else {
      // Legacy/default target: retain the configured primary semantics.
      const configured = await readProjectGitPolicy(engine.context);
      targetBranch = configured.policy.integrationTargetBranch;
      if (!targetBranch) {
        throw invalid(
          'Project Home requires explicit git.integrationTargetBranch configuration before this operation.',
        );
      }
      configRevision = configured.revision;
      const primary = registry.workspaces.find(
        (item) => item.workspaceId === registry.primaryWorkspaceId,
      );
      if (primary?.kind !== 'primary') throw invalid('Verified primary workspace is unavailable.');
      const inspected = await inspectRegisteredWorkspace(
        engine.context,
        registry,
        primary.workspaceId,
      );
      if (inspected.status !== 'available') throw invalid('Primary worktree is unavailable.');
      target =
        source.workspaceId === primary.workspaceId
          ? source
          : await inspectCleanGitWorkspace(primary);
      if (target.branch !== targetBranch) {
        throw invalid(
          'Primary worktree is checked out on a different branch from git.integrationTargetBranch.',
        );
      }
    }
  }
  const binding = registry.specBindings.find((item) => item.specId === request.specId);
  const normalized =
    request.kind === 'worktree-close'
      ? { kind: 'worktree-close' as const, operationId, specId: request.specId }
      : {
          kind: 'specification-close' as const,
          operationId,
          specId: request.specId,
          integrateToTargetBranch: linked ? (request.integrateToTargetBranch ?? true) : false,
        };

  const resources = sortedResources([
    'spec:' + request.specId,
    'checkout:' + source.workspaceId,
    'ref:refs/heads/' + source.branch.toLowerCase(),
    ...(target && target.workspaceId !== source.workspaceId
      ? ['checkout:' + target.workspaceId, 'ref:refs/heads/' + target.branch.toLowerCase()]
      : []),
    ...(linked && integrate ? ['git-worktree-admin:' + engine.context.project.projectId] : []),
  ]);
  // A revision is only a snapshot: journal reservation MUST revalidate it
  // while holding the existing Project Home short lock.
  return {
    kind: request.kind,
    operationId,
    specId: request.specId,
    fingerprint: fingerprintCloseIntent(normalized),
    slug: canonical.specification.slug,
    location: canonical.specification.location,
    registryRevision: registry.revision,
    ...(binding ? { bindingGeneration: binding.generation } : {}),
    source,
    ...(target ? { target } : {}),
    ...(targetBranch ? { targetBranch } : {}),
    ...(request.kind === 'specification-close' && linked
      ? { integrateToTargetBranch: integrate }
      : {}),
    ...(configRevision ? { configRevision } : {}),
    resources,
  };
}

/**
 * Workspace-level admission is based exclusively on the verified registry.
 * A caller supplies no Specification ID or occupant list. All pinned occupants
 * are checked against physical canonical manifests before any journal exists.
 */
async function previewWorkspaceClose(
  engine: SpecFlowEngine,
  request: {
    readonly kind: 'workspace-close';
    readonly operationId?: string;
    readonly workspaceId: string;
  },
): Promise<ClosePlan> {
  if (!isValidSpecificationId(request.workspaceId))
    throw new CloseOperationError('CLOSE_INVALID', 'Invalid workspace identity.');
  const registry = await engine.readRegistry();
  const workspace = registry.workspaces.find((x) => x.workspaceId === request.workspaceId);
  if (workspace?.kind !== 'linked' || !workspace.managed || !workspace.instanceId)
    throw invalid('Workspace Close requires a registered, managed linked worktree.');
  // Verify Git membership and the managed incarnation BEFORE reading even
  // one path from the registered root. The inspected canonical root is the
  // only source subsequently passed to the repository manifest reader.
  const inspected = await inspectRegisteredWorkspace(engine.context, registry, request.workspaceId);
  if (inspected.status !== 'available')
    throw invalid(
      'Managed workspace checkout is unavailable or its incarnation cannot be verified.',
    );
  const bindings = registry.specBindings
    .filter((x) => x.workspaceId === workspace.workspaceId)
    .sort((a, b) => (a.specId < b.specId ? -1 : a.specId > b.specId ? 1 : 0));
  if (bindings.length === 0)
    throw invalid('Workspace Close requires at least one canonical bound Specification.');
  if (bindings.length > MAX_MANAGED_WORKSPACE_SPECIFICATIONS)
    throw invalid(
      'Workspace has ' +
        bindings.length +
        ' bound Specifications, exceeding the supported limit of ' +
        MAX_MANAGED_WORKSPACE_SPECIFICATIONS +
        '. Resolve excess bindings before Close; no operation was reserved.',
    );
  const physical = await listWorkspaceSpecifications(inspected.root);
  const byId = new Map(physical.map((item) => [item.specId, item]));
  const occupants = bindings.map((binding) => {
    const manifest = byId.get(binding.specId);
    if (!manifest)
      throw invalid('Bound canonical Specification is missing from verified checkout.');
    return {
      specId: binding.specId,
      slug: manifest.slug,
      location: manifest.location,
      status: manifest.status,
      bindingGeneration: binding.generation,
    } as const;
  });
  // Derive the existing Worktree Close Git destination, branch and physical
  // admission using a verified anchor. The anchor is internal only and never
  // selects or limits the set moved by workspace-level CAS.
  const operationId = request.operationId ?? randomUUID();
  const base = await previewCloseOperation(
    engine,
    {
      kind: 'worktree-close',
      operationId,
      specId: occupants[0]!.specId,
    },
    true,
  );
  if (
    base.registryRevision !== registry.revision ||
    base.source.workspaceId !== request.workspaceId
  )
    throw new CloseOperationError(
      'CLOSE_CONFLICT',
      'Workspace occupant snapshot changed during preview.',
    );
  const plan: ClosePlan = {
    ...base,
    kind: 'workspace-close',
    workspaceId: request.workspaceId,
    occupants,
    fingerprint: fingerprintCloseIntent({
      kind: 'workspace-close',
      operationId,
      workspaceId: request.workspaceId,
    }),
  };
  return {
    ...plan,
    resources: resourcesForClosePlan(plan, engine.context.project.projectId),
  };
}

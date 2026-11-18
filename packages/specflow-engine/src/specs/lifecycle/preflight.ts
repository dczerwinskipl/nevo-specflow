import { randomUUID } from 'node:crypto';
import { lstat } from 'node:fs/promises';
import { resolve } from 'node:path';

import type { SpecFlowEngine } from '../../application';
import { executeGit } from '../../git/process';
import {
  MAX_MANAGED_WORKSPACE_SPECIFICATIONS,
  inspectRegisteredWorkspace,
} from '../../project/workspace/registry/registry';
import type {
  WorkspaceRegistration,
  WorkspaceRegistry,
} from '../../project/workspace/registry/types';
import { runGitFreeMutation } from '../../project/request-verification-memo';
import { readProjectGitPolicy } from '../../version-control/worktrees/config';
import type { GitWorktreePolicy } from '../../version-control/worktrees/policy';
import { resolveSpecification } from '../discovery';
import { listWorkspaceSpecifications } from '../repository';
import { isExecutionStatePathOf } from '../execution-paths';
import { isValidSpecificationId } from '../model';
import {
  CloseOperationError,
  REPOSITORY_PATHS_NAMED,
  assertSpecificationExit,
  fingerprintCloseIntent,
  resourcesForClosePlan,
  type CloseCheckoutRole,
  type ClosePlan,
  type GitClosePlan,
  type GitOffClosePlan,
  type CloseRepositoryBlocker,
  type CloseWorkspaceEvidence,
  type UncommittedPath,
} from './model';
import { sortedResources } from './resources';
import { readIntegrationCandidates } from './integration-candidates';
import { closeRepositoryMode, type CloseRepositoryMode } from './repository-mode';

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

const TARGET_MISSING =
  'Project Home requires explicit git.integrationTargetBranch configuration before this operation.';

/**
 * The `integration-target-missing` blocker with the local branches that could receive the Close,
 * read without fetching or writing anything. `ownBranch` is the Specification's branch (the Close
 * evidence, else the branch Create recorded for the workspace).
 */
async function targetMissingBlocker(
  registry: WorkspaceRegistry,
  source: WorkspaceRegistration,
  policy: GitWorktreePolicy,
  ownBranch: string | undefined,
): Promise<CloseRepositoryBlocker> {
  const primary = registry.workspaces.find(
    (item) => item.workspaceId === registry.primaryWorkspaceId,
  );
  const branch = ownBranch ?? (source.kind === 'linked' ? source.branch : undefined);

  return {
    kind: 'integration-target-missing',
    sourceCheckout: source.kind,
    // Without a verified primary no branch is offered; the refusal still names it.
    ...(primary?.kind === 'primary'
      ? await readIntegrationCandidates({
          primaryRoot: primary.root,
          source,
          ...(branch ? { ownBranch: branch } : {}),
          branchPattern: policy.branchPattern,
        })
      : { candidates: [], otherBranches: [], otherBranchCount: 0 }),
  };
}

function invalid(message: string): CloseOperationError {
  return new CloseOperationError('CLOSE_PREFLIGHT', message);
}

async function gitValue(root: string, args: readonly string[], reason: string): Promise<string> {
  const value = await executeGit(root, args);
  const result = value.stdout.trim();
  if (value.exitCode !== 0 || !result) {
    throw invalid(reason);
  }

  return result;
}

/**
 * Git can have an unfinished merge/rebase/cherry-pick and an empty porcelain
 * status (e.g. an empty-content merge --no-commit). Verify Git admin state
 * rather than trusting a clean index as evidence that no operation is active.
 */
async function requireNoGitOperation(root: string, role?: CloseCheckoutRole): Promise<void> {
  const unfinished = (message: string) =>
    new CloseOperationError(
      'CLOSE_PREFLIGHT',
      message,
      role ? { repository: [{ kind: 'git-operation-in-progress', checkout: role }] } : {},
    );
  for (const name of ['MERGE_HEAD', 'CHERRY_PICK_HEAD', 'REVERT_HEAD', 'REBASE_HEAD']) {
    const result = await executeGit(root, ['rev-parse', '--verify', '--quiet', name]);
    if (result.exitCode === 0) {
      throw unfinished('Checkout has an unfinished Git operation: ' + name + '.');
    }

    if (result.exitCode !== 1) {
      throw invalid('Cannot inspect Git operation state.');
    }
  }

  for (const name of ['rebase-merge', 'rebase-apply', 'sequencer']) {
    const path = await gitValue(
      root,
      ['rev-parse', '--git-path', name],
      'Cannot resolve Git sequencer directory.',
    );
    try {
      await lstat(resolve(root, path));

      throw unfinished('Checkout has unfinished Git sequencer state: ' + name + '.');
    } catch (error) {
      if (!isMissing(error)) {
        throw error;
      }
    }
  }
}

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

/** A path `git status` reports, with its two-letter status (`??` untracked). */
export interface UncleanPath {
  readonly status: string;
  readonly path: string;
}

/** How many unclean paths a refusal names. */
const UNCLEAN_PATHS_NAMED = REPOSITORY_PATHS_NAMED;

/**
 * Every path `git status` reports as staged, modified, removed or untracked (renames name both
 * paths). Read-only: optional locks are off, so the status does not refresh the index.
 */
export async function listUncleanPaths(root: string): Promise<readonly UncleanPath[]> {
  const state = await executeGit(root, [
    '-c',
    'core.optionalLocks=false',
    'status',
    '--porcelain=v1',
    '-z',
    '--untracked-files=all',
  ]);
  if (state.exitCode !== 0) {
    throw invalid('Git status is unavailable.');
  }

  const fields = state.stdout.split('\0');
  const paths: UncleanPath[] = [];
  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index]!;
    if (field === '') {
      continue;
    }

    const status = field.slice(0, 2);
    paths.push({ status, path: field.slice(3) });
    // A rename or copy is followed by its origin.
    if (status.includes('R') || status.includes('C')) {
      index += 1;
      paths.push({ status, path: fields[index] ?? '' });
    }
  }

  return paths;
}

/** What a clean-tree check knows of the Specification it serves. Absent: every path is `other`. */
export interface CleanTreeCheck {
  /**
   * The checkout-relative directory of the Specification (`specs/active/<slug>`): unclean paths below
   * it (its documents, manifest, Tasks and `.execution`) are named `specification`, the rest `other`.
   */
  readonly specificationDirectory?: string;
  /**
   * Accept that Specification's execution state (`.execution/**`, `tasks/**`): a Specification Close
   * takes it into its archive commit (owner decision 2026-11-12). Needs `specificationDirectory`.
   */
  readonly acceptExecutionState?: boolean;
  /**
   * The checkout's role in the Close preflight: a refusal the owner can fix in the repository then
   * carries its {@link CloseRepositoryBlocker} for that checkout.
   */
  readonly role?: CloseCheckoutRole;
}

/**
 * The unclean paths of a refusal, the Specification's own first (each group in Git's order), with
 * the scope that says whose they are.
 */
function scopedPaths(
  paths: readonly string[],
  directory: string | undefined,
): readonly UncommittedPath[] {
  const own = (path: string) => directory !== undefined && path.startsWith(directory + '/');

  return [
    ...paths.filter(own).map((path) => ({ path, scope: 'specification' as const })),
    ...paths.filter((path) => !own(path)).map((path) => ({ path, scope: 'other' as const })),
  ];
}

/**
 * Read-only: git status may refresh index by default; disable optional locks. Refuses a checkout
 * with an unfinished Git operation, any staged, modified or untracked path (but the accepted
 * execution state) or a HEAD that is not on a local branch.
 */
export async function inspectCleanGitWorkspace(
  workspace: {
    readonly workspaceId: string;
    readonly root: string;
    readonly instanceId?: string;
  },
  check: CleanTreeCheck = {},
): Promise<CloseWorkspaceEvidence> {
  const root = workspace.root;
  const { specificationDirectory: directory, role } = check;
  await requireNoGitOperation(root, role);
  const unclean = (await listUncleanPaths(root))
    .map((entry) => entry.path)
    .filter(
      (path) =>
        !check.acceptExecutionState ||
        directory === undefined ||
        !isExecutionStatePathOf(directory, path),
    );
  if (unclean.length > 0) {
    const named = unclean.slice(0, UNCLEAN_PATHS_NAMED).join(', ');
    const more =
      unclean.length > UNCLEAN_PATHS_NAMED
        ? ` and ${unclean.length - UNCLEAN_PATHS_NAMED} more`
        : '';
    const scoped = scopedPaths(unclean, directory);

    throw new CloseOperationError(
      'CLOSE_PREFLIGHT',
      `Checkout has staged, modified or untracked files: ${named}${more}.`,
      {
        paths: unclean,
        ...(role
          ? {
              repository: [
                {
                  kind: 'uncommitted-changes',
                  checkout: role,
                  workspaceId: workspace.workspaceId,
                  paths: scoped.slice(0, UNCLEAN_PATHS_NAMED),
                  count: unclean.length,
                  specificationCount: scoped.filter((entry) => entry.scope === 'specification')
                    .length,
                },
              ],
            }
          : {}),
      },
    );
  }

  const detached = (message: string) =>
    new CloseOperationError(
      'CLOSE_PREFLIGHT',
      message,
      role ? { repository: [{ kind: 'branch-detached', checkout: role }] } : {},
    );
  const symbolic = await executeGit(root, ['symbolic-ref', '--quiet', 'HEAD']);
  const branchRef = symbolic.stdout.trim();
  // Exit 1 is a detached HEAD; anything else is a repository Git cannot read (not the owner's branch).
  if (symbolic.exitCode === 1) {
    throw detached('Checkout must be on an attached local branch.');
  }

  if (symbolic.exitCode !== 0 || !branchRef) {
    throw invalid('The branch of the checkout cannot be read.');
  }

  if (!branchRef.startsWith('refs/heads/')) {
    throw detached('Checkout branch is not a local ref.');
  }

  const head = await gitValue(
    root,
    ['rev-parse', '--verify', 'HEAD'],
    'Checkout HEAD is unavailable.',
  );
  if (!/^[0-9a-f]{40}(?:[0-9a-f]{24})?$/iu.test(head)) {
    throw invalid('Invalid Git HEAD.');
  }

  return {
    workspaceId: workspace.workspaceId,
    root,
    branch: branchRef.slice('refs/heads/'.length),
    head,
    ...(workspace.instanceId ? { instanceId: workspace.instanceId } : {}),
  };
}

/** The Specification a Close names, its registry snapshot and its (closable) checkout. */
async function resolveCloseSource(engine: SpecFlowEngine, specId: string) {
  const canonical = await resolveSpecification(engine, specId);
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
  if (!sourceWorkspace) {
    throw invalid('Canonical workspace registration disappeared.');
  }

  if (sourceWorkspace.kind === 'linked' && !sourceWorkspace.managed) {
    throw invalid('Unmanaged linked worktree cannot be closed.');
  }

  return { canonical, registry, sourceWorkspace };
}

/** The integration selection of a Specification Close: a boolean, and only for a linked checkout. */
function assertIntegrationSelection(
  request: { readonly integrateToTargetBranch?: boolean },
  linked: boolean,
): void {
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

/**
 * The project Git policy of a Close, read once: the repository mode decided from it
 * ({@link closeRepositoryMode}) with the policy and its revision, or the error that keeps it from
 * being read. An unreadable policy never defaults to a mode: the preflight refuses with its error
 * after the workflow gate and before any repository inspection.
 */
type CloseRepository =
  | {
      readonly mode: CloseRepositoryMode;
      readonly policy: GitWorktreePolicy;
      readonly revision: string;
    }
  | { readonly mode: 'unreadable'; readonly error: unknown };

async function decideCloseRepository(
  engine: SpecFlowEngine,
  request: Parameters<typeof closeRepositoryMode>[1],
): Promise<CloseRepository> {
  let configured: Awaited<ReturnType<typeof readProjectGitPolicy>>;
  try {
    configured = await readProjectGitPolicy(engine.context);
  } catch (error) {
    return { mode: 'unreadable', error };
  }

  return { mode: closeRepositoryMode(configured.policy, request), ...configured };
}

/**
 * The preview of a Specification Close with Git off: the workflow gate and the checkout identity,
 * no Git process and no repository precondition. The plan pins the configuration revision the mode
 * was decided with; the reservation refuses when the policy changed in between.
 */
async function previewCloseWithoutGit(
  engine: SpecFlowEngine,
  request: {
    readonly kind: 'specification-close';
    readonly operationId?: string;
    readonly specId: string;
    readonly integrateToTargetBranch?: boolean;
  },
  configRevision: string,
): Promise<GitOffClosePlan> {
  const operationId = request.operationId ?? randomUUID();
  const { canonical, registry, sourceWorkspace } = await resolveCloseSource(engine, request.specId);
  const linked = sourceWorkspace.kind === 'linked';
  if (canonical.specification.location !== 'active') {
    throw invalid('Only an active Specification can be archived.');
  }

  await assertSpecificationExit(engine.specificationExit, request.specId);
  assertIntegrationSelection(request, linked);
  const binding = registry.specBindings.find((item) => item.specId === request.specId);
  const plan: GitOffClosePlan = {
    kind: 'specification-close',
    gitOff: true,
    operationId,
    specId: request.specId,
    fingerprint: fingerprintCloseIntent({
      kind: 'specification-close',
      operationId,
      specId: request.specId,
      integrateToTargetBranch: false,
    }),
    slug: canonical.specification.slug,
    location: canonical.specification.location,
    registryRevision: registry.revision,
    ...(binding ? { bindingGeneration: binding.generation } : {}),
    source: {
      workspaceId: sourceWorkspace.workspaceId,
      root: sourceWorkspace.root,
      ...(sourceWorkspace.instanceId ? { instanceId: sourceWorkspace.instanceId } : {}),
    },
    ...(linked ? { integrateToTargetBranch: false as const } : {}),
    configRevision,
    resources: [],
  };

  return { ...plan, resources: resourcesForClosePlan(plan, engine.context.project.projectId) };
}

/**
 * Pure read admission: no Git mutation, registry changes, inferred default
 * destination, generated archive commits or workflow/worker fake evidence. A
 * Specification Close is refused with `CLOSE_BLOCKED` while the Specification
 * exit gate (`engine.specificationExit`, D07) reports blockers.
 */
export async function previewCloseOperation(
  engine: SpecFlowEngine,
  request: CloseRequest,
  /** Only the workspace-scoped delegate may bypass exclusive legacy admission. */
  allowShared = false,
): Promise<ClosePlan> {
  if (request.kind === 'workspace-close') {
    return previewWorkspaceClose(engine, request);
  }

  const operationId = request.operationId ?? randomUUID();
  if (request.kind !== 'worktree-close' && request.kind !== 'specification-close') {
    throw new CloseOperationError('CLOSE_INVALID', 'Unknown lifecycle operation kind.');
  }

  if (!isValidSpecificationId(request.specId)) {
    throw new CloseOperationError('CLOSE_INVALID', 'Invalid Specification identity.');
  }

  // The one decision point of the repository mode: with Git off the Close archives in place.
  const repository = await decideCloseRepository(engine, request);
  if (repository.mode === 'git-off' && request.kind === 'specification-close') {
    const configRevision = repository.revision;

    return runGitFreeMutation(() => previewCloseWithoutGit(engine, request, configRevision));
  }

  return previewGitClose(engine, request, operationId, allowShared, repository);
}

/** The preflight of a Specification or Worktree Close with Git (see {@link previewCloseOperation}). */
async function previewGitClose(
  engine: SpecFlowEngine,
  request: Exclude<CloseRequest, { readonly kind: 'workspace-close' }>,
  operationId: string,
  allowShared: boolean,
  repository: CloseRepository,
): Promise<GitClosePlan> {
  const { canonical, registry, sourceWorkspace } = await resolveCloseSource(engine, request.specId);
  const linked = sourceWorkspace.kind === 'linked';

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

    // D07: the workflow decides first, so a refusal lists its blockers before any Git check.
    await assertSpecificationExit(engine.specificationExit, request.specId);
    assertIntegrationSelection(request, linked);
  }

  // After the workflow gate, before any repository inspection: an unreadable policy refuses.
  if (repository.mode === 'unreadable') {
    throw repository.error;
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

  const needsTarget = integrate || !linked;
  const pinned =
    integrate && sourceWorkspace.kind === 'linked'
      ? sourceWorkspace.integrationDestination
      : undefined;
  // The configured default destination is read before the checkout is inspected, so a refusal names
  // every repository precondition the owner has to fix at once, not one per attempt.
  const configured = needsTarget && !pinned ? repository : undefined;
  const targetMissing = configured !== undefined && !configured.policy.integrationTargetBranch;
  // A Specification Close commits the Specification's uncommitted execution state with its archive.
  const specificationDirectory = 'specs/active/' + canonical.specification.slug;
  let source: CloseWorkspaceEvidence;
  try {
    source = await inspectCleanGitWorkspace(sourceWorkspace, {
      specificationDirectory,
      acceptExecutionState: request.kind === 'specification-close',
      role: 'specification',
    });
  } catch (error) {
    // Only a refusal that names repository preconditions takes the missing branch along; any other
    // stays as it is.
    if (
      targetMissing &&
      error instanceof CloseOperationError &&
      error.code === 'CLOSE_PREFLIGHT' &&
      error.repository.length > 0
    ) {
      throw new CloseOperationError('CLOSE_PREFLIGHT', `${error.message} ${TARGET_MISSING}`, {
        paths: error.paths,
        repository: [
          ...error.repository,
          await targetMissingBlocker(registry, sourceWorkspace, configured.policy, undefined),
        ],
      });
    }

    throw error;
  }

  let target: CloseWorkspaceEvidence | undefined;
  let targetBranch: string | undefined;
  let configRevision: string | undefined;
  if (needsTarget) {
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

      target = await inspectCleanGitWorkspace(registration, {
        specificationDirectory,
        role: 'integration-target',
      });
      targetBranch = pinned.branch;
      if (target.branch !== targetBranch) {
        throw new CloseOperationError(
          'CLOSE_PREFLIGHT',
          'Integration destination changed its attached local branch.',
          {
            repository: [
              {
                kind: 'integration-target-branch',
                expectedBranch: pinned.branch,
                branch: target.branch,
              },
            ],
          },
        );
      }
    } else {
      // Legacy/default target: retain the configured primary semantics.
      if (!configured) {
        throw invalid('The project Git policy was not read.');
      }

      targetBranch = configured.policy.integrationTargetBranch;
      if (!targetBranch) {
        throw new CloseOperationError('CLOSE_PREFLIGHT', TARGET_MISSING, {
          repository: [
            await targetMissingBlocker(registry, sourceWorkspace, configured.policy, source.branch),
          ],
        });
      }

      configRevision = configured.revision;
      const primary = registry.workspaces.find(
        (item) => item.workspaceId === registry.primaryWorkspaceId,
      );
      if (primary?.kind !== 'primary') {
        throw invalid('Verified primary workspace is unavailable.');
      }

      const inspected = await inspectRegisteredWorkspace(
        engine.context,
        registry,
        primary.workspaceId,
      );
      if (inspected.status !== 'available') {
        throw invalid('Primary worktree is unavailable.');
      }

      target =
        source.workspaceId === primary.workspaceId
          ? source
          : await inspectCleanGitWorkspace(primary, {
              specificationDirectory,
              role: 'integration-target',
            });
      if (target.branch !== targetBranch) {
        throw new CloseOperationError(
          'CLOSE_PREFLIGHT',
          'Primary worktree is checked out on a different branch from git.integrationTargetBranch.',
          {
            repository: [
              {
                kind: 'integration-target-branch',
                expectedBranch: targetBranch,
                branch: target.branch,
              },
            ],
          },
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
  if (!isValidSpecificationId(request.workspaceId)) {
    throw new CloseOperationError('CLOSE_INVALID', 'Invalid workspace identity.');
  }

  // Refused with Git off (closeRepositoryMode); there is no workflow gate to precede the policy.
  const repository = await decideCloseRepository(engine, request);
  if (repository.mode === 'unreadable') {
    throw repository.error;
  }

  const registry = await engine.readRegistry();
  const workspace = registry.workspaces.find((x) => x.workspaceId === request.workspaceId);
  if (workspace?.kind !== 'linked' || !workspace.managed || !workspace.instanceId) {
    throw invalid('Workspace Close requires a registered, managed linked worktree.');
  }

  // Verify Git membership and the managed incarnation BEFORE reading even
  // one path from the registered root. The inspected canonical root is the
  // only source subsequently passed to the repository manifest reader.
  const inspected = await inspectRegisteredWorkspace(engine.context, registry, request.workspaceId);
  if (inspected.status !== 'available') {
    throw invalid(
      'Managed workspace checkout is unavailable or its incarnation cannot be verified.',
    );
  }

  const bindings = registry.specBindings
    .filter((x) => x.workspaceId === workspace.workspaceId)
    .sort((a, b) => (a.specId < b.specId ? -1 : a.specId > b.specId ? 1 : 0));
  if (bindings.length === 0) {
    throw invalid('Workspace Close requires at least one canonical bound Specification.');
  }

  if (bindings.length > MAX_MANAGED_WORKSPACE_SPECIFICATIONS) {
    throw invalid(
      'Workspace has ' +
        bindings.length +
        ' bound Specifications, exceeding the supported limit of ' +
        MAX_MANAGED_WORKSPACE_SPECIFICATIONS +
        '. Resolve excess bindings before Close; no operation was reserved.',
    );
  }

  const physical = await listWorkspaceSpecifications(inspected.root);
  const byId = new Map(physical.map((item) => [item.specId, item]));
  const occupants = bindings.map((binding) => {
    const manifest = byId.get(binding.specId);
    if (!manifest) {
      throw invalid('Bound canonical Specification is missing from verified checkout.');
    }

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
  const base = await previewGitClose(
    engine,
    { kind: 'worktree-close', operationId, specId: occupants[0]!.specId },
    operationId,
    true,
    repository,
  );
  if (
    base.registryRevision !== registry.revision ||
    base.source.workspaceId !== request.workspaceId
  ) {
    throw new CloseOperationError(
      'CLOSE_CONFLICT',
      'Workspace occupant snapshot changed during preview.',
    );
  }

  const plan: GitClosePlan = {
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

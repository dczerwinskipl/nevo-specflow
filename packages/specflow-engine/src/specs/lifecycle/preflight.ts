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
import { foldPathKey } from '../document-rules/document-paths';
import { listWorkspaceSpecifications } from '../repository';
import { isExecutionStatePathOf } from '../execution-paths';
import { isValidSpecificationId } from '../model';
import {
  CloseOperationError,
  REPOSITORY_PATHS_NAMED,
  assertNoExternalMergeForSpecificationClose,
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
import { readableAttemptCommitHolds } from '../documents/attempt-commit-hold';
import {
  attemptsHolding,
  waitingAttemptCommits,
  type ReadableAttemptCommitHolds,
} from '../uncommitted/attempts';

export type CloseRequest =
  | {
      readonly kind: 'worktree-close';
      readonly operationId?: string;
      readonly specId: string;
      /** Person-initiated: finish after the content was already merged externally (#157). */
      readonly finishAfterExternalMerge?: boolean;
    }
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
      /** Person-initiated: finish after the content was already merged externally (#157). */
      readonly finishAfterExternalMerge?: boolean;
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
   * Other active Specifications' own directories sharing this checkout (#181): a dirty path is also
   * accepted as known when it is execution-state of ONE of these, pre-filtered out of the unclean
   * list before `specificationDirectory`'s `specification`/`other` labelling ever sees it — a
   * sibling's exempted path never reaches a reported blocker's `paths`/`count`.
   */
  readonly siblingDirectories?: readonly string[];
  /**
   * The checkout's role in the Close preflight: a refusal the owner can fix in the repository then
   * carries its {@link CloseRepositoryBlocker} for that checkout.
   */
  readonly role?: CloseCheckoutRole;
  /**
   * The agent attempt commit holds of this checkout (D15, `SpecFlowEngine.attemptCommitHolds`): a
   * path a waiting attempt commit (pending or failed) takes is never accepted, whatever the options
   * above say, so no archive commit takes the agent's work along; the blocker lists those dirty
   * paths under each attempt (retry the attempt commit) and leaves them out of its `paths` and
   * counts.
   */
  readonly holds?: ReadableAttemptCommitHolds;
}

/** One other active Specification's own directory, exempted from a sibling Close's clean-tree check. */
export interface SiblingSpecificationDirectory {
  readonly specId: string;
  readonly directory: string;
}

/**
 * The checkout's other active Specifications' own directories (#181 A2): physically discovered
 * (`listWorkspaceSpecifications`), cross-checked against the registry's `specBindings` for
 * `workspaceId` (Fix 4) — a physically-discovered but unregistered/orphan directory is never
 * exempted; its dirty paths still refuse. Used to widen both the clean-tree check and the ledger
 * hold allowance so neither later refuses what the other already accepted.
 */
export async function siblingSpecificationDirectories(
  root: string,
  workspaceId: string,
  registry: WorkspaceRegistry,
  excludeSpecId: string,
): Promise<readonly SiblingSpecificationDirectory[]> {
  const bound = new Set(
    registry.specBindings
      .filter((binding) => binding.workspaceId === workspaceId && binding.specId !== excludeSpecId)
      .map((binding) => binding.specId),
  );
  if (bound.size === 0) {
    return [];
  }

  const physical = await listWorkspaceSpecifications(root);

  return physical
    .filter(
      (specification) => specification.location === 'active' && bound.has(specification.specId),
    )
    .map((specification) => ({
      specId: specification.specId,
      directory: 'specs/active/' + specification.slug,
    }));
}

/**
 * The unclean paths of a refusal, the Specification's own first (each group in Git's order), with
 * the scope that says whose they are.
 */
export function scopedPaths(
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
 * Whether a dirty path is already known-safe, accepted underneath `CleanTreeCheck`'s
 * `specification`/`other` reporting (#181 A1): the closing Specification's own execution state
 * (`acceptExecutionState`), or execution-state of one of `siblingDirectories` — another active
 * Specification's own directory, never a foreign/client-supplied one; never a path a waiting agent
 * attempt commit takes (`holds`). Pre-filters the unclean list before `scopedPaths`'s labelling ever
 * sees it, so a sibling's exempted path never reaches a reported blocker's `paths`/`count`.
 */
export function isAcceptedDirtyPath(path: string, check: CleanTreeCheck): boolean {
  const { specificationDirectory: directory, acceptExecutionState, siblingDirectories } = check;
  // Folded like every other held-path check (`attemptCommitHeld`): a spelling that differs in case
  // only is the same file on a case-insensitive file system.
  const key = foldPathKey(path);
  if (check.holds?.holds.some((hold) => hold.paths.some((held) => foldPathKey(held) === key))) {
    return false;
  }

  if (acceptExecutionState && directory !== undefined && isExecutionStatePathOf(directory, path)) {
    return true;
  }

  return siblingDirectories?.some((sibling) => isExecutionStatePathOf(sibling, path)) ?? false;
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
    .filter((path) => !isAcceptedDirtyPath(path, check));
  if (unclean.length > 0) {
    // One order everywhere: the Specification's own paths first (message, `paths`, blocker).
    const failed = attemptsHolding(
      check.holds !== undefined ? waitingAttemptCommits(check.holds) : [],
      unclean,
      UNCLEAN_PATHS_NAMED,
    );
    const scoped = scopedPaths(
      unclean.filter((path) => !failed.taken.has(path)),
      directory,
    );
    const ordered = scopedPaths(unclean, directory).map((entry) => entry.path);
    const named = ordered.slice(0, UNCLEAN_PATHS_NAMED).join(', ');
    const more =
      unclean.length > UNCLEAN_PATHS_NAMED
        ? ` and ${unclean.length - UNCLEAN_PATHS_NAMED} more`
        : '';

    throw new CloseOperationError(
      'CLOSE_PREFLIGHT',
      `Checkout has staged, modified or untracked files: ${named}${more}.`,
      {
        paths: ordered,
        ...(role
          ? {
              repository: [
                {
                  kind: 'uncommitted-changes',
                  checkout: role,
                  workspaceId: workspace.workspaceId,
                  paths: scoped.slice(0, UNCLEAN_PATHS_NAMED),
                  count: scoped.length,
                  specificationCount: scoped.filter((entry) => entry.scope === 'specification')
                    .length,
                  ...(failed.attempts.length > 0 ? { attempts: failed.attempts.slice(0, 8) } : {}),
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
  request: {
    readonly integrateToTargetBranch?: boolean;
    readonly finishAfterExternalMerge?: boolean;
  },
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

  assertFinishAfterExternalMerge(request, linked);
}

/**
 * Person-initiated finish-after-external-merge selection (#157): a boolean, only for a linked
 * checkout, and never alongside an explicit archive-only selection (it reuses the integrated
 * disposal path, so it is contradictory without integration).
 */
function assertFinishAfterExternalMerge(
  request: {
    readonly integrateToTargetBranch?: boolean;
    readonly finishAfterExternalMerge?: boolean;
  },
  linked: boolean,
): void {
  if (
    request.finishAfterExternalMerge !== undefined &&
    typeof request.finishAfterExternalMerge !== 'boolean'
  ) {
    throw new CloseOperationError('CLOSE_INVALID', 'Invalid external-merge finish selection.');
  }

  if (!linked && request.finishAfterExternalMerge === true) {
    throw new CloseOperationError(
      'CLOSE_INVALID',
      'External-merge finish is not applicable in primary.',
    );
  }

  if (request.finishAfterExternalMerge === true && request.integrateToTargetBranch === false) {
    throw new CloseOperationError(
      'CLOSE_INVALID',
      'External-merge finish is not applicable to an archive-only Close.',
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
      // Specification Close never carries finishAfterExternalMerge at all (owner decision
      // 2026-11-20; enforced above by `assertNoExternalMergeForSpecificationClose`), so a Git-off
      // Close's intent, like every other Specification Close intent, never includes it.
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

  // Before any Git/registry read: Specification Close never supports this mode (owner decision
  // 2026-11-20), so a request that carries it is refused unconditionally, regardless of repository
  // mode (Git on or off) or checkout role (primary or linked).
  assertNoExternalMergeForSpecificationClose(request);

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

  if (request.kind === 'worktree-close') {
    assertFinishAfterExternalMerge(request, linked);
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
  // #181: another active Specification's own pending execution state in this shared checkout does
  // not block an archive-only/exclusive Close of this one (sibling-isolation, A2).
  const siblings = await siblingSpecificationDirectories(
    sourceWorkspace.root,
    sourceWorkspace.workspaceId,
    registry,
    request.specId,
  );
  let source: CloseWorkspaceEvidence;
  try {
    source = await inspectCleanGitWorkspace(sourceWorkspace, {
      specificationDirectory,
      acceptExecutionState: request.kind === 'specification-close',
      siblingDirectories: siblings.map((entry) => entry.directory),
      role: 'specification',
      holds: await readableAttemptCommitHolds(engine, sourceWorkspace.workspaceId),
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

      // Paths are scoped only in the Specification's own checkout; here every path is `other`.
      target = await inspectCleanGitWorkspace(registration, { role: 'integration-target' });
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
          : await inspectCleanGitWorkspace(primary, { role: 'integration-target' });
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
  // Specification Close never carries finishAfterExternalMerge (owner decision 2026-11-20; refused
  // unconditionally by `assertNoExternalMergeForSpecificationClose` before this function ever runs):
  // only Worktree Close varies on it.
  const finishAfterExternalMerge =
    request.kind === 'worktree-close' && request.finishAfterExternalMerge === true;
  const normalized =
    request.kind === 'worktree-close'
      ? {
          kind: 'worktree-close' as const,
          operationId,
          specId: request.specId,
          finishAfterExternalMerge,
        }
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
    ...(finishAfterExternalMerge ? { finishAfterExternalMerge: true as const } : {}),
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

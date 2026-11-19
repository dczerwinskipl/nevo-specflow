import { createHash } from 'node:crypto';

import { validateOperationId } from '../create/journal';
import { isValidSpecificationId } from '../model';
import type { SpecificationExitBlocker, SpecificationExitGuard } from './exit-guard';

export type CloseKind = 'worktree-close' | 'specification-close' | 'workspace-close';

export type CloseIntent =
  | {
      readonly kind: 'workspace-close';
      readonly operationId: string;
      readonly workspaceId: string;
    }
  | {
      readonly kind: 'worktree-close';
      readonly operationId: string;
      readonly specId: string;
    }
  | {
      readonly kind: 'specification-close';
      readonly operationId: string;
      readonly specId: string;
      readonly integrateToTargetBranch: boolean;
    };

export type CloseStage =
  | 'reserved'
  | 'archive-initiated'
  | 'archive-commit-initiated'
  | 'archive-committed'
  | 'integration-preparation-initiated'
  | 'integration-scratch-initiated'
  | 'integration-scratch-candidate'
  | 'integration-scratch-conflict'
  | 'integration-publish-initiated'
  | 'integration-verified'
  | 'binding-rebound'
  | 'disposal-initiated'
  | 'completed'
  | 'archived-linked-awaiting-integration'
  | 'recovery-required';

export type CloseOutcome =
  | 'integrated-and-removed'
  | 'archive-only-closed'
  | 'archived-linked-awaiting-integration'
  | 'archived-in-primary'
  | 'worktree-integrated-and-removed'
  /** Git is off for the project: the Specification was archived in place, nothing committed or merged. */
  | 'archived-without-git';

/** The registered identity of a checkout, without any Git fact (a Close with Git off). */
export interface CloseCheckoutEvidence {
  readonly workspaceId: string;
  readonly root: string;
  readonly instanceId?: string;
}

export interface CloseWorkspaceEvidence extends CloseCheckoutEvidence {
  readonly branch: string;
  readonly head: string;
}

/** Pinned canonical occupants; a workspace-scoped Close never derives its set from one specId. */
export interface CloseOccupant {
  readonly specId: string;
  readonly slug: string;
  readonly location: 'active' | 'archive';
  readonly status: string;
  readonly bindingGeneration: number;
}

interface ClosePlanIdentity {
  readonly operationId: string;
  /** Exclusive legacy close anchor; on workspace close the first snapshot occupant. */
  readonly specId: string;
  readonly fingerprint: string;
  readonly slug: string;
  readonly location: 'active' | 'archive';
  readonly registryRevision: number;
  readonly bindingGeneration?: number;
  readonly resources: readonly string[];
}

/** A Close the Engine performs with Git: archive commit, optional integration and disposal. */
export interface GitClosePlan extends ClosePlanIdentity {
  readonly kind: CloseKind;
  readonly gitOff?: never;
  readonly workspaceId?: string;
  readonly occupants?: readonly CloseOccupant[];
  readonly source: CloseWorkspaceEvidence;
  readonly target?: CloseWorkspaceEvidence;
  readonly targetBranch?: string;
  readonly integrateToTargetBranch?: boolean;
  readonly configRevision?: string;
}

/**
 * A Specification Close in a project with Git off (`git.enabled: false` or no `git:` block, owner
 * decision 2026-11-17): the Specification is archived in place in its checkout, with no commit, no
 * integration and no repository precondition. `configRevision` pins the policy that decided it.
 * `integrateToTargetBranch` is `false` for a linked checkout and absent in the primary.
 */
export interface GitOffClosePlan extends ClosePlanIdentity {
  readonly kind: 'specification-close';
  readonly gitOff: true;
  readonly workspaceId?: never;
  readonly occupants?: never;
  readonly source: CloseCheckoutEvidence;
  readonly target?: never;
  readonly targetBranch?: never;
  readonly integrateToTargetBranch?: false;
  readonly configRevision: string;
}

export type ClosePlan = GitClosePlan | GitOffClosePlan;

/** Durable proof pinned before any subsequent Git publication attempt. */
export interface CloseIntegrationPreparation {
  readonly sourceCommit: string;
  readonly targetCommit: string;
  readonly mergeBaseCommit: string;
  readonly sourceTree: string;
  readonly targetTree: string;
  readonly relationship: 'already-integrated' | 'fast-forward' | 'divergent';
  /** Absent before verified publication, immutable once present. */
  readonly publishedCommit?: string;
}

/** Persisted before creating the detached integration checkout. */
export interface CloseIntegrationScratch {
  /** Deterministically derived below the ignored Project Home state root. */
  readonly root: string;
  /** An immutable marker binds this physical checkout incarnation to the operation. */
  readonly instanceId: string;
  /** Only after a complete two-parent, exact-tree candidate proof. */
  readonly candidateCommit?: string;
  readonly candidateTree?: string;
  /** Known unmerged index evidence, never treated as successful integration. */
  readonly conflictPaths?: readonly string[];
  readonly conflictIndexHash?: string;
}

export interface CloseArchiveInventory {
  readonly relativePath: string;
  readonly sha256: string;
}

/** The move of `specs/active/<slug>` to `specs/archive/<slug>`, pinned before it is made. */
export interface CloseArchiveMove {
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly files: readonly CloseArchiveInventory[];
  readonly archivedManifestSha256: string;
}

export interface CloseArchiveEvidence extends CloseArchiveMove {
  readonly sourceCommit: string;
  readonly committedHead?: string;
  readonly committedTree?: string;
}

export interface CloseJournal {
  readonly version: 1;
  readonly projectId: string;
  readonly gitInstanceId: string;
  readonly stage: CloseStage;
  readonly plan: ClosePlan;
  /** Registry CAS revision after verified handover. */
  readonly reboundRevision?: number;
  readonly archive?: CloseArchiveEvidence;
  /** A Close with Git off only ({@link GitOffClosePlan}): the archive move, no commit evidence. */
  readonly archiveMove?: CloseArchiveMove;
  readonly integration?: CloseIntegrationPreparation;
  readonly scratch?: CloseIntegrationScratch;
  readonly outcome?: CloseOutcome;
  readonly reason?: string;
  /** Operator-proven removal of retained conflict scratch; original intent stays immutable. */
  readonly scratchRetired?: true;
}

/** Intent fingerprint is independent of git defaults and mutable filesystem state. */
export function fingerprintCloseIntent(input: CloseIntent): string {
  validateOperationId(input.operationId);

  return createHash('sha256').update(JSON.stringify(input), 'utf8').digest('hex');
}

export function normalizeCloseIntent(input: CloseIntent): CloseIntent {
  validateOperationId(input.operationId);
  if (input.kind === 'workspace-close') {
    if (!isValidSpecificationId(input.workspaceId)) {
      throw new CloseOperationError('CLOSE_INVALID', 'Invalid workspace identity.');
    }

    return {
      kind: 'workspace-close',
      operationId: input.operationId,
      workspaceId: input.workspaceId,
    };
  }

  if (!isValidSpecificationId(input.specId)) {
    throw new CloseOperationError('CLOSE_INVALID', 'Invalid Specification identity.');
  }

  if (input.kind === 'worktree-close') {
    return { kind: 'worktree-close', operationId: input.operationId, specId: input.specId };
  }

  if (input.kind === 'specification-close' && typeof input.integrateToTargetBranch === 'boolean') {
    return {
      kind: 'specification-close',
      operationId: input.operationId,
      specId: input.specId,
      integrateToTargetBranch: input.integrateToTargetBranch,
    };
  }

  throw new CloseOperationError('CLOSE_INVALID', 'Invalid lifecycle operation kind or options.');
}

/** Derived resource identities must agree with persisted intent, not a forged list. */
export function resourcesForClosePlan(plan: ClosePlan, projectId: string): readonly string[] {
  // Without Git there is no branch to hold: the Specification and its checkout only.
  if (plan.gitOff) {
    return ['checkout:' + plan.source.workspaceId, 'spec:' + plan.specId].sort();
  }

  const integrate =
    plan.kind === 'worktree-close' ||
    plan.kind === 'workspace-close' ||
    plan.integrateToTargetBranch === true;
  const values = [
    ...(plan.kind === 'workspace-close'
      ? (plan.occupants ?? []).map((occupant) => 'spec:' + occupant.specId)
      : ['spec:' + plan.specId]),
    'checkout:' + plan.source.workspaceId,
    'ref:refs/heads/' + plan.source.branch.toLowerCase(),
    ...(plan.target && plan.target.workspaceId !== plan.source.workspaceId
      ? [
          'checkout:' + plan.target.workspaceId,
          'ref:refs/heads/' + plan.target.branch.toLowerCase(),
        ]
      : []),
    ...(plan.source.instanceId && integrate ? ['git-worktree-admin:' + projectId] : []),
  ];

  return [...new Set(values)].sort();
}

export type CloseOperationErrorCode =
  | 'CLOSE_INVALID'
  | 'CLOSE_CONFLICT'
  | 'CLOSE_UNAVAILABLE'
  | 'CLOSE_PREFLIGHT'
  /** The workflow of the Specification is not finished (D07); `blockers` lists what holds it. */
  | 'CLOSE_BLOCKED'
  | 'CLOSE_SHARED_WORKTREE'
  | 'CLOSE_RECOVERY_REQUIRED'
  /**
   * Resumable stop before disposal: the worktree's `.nevo/local/config.yaml` is not the unchanged
   * copy Create made. The user moves or deletes it, then resumes the same Close.
   */
  | 'CLOSE_LOCAL_CONFIG_MODIFIED'
  | 'CLOSE_JOURNAL_CORRUPT';

/**
 * Why `CLOSE_LOCAL_CONFIG_MODIFIED` refused: the copy was edited, the Engine never copied the
 * file, or the file or its copy record cannot be read. Carries no path or content.
 */
export type CloseLocalConfigRefusal = 'changed' | 'unrecorded' | 'unreadable';

/**
 * A repository precondition of a Close the owner can fix in the repository (`CLOSE_PREFLIGHT`):
 * - `uncommitted-changes`: the checkout has staged, modified or untracked files (`paths`, at most
 *   {@link REPOSITORY_PATHS_NAMED}, the Specification's own first; `count` is the total and
 *   `specificationCount` how many of them are the Specification's) that a Close does not take along;
 * - `integration-target-missing`: the project uses Git but configures no
 *   `git.integrationTargetBranch`; it names the local branches that could receive the Close
 *   ({@link IntegrationBranchCandidates}), none chosen (with Git off a Close archives in place and
 *   has no repository precondition);
 * - `integration-target-branch`: the primary checkout is on `branch`, not on `expectedBranch`;
 * - `git-operation-in-progress`: a merge, rebase, cherry-pick or revert is unfinished;
 * - `branch-detached`: the checkout is not on a local branch.
 * `checkout` names which checkout: the Specification's own or the one it is integrated into.
 */
export type CloseRepositoryBlocker =
  | {
      readonly kind: 'uncommitted-changes';
      readonly checkout: CloseCheckoutRole;
      /** The registered workspace of that checkout, where the owner commits the files. */
      readonly workspaceId: string;
      readonly paths: readonly UncommittedPath[];
      readonly count: number;
      readonly specificationCount: number;
    }
  | ({
      readonly kind: 'integration-target-missing';
      /**
       * The Specification's checkout: `linked` merges its branch into the integration branch,
       * `primary` archives directly on it in the main folder (nothing to merge).
       */
      readonly sourceCheckout: 'primary' | 'linked';
    } & IntegrationBranchCandidates)
  | {
      readonly kind: 'integration-target-branch';
      readonly expectedBranch: string;
      readonly branch: string;
    }
  | { readonly kind: 'git-operation-in-progress'; readonly checkout: CloseCheckoutRole }
  | { readonly kind: 'branch-detached'; readonly checkout: CloseCheckoutRole };

export type CloseCheckoutRole = 'specification' | 'integration-target';

/**
 * One uncommitted path of an `uncommitted-changes` blocker, checkout-relative. `specification`: below
 * the Specification's own directory (`specs/active/<slug>/`: its documents, manifest, Tasks and
 * `.execution`); `other`: anywhere else in the checkout (another Specification, project files).
 */
export interface UncommittedPath {
  readonly path: string;
  readonly scope: 'specification' | 'other';
}

/**
 * Why a local branch is offered as the integration branch, in this order:
 * - `remote-default`: the default branch of a remote, read from the local `refs/remotes/<remote>/HEAD`
 *   (never fetched);
 * - `started-from`: the branch the Specification's linked workspace was created from (recorded at
 *   Create; the workspace may hold other Specifications too);
 * - `primary-checkout`: the branch checked out in the primary checkout (the main folder).
 */
export type IntegrationBranchFact = 'remote-default' | 'started-from' | 'primary-checkout';

/**
 * A local branch with its facts (at least one, each once, in {@link IntegrationBranchFact} order).
 * `remote` is present exactly with the `remote-default` fact: the remote whose default branch it is
 * (`origin` first).
 */
export type IntegrationBranchCandidate =
  | {
      readonly branch: string;
      readonly facts: readonly IntegrationBranchFact[];
      readonly remote: string;
    }
  | {
      readonly branch: string;
      readonly facts: readonly Exclude<IntegrationBranchFact, 'remote-default'>[];
      readonly remote?: never;
    };

/**
 * The local branches a missing `git.integrationTargetBranch` can be set to. Facts only: nothing is
 * preselected and no name (`main` included) is assumed.
 */
export interface IntegrationBranchCandidates {
  /** Ordered by their first fact, at most {@link INTEGRATION_CANDIDATES_NAMED}; may be empty. */
  readonly candidates: readonly IntegrationBranchCandidate[];
  /**
   * The remaining local branches by name, without the candidates, the Specification's own linked
   * branch and branches `git.worktrees.branchPattern` names; at most
   * {@link OTHER_BRANCHES_NAMED} of `otherBranchCount`.
   */
  readonly otherBranches: readonly string[];
  readonly otherBranchCount: number;
}

/** How many candidates an `integration-target-missing` blocker names. */
export const INTEGRATION_CANDIDATES_NAMED = 50;

/** How many other local branches an `integration-target-missing` blocker names. */
export const OTHER_BRANCHES_NAMED = 200;

/** How many unclean paths a repository blocker names. */
export const REPOSITORY_PATHS_NAMED = 10;

export class CloseOperationError extends Error {
  readonly code: CloseOperationErrorCode;
  /** `CLOSE_BLOCKED`: the grouped blockers of the Specification exit gate; empty otherwise. */
  readonly blockers: readonly SpecificationExitBlocker[];
  /** `CLOSE_PREFLIGHT` of a dirty checkout: the paths that are not clean; empty otherwise. */
  readonly paths: readonly string[];
  /** Present only for `CLOSE_LOCAL_CONFIG_MODIFIED`. */
  readonly localConfig?: CloseLocalConfigRefusal;
  /** `CLOSE_PREFLIGHT`: the repository preconditions the owner can fix; empty otherwise. */
  readonly repository: readonly CloseRepositoryBlocker[];

  constructor(
    code: CloseOperationErrorCode,
    message: string,
    details: {
      readonly blockers?: readonly SpecificationExitBlocker[];
      readonly paths?: readonly string[];
      readonly localConfig?: CloseLocalConfigRefusal;
      readonly repository?: readonly CloseRepositoryBlocker[];
    } = {},
  ) {
    super(message);
    this.name = 'CloseOperationError';
    this.code = code;
    this.blockers = details.blockers ?? [];
    this.paths = details.paths ?? [];
    this.repository = details.repository ?? [];
    if (details.localConfig) {
      this.localConfig = details.localConfig;
    }
  }
}

/** Refuse with `CLOSE_BLOCKED` while the Specification exit gate reports blockers. */
export async function assertSpecificationExit(
  guard: SpecificationExitGuard,
  specId: string,
): Promise<void> {
  const blockers = await guard(specId);
  if (blockers.length > 0) {
    throw new CloseOperationError(
      'CLOSE_BLOCKED',
      'The Specification workflow is not finished: ' +
        blockers.map((blocker) => blocker.kind).join(', ') +
        '.',
      { blockers },
    );
  }
}

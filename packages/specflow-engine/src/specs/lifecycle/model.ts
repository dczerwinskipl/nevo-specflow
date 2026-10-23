import { createHash } from 'node:crypto';

import { validateOperationId } from '../create/journal';
import { isValidSpecificationId } from '../model';

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
  | 'worktree-integrated-and-removed';

export interface CloseWorkspaceEvidence {
  readonly workspaceId: string;
  readonly root: string;
  readonly branch: string;
  readonly head: string;
  readonly instanceId?: string;
}

/** Pinned canonical occupants; a workspace-scoped Close never derives its set from one specId. */
export interface CloseOccupant {
  readonly specId: string;
  readonly slug: string;
  readonly location: 'active' | 'archive';
  readonly status: string;
  readonly bindingGeneration: number;
}

export interface ClosePlan {
  readonly kind: CloseKind;
  readonly operationId: string;
  /** Exclusive legacy close anchor; on workspace close the first snapshot occupant. */
  readonly specId: string;
  readonly workspaceId?: string;
  readonly occupants?: readonly CloseOccupant[];
  readonly fingerprint: string;
  readonly slug: string;
  readonly location: 'active' | 'archive';
  readonly registryRevision: number;
  readonly bindingGeneration?: number;
  readonly source: CloseWorkspaceEvidence;
  readonly target?: CloseWorkspaceEvidence;
  readonly targetBranch?: string;
  readonly integrateToTargetBranch?: boolean;
  readonly configRevision?: string;
  readonly resources: readonly string[];
}

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

export interface CloseArchiveEvidence {
  readonly sourceCommit: string;
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly files: readonly CloseArchiveInventory[];
  readonly archivedManifestSha256: string;
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
  | 'CLOSE_SHARED_WORKTREE'
  | 'CLOSE_RECOVERY_REQUIRED'
  | 'CLOSE_JOURNAL_CORRUPT';

export class CloseOperationError extends Error {
  readonly code: CloseOperationErrorCode;

  constructor(code: CloseOperationErrorCode, message: string) {
    super(message);
    this.name = 'CloseOperationError';
    this.code = code;
  }
}

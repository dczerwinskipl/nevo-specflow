import type { CloseRefusalBlocker, RepositoryBlocker } from '@nevo/specflow-contracts/specs';
import type { CloseSpecificationResult } from '../api';
import { workflowRefusalKey, type WorkflowRefusal } from '../refusal';

/**
 * The one outcome the Close dialog presents (never two at once):
 * - `blocked`: what holds the Close (workflow, running Sessions, repository preconditions), with
 *   only Dismiss;
 * - `checking`: the preview runs the repository checks; the confirm waits for it;
 * - `cannot-start`: the preview refused for a reason that is not a blocker list;
 * - `not-closed`: the Close itself was refused (the same planned Close may be confirmed again);
 * - `needs-attention`: the Close ran but did not complete;
 * - `ready`: the preview planned the Close; the confirm sends it.
 */
export type CloseDialogOutcome =
  | {
      readonly kind: 'blocked';
      readonly blockers: readonly CloseRefusalBlocker[];
      readonly repository: readonly RepositoryBlocker[];
    }
  | { readonly kind: 'checking' }
  | { readonly kind: 'cannot-start'; readonly reasonKey: CloseRefusalKey }
  | { readonly kind: 'not-closed'; readonly reasonKey: CloseRefusalKey }
  | {
      readonly kind: 'needs-attention';
      readonly status: Exclude<CloseSpecificationResult['status'], 'completed'>;
    }
  | { readonly kind: 'ready' };

export interface CloseDialogFacts {
  /** The workflow blockers of the projection; the preview is not read while there are any. */
  readonly workflowBlockers?: readonly CloseRefusalBlocker[];
  /** The running Sessions read beside the workflow blockers. */
  readonly occupancyBlockers?: readonly CloseRefusalBlocker[];
  readonly preview:
    | { readonly status: 'pending' }
    | { readonly status: 'error'; readonly refusal: WorkflowRefusal }
    | { readonly status: 'success' };
  readonly close:
    | { readonly status: 'idle' | 'pending' }
    | { readonly status: 'error'; readonly refusal: WorkflowRefusal }
    | { readonly status: 'success'; readonly result: CloseSpecificationResult };
}

function blockedBy(refusal: WorkflowRefusal | undefined): CloseDialogOutcome | undefined {
  if (!refusal) {
    return undefined;
  }

  const blockers = refusal.code === 'CLOSE_BLOCKED' ? refusal.blockers : [];
  if (blockers.length === 0 && refusal.repository.length === 0) {
    return undefined;
  }

  return { kind: 'blocked', blockers, repository: refusal.repository };
}

export function closeDialogOutcome(facts: CloseDialogFacts): CloseDialogOutcome {
  if (facts.workflowBlockers) {
    return {
      kind: 'blocked',
      blockers: [...facts.workflowBlockers, ...(facts.occupancyBlockers ?? [])],
      repository: [],
    };
  }

  const closeRefusal = facts.close.status === 'error' ? facts.close.refusal : undefined;
  const previewRefusal = facts.preview.status === 'error' ? facts.preview.refusal : undefined;
  const blocked = blockedBy(closeRefusal) ?? blockedBy(previewRefusal);
  if (blocked) {
    return blocked;
  }

  if (closeRefusal) {
    return { kind: 'not-closed', reasonKey: closeRefusalKey(closeRefusal) };
  }

  if (facts.close.status === 'success' && facts.close.result.status !== 'completed') {
    return { kind: 'needs-attention', status: facts.close.result.status };
  }

  if (previewRefusal) {
    return { kind: 'cannot-start', reasonKey: closeRefusalKey(previewRefusal) };
  }

  return facts.preview.status === 'pending' ? { kind: 'checking' } : { kind: 'ready' };
}

export type CloseRefusalKey =
  | ReturnType<typeof workflowRefusalKey>
  | `workflowExecution.close.refusal.${
      | 'preflight'
      | 'sharedWorktree'
      | 'conflict'
      | 'unavailable'
      | 'recovery'
      | 'gitConfig'
      | 'git'
      | 'documentsPending'
      | 'commitBlocked'
      | 'engine'
      | 'unknown'}`;

/**
 * The one sentence that explains a refused Close preview or Close by its stable code; a refusal the
 * workflow vocabulary does not know is never "the workflow did not change".
 */
export function closeRefusalKey(refusal: WorkflowRefusal): CloseRefusalKey {
  if (refusal.outcomeUnknown) {
    return workflowRefusalKey(refusal);
  }

  switch (refusal.code) {
    case 'CLOSE_PREFLIGHT':
    case 'CLOSE_INVALID':
      return 'workflowExecution.close.refusal.preflight';
    case 'CLOSE_SHARED_WORKTREE':
      return 'workflowExecution.close.refusal.sharedWorktree';
    case 'CLOSE_CONFLICT':
    case 'REGISTRY_CONFLICT':
    case 'SPEC_CONFLICT':
      return 'workflowExecution.close.refusal.conflict';
    case 'CLOSE_UNAVAILABLE':
    case 'SPEC_NOT_FOUND':
    case 'SPEC_SOURCE_INVALID':
      return 'workflowExecution.close.refusal.unavailable';
    case 'CLOSE_RECOVERY_REQUIRED':
    case 'CLOSE_JOURNAL_CORRUPT':
    case 'REGISTRY_RECOVERY_REQUIRED':
      return 'workflowExecution.close.refusal.recovery';
    case 'GIT_POLICY_INVALID':
    case 'GIT_BASE_CONFIG_MISSING':
      return 'workflowExecution.close.refusal.gitConfig';
    case 'GIT_DISABLED':
    case 'GIT_UNAVAILABLE':
    case 'NOT_GIT_REPOSITORY':
    case 'GIT_OPERATION_FAILED':
    case 'GIT_OPERATION_UNCERTAIN':
      return 'workflowExecution.close.refusal.git';
    case 'DOCUMENT_COMMITS_PENDING':
      return 'workflowExecution.close.refusal.documentsPending';
    case 'BRANCH_PROTECTED':
    case 'COMMIT_BLOCKED':
    case 'COMMIT_FAILED':
      return 'workflowExecution.close.refusal.commitBlocked';
    case 'ENGINE_UNAVAILABLE':
      return 'workflowExecution.close.refusal.engine';
    default: {
      const key = workflowRefusalKey(refusal);

      return key === 'workflowExecution.refusal.generic'
        ? 'workflowExecution.close.refusal.unknown'
        : key;
    }
  }
}

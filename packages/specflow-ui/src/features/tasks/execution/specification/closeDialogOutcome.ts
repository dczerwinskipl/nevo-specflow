import type { UncommittedHoldDetails } from '@nevo/specflow-contracts/documents';
import type {
  CloseMerge,
  CloseRefusalBlocker,
  RepositoryBlocker,
} from '@nevo/specflow-contracts/specs';
import type { CloseSpecificationResult } from '../api';
import { workflowRefusalKey, type WorkflowRefusal } from '../refusal';

/**
 * The one outcome the Close dialog presents (never two at once; "ready" never while a check is
 * pending, failed or blocking, or after a refusal):
 * - `blocked`: what holds the Close (workflow, running Sessions, repository preconditions); the
 *   repository ones are checked again on request;
 * - `checking`: the preview runs the repository checks (also after "Check again"), or
 *   (`documents`) waits for saved documents that are still being committed and is read again
 *   ({@link waitsForDocumentCommits}); nothing can be confirmed;
 * - `held`: files SpecFlow wrote and did not commit hold the Close (`DOCUMENT_COMMITS_PENDING`,
 *   `commit-uncommitted`, from the preview or the Close): an explained blocking state with its
 *   owners and how to resolve it, checked again on request, never a failed check;
 * - `cannot-start`: the check failed: the preview refused for a reason that is not a blocker list,
 *   or could not be read;
 * - `not-closed`: the Close itself was refused for a reason that is not a blocker list;
 * - `needs-attention`: the Close ran but did not complete;
 * - `closing`: the confirmed Close runs (the planned facts stay on screen, read-only);
 * - `ready`: the preview planned the Close and what it merges; the confirm sends it.
 */
export type CloseDialogOutcome =
  | {
      readonly kind: 'blocked';
      readonly blockers: readonly CloseRefusalBlocker[];
      readonly repository: readonly RepositoryBlocker[];
    }
  | { readonly kind: 'checking'; readonly waitingFor?: 'documents' }
  | {
      readonly kind: 'held';
      /** How to resolve it, by the ledger facts. */
      readonly reasonKey: CloseRefusalKey;
      /** Whose files hold the Close, to list under the reason; absent without the facts. */
      readonly uncommitted?: UncommittedHoldDetails;
    }
  | { readonly kind: 'cannot-start'; readonly reasonKey: CloseRefusalKey }
  | { readonly kind: 'not-closed'; readonly reasonKey: CloseRefusalKey }
  | {
      readonly kind: 'needs-attention';
      readonly status: Exclude<CloseSpecificationResult['status'], 'completed'>;
    }
  | { readonly kind: 'closing'; readonly merge: CloseMerge }
  | { readonly kind: 'ready'; readonly merge: CloseMerge };

export interface CloseDialogFacts {
  /** The workflow blockers of the projection; the preview is not read while there are any. */
  readonly workflowBlockers?: readonly CloseRefusalBlocker[];
  /** The running Sessions read beside the workflow blockers. */
  readonly occupancyBlockers?: readonly CloseRefusalBlocker[];
  /** `pending` also while the preview is read again after "Check again". */
  readonly preview:
    | { readonly status: 'pending' }
    | {
        readonly status: 'error';
        readonly refusal: WorkflowRefusal;
        /** The preview was read again for document commits as often as it is, without a change. */
        readonly documentRechecksExhausted?: boolean;
      }
    | { readonly status: 'success'; readonly merge: CloseMerge };
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

  const held = heldBy(closeRefusal) ?? heldBy(previewRefusal);
  if (held) {
    return held;
  }

  if (closeRefusal) {
    return { kind: 'not-closed', reasonKey: closeRefusalKey(closeRefusal) };
  }

  if (facts.close.status === 'success' && facts.close.result.status !== 'completed') {
    return { kind: 'needs-attention', status: facts.close.result.status };
  }

  if (
    previewRefusal &&
    waitsForDocumentCommits(previewRefusal) &&
    !(facts.preview.status === 'error' && facts.preview.documentRechecksExhausted)
  ) {
    return { kind: 'checking', waitingFor: 'documents' };
  }

  if (previewRefusal) {
    return { kind: 'cannot-start', reasonKey: closeRefusalKey(previewRefusal) };
  }

  if (facts.preview.status !== 'success') {
    return { kind: 'checking' };
  }

  return facts.close.status === 'pending'
    ? { kind: 'closing', merge: facts.preview.merge }
    : { kind: 'ready', merge: facts.preview.merge };
}

/**
 * A preview refused only because saved documents are still queued for their automatic commit: the
 * queue settles by itself, so the dialog reads the preview again instead of showing a blocker.
 * Manual-mode (`commit-uncommitted`) and failed commits are blockers the owner resolves.
 */
export function waitsForDocumentCommits(refusal: WorkflowRefusal): boolean {
  return refusal.code === 'DOCUMENT_COMMITS_PENDING' && refusal.documentCause === 'commit-pending';
}

/**
 * How the preview is read again while it waits for document commits: every `intervalMs`, at most
 * `attempts` times (about 30 s). A commit that never settles (a crashed write keeps its journal
 * pending) then shows as a refusal with a way to check again, never as an endless wait.
 */
export interface DocumentCommitRecheck {
  readonly intervalMs: number;
  readonly attempts: number;
}

export const DOCUMENT_COMMIT_RECHECK: DocumentCommitRecheck = { intervalMs: 1500, attempts: 20 };

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
      | 'documentsUncommitted'
      | 'workflowStateUncommitted'
      | 'workflowStateUncommittedStep'
      | 'uncommittedAbandoned'
      | 'uncommittedGit'
      | 'agentCommitFailed'
      | 'documentsFailed'
      | 'commitBlocked'
      | 'engine'
      | 'unknown'}`;

/**
 * Why the Engine's uncommitted files hold the Close, from the facts the refusal carries: an abandoned
 * commit, the workflow state (Tasks, step progress) of another specification that only its next step
 * finish commits, or saved documents (also the answer when the facts are missing).
 */
function uncommittedKey(hold: UncommittedHoldDetails | undefined): CloseRefusalKey {
  // Only agent work whose commit failed: Retry commit is the way forward, not Git.
  if (hold?.owners.length === 0 && hold.unreadable === 0 && (hold.attempts?.length ?? 0) > 0) {
    return 'workflowExecution.close.refusal.agentCommitFailed';
  }

  // Facts SpecFlow cannot act on (definitions, unreadable records, mixed causes, none at all): Git.
  const specifications = hold?.owners.flatMap((owner) =>
    owner.kind === 'specification' ? [owner] : [],
  );
  if (
    hold === undefined ||
    specifications === undefined ||
    hold.unreadable > 0 ||
    specifications.length === 0 ||
    specifications.length !== hold.owners.length ||
    hold.reasons.length !== 1
  ) {
    return 'workflowExecution.close.refusal.uncommittedGit';
  }

  if (hold.reasons[0] === 'abandoned') {
    return 'workflowExecution.close.refusal.uncommittedAbandoned';
  }

  if (specifications.every((owner) => owner.documents === 0)) {
    // The step finish commits them only when a step is in progress.
    return specifications.every((owner) => owner.stepInProgress === true)
      ? 'workflowExecution.close.refusal.workflowStateUncommittedStep'
      : 'workflowExecution.close.refusal.workflowStateUncommitted';
  }

  return 'workflowExecution.close.refusal.documentsUncommitted';
}

/**
 * Files SpecFlow wrote and did not commit hold the Close (`commit-uncommitted`): the reason, with
 * the uncommitted files when the ledger names them. Not a hold when the answer was lost.
 */
function heldBy(refusal: WorkflowRefusal | undefined): CloseDialogOutcome | undefined {
  if (
    refusal?.code !== 'DOCUMENT_COMMITS_PENDING' ||
    refusal.documentCause !== 'commit-uncommitted' ||
    refusal.outcomeUnknown
  ) {
    return undefined;
  }

  const reasonKey = closeRefusalKey(refusal);

  return refusal.uncommittedHold
    ? { kind: 'held', reasonKey, uncommitted: refusal.uncommittedHold }
    : { kind: 'held', reasonKey };
}

/**
 * Who holds the checkout, for the "cannot close yet" sentence: another Specification (`other`),
 * only the one being closed (`own`), or files of no named Specification (`checkout`).
 */
export function uncommittedHolder(
  hold: UncommittedHoldDetails | undefined,
  specId: string,
): 'other' | 'own' | 'checkout' {
  const specifications = (hold?.owners ?? []).flatMap((owner) =>
    owner.kind === 'specification' ? [owner.specId] : [],
  );
  if (specifications.some((id) => id !== specId)) {
    return 'other';
  }

  return specifications.length > 0 && specifications.length === hold?.owners.length
    ? 'own'
    : 'checkout';
}

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
      return refusal.documentCause === 'commit-uncommitted'
        ? uncommittedKey(refusal.uncommittedHold)
        : refusal.documentCause === 'commit-failed'
          ? 'workflowExecution.close.refusal.documentsFailed'
          : 'workflowExecution.close.refusal.documentsPending';
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

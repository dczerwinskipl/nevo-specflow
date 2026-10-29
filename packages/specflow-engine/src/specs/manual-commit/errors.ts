import type {
  ActionReason,
  DocumentErrorCode,
  DocumentErrorDetails,
} from '@nevo/specflow-contracts/documents';

import { GitCapabilityError } from '../../git/errors';
import { DocumentError } from '../document-rules/errors';

/** What can refuse or fail a manual commit, as data. The map below turns each into a contract code. */
export const MANUAL_COMMIT_CAUSES = [
  'message-invalid',
  'operation-invalid',
  'scope-not-allowed',
  'operation-conflict',
  'operation-not-found',
  'operation-state-invalid',
  'unavailable-queue',
  'unavailable-empty',
  'unavailable-git-disabled',
  'conflict',
  'branch-changed',
  'subset-invalid',
  'stale',
  'recovery-required',
  'busy-commit-in-progress',
  'busy-recovery-required',
  'busy-create-or-close',
  'busy-write-in-progress',
  'archived',
  'source-unavailable',
  'branch-protected',
  'branch-not-allowed',
  'commit-blocked',
  'git-policy-invalid',
  'journal-corrupt',
  'payload-unprovable',
] as const;

export type ManualCommitCause = (typeof MANUAL_COMMIT_CAUSES)[number];

interface Mapping {
  readonly code: DocumentErrorCode;
  readonly reason?: ActionReason;
  readonly detail?: string;
}

/**
 * The exhaustive cause -> contract code table. `Record` over the cause union: a new cause fails
 * compilation here.
 */
export const MANUAL_COMMIT_ERROR_MAP = {
  'message-invalid': { code: 'MANUAL_COMMIT_MESSAGE_INVALID' },
  'operation-invalid': { code: 'DOCUMENT_OPERATION_INVALID' },
  'scope-not-allowed': { code: 'DOCUMENT_OPERATION_INVALID', detail: 'scope-not-allowed' },
  'operation-conflict': { code: 'DOCUMENT_OPERATION_CONFLICT' },
  'operation-not-found': { code: 'DOCUMENT_OPERATION_NOT_FOUND' },
  'operation-state-invalid': { code: 'DOCUMENT_OPERATION_STATE_INVALID' },
  'unavailable-queue': { code: 'MANUAL_COMMIT_UNAVAILABLE', detail: 'queue-not-empty' },
  'unavailable-empty': { code: 'MANUAL_COMMIT_UNAVAILABLE', detail: 'ledger-empty' },
  'unavailable-git-disabled': { code: 'MANUAL_COMMIT_UNAVAILABLE', detail: 'git-disabled' },
  conflict: { code: 'MANUAL_COMMIT_CONFLICT', detail: 'content-changed' },
  'branch-changed': { code: 'MANUAL_COMMIT_CONFLICT', detail: 'branch-changed' },
  'subset-invalid': { code: 'MANUAL_COMMIT_SUBSET_INVALID' },
  stale: { code: 'MANUAL_COMMIT_STALE' },
  'recovery-required': { code: 'MANUAL_COMMIT_RECOVERY_REQUIRED' },
  'busy-commit-in-progress': { code: 'SPEC_BUSY', reason: 'busy', detail: 'commit-in-progress' },
  'busy-recovery-required': { code: 'SPEC_BUSY', reason: 'busy', detail: 'recovery-required' },
  'busy-create-or-close': { code: 'SPEC_BUSY', reason: 'busy', detail: 'create-or-close' },
  'busy-write-in-progress': { code: 'SPEC_BUSY', reason: 'busy', detail: 'write-in-progress' },
  archived: { code: 'SPEC_ARCHIVED', reason: 'archived' },
  'source-unavailable': { code: 'SPEC_SOURCE_UNAVAILABLE' },
  'branch-protected': { code: 'BRANCH_PROTECTED', reason: 'branch-protected' },
  'branch-not-allowed': { code: 'BRANCH_PROTECTED', reason: 'branch-not-allowed' },
  'commit-blocked': { code: 'COMMIT_BLOCKED', reason: 'commit-blocked' },
  'git-policy-invalid': { code: 'GIT_POLICY_INVALID', reason: 'git-policy-invalid' },
  'journal-corrupt': { code: 'DOCUMENT_RECOVERY_REQUIRED', detail: 'journal-corrupt' },
  'payload-unprovable': { code: 'DOCUMENT_RECOVERY_REQUIRED', detail: 'payload-unprovable' },
} as const satisfies Record<ManualCommitCause, Mapping>;

export interface ManualCommitErrorExtras {
  /** `details.cause` when it adds to the mapped one (for example the problem of a message). */
  readonly cause?: string;
  readonly blockedBy?: string;
  readonly retryAfterMs?: number;
  /** The manual commit that holds the checkout (SPEC_BUSY): the id `recover` takes. */
  readonly operationId?: string;
  /** The conflicting paths, or the closure a subset needs (at most 25 are carried). */
  readonly paths?: readonly string[];
}

export const MANUAL_COMMIT_ERROR_PATHS_MAX = 25;

/** The error for a cause. The message never carries an absolute path. */
export function manualCommitError(
  cause: ManualCommitCause,
  message: string,
  extras: ManualCommitErrorExtras = {},
): DocumentError {
  const mapping: Mapping = MANUAL_COMMIT_ERROR_MAP[cause];
  const detail = extras.cause ?? mapping.detail;
  const details: DocumentErrorDetails = {
    ...(mapping.reason !== undefined ? { reason: mapping.reason } : {}),
    ...(detail !== undefined ? { cause: detail } : {}),
    ...(extras.blockedBy !== undefined ? { blockedBy: extras.blockedBy } : {}),
    ...(extras.retryAfterMs !== undefined ? { retryAfterMs: extras.retryAfterMs } : {}),
    ...(extras.operationId !== undefined ? { operationId: extras.operationId } : {}),
    ...(extras.paths !== undefined
      ? { paths: [...extras.paths].slice(0, MANUAL_COMMIT_ERROR_PATHS_MAX) }
      : {}),
  };

  return new DocumentError(
    mapping.code,
    message,
    Object.keys(details).length > 0 ? details : undefined,
  );
}

/** Maps what the Git layer refuses with onto the document error vocabulary. */
export function gitRefusal(error: unknown): unknown {
  if (!(error instanceof GitCapabilityError)) {
    return error;
  }

  switch (error.code) {
    case 'BRANCH_PROTECTED':
      return manualCommitError(
        error.reason === 'branch-not-allowed' ? 'branch-not-allowed' : 'branch-protected',
        'The Engine does not commit on this branch.',
      );
    case 'GIT_POLICY_INVALID':
      return manualCommitError('git-policy-invalid', 'The Git policy of the project is invalid.');
    case 'COMMIT_BLOCKED':
      return manualCommitError(
        'commit-blocked',
        'The checkout cannot take an Engine commit right now.',
        error.reason !== undefined ? { blockedBy: error.reason } : {},
      );
    default:
      return manualCommitError('commit-blocked', 'Git is not available for this checkout.', {
        blockedBy: 'git-unavailable',
      });
  }
}

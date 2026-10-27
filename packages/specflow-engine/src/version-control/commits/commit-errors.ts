import { GitCapabilityError } from '../../git/errors';

/** A refusal before anything changed: the checkout cannot take an Engine commit right now. */
export function blocked(reason: string): GitCapabilityError {
  return new GitCapabilityError(
    'COMMIT_BLOCKED',
    'The checkout cannot take an Engine commit right now.',
    reason,
  );
}

/** A Git step that provably left no commit. */
export function failed(reason: string): GitCapabilityError {
  return new GitCapabilityError('COMMIT_FAILED', 'The Engine commit failed.', reason);
}

export function inspectionFailed(reason: string): GitCapabilityError {
  return new GitCapabilityError('GIT_OPERATION_FAILED', 'Unable to inspect Git history.', reason);
}

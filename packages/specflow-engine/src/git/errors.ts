export type GitCapabilityErrorCode =
  | 'GIT_DISABLED'
  | 'GIT_POLICY_INVALID'
  | 'GIT_UNAVAILABLE'
  | 'NOT_GIT_REPOSITORY'
  | 'WORKTREE_PATH_CONFLICT'
  | 'BRANCH_ALREADY_CHECKED_OUT'
  | 'BRANCH_ALREADY_EXISTS'
  | 'BASE_REF_NOT_FOUND'
  | 'GIT_BASE_CONFIG_MISSING'
  | 'GIT_OPERATION_UNCERTAIN'
  | 'GIT_OPERATION_FAILED'
  | 'WORKTREE_MEMBERSHIP_MISMATCH'
  /** Git is enabled and the branch the scaffold would be committed on is protected (or not allowed). */
  | 'BRANCH_PROTECTED'
  /** The checkout cannot take an Engine commit right now (detached, busy, ignored paths, ...). */
  | 'COMMIT_BLOCKED'
  /** The scoped Engine commit failed and provably left no commit behind. */
  | 'COMMIT_FAILED';

export class GitCapabilityError extends Error {
  readonly code: GitCapabilityErrorCode;
  /** Internal diagnostic detail for logs and tests; never part of a transport response. */
  readonly reason?: string;

  constructor(code: GitCapabilityErrorCode, message: string, reason?: string) {
    super(message);
    this.name = 'GitCapabilityError';
    this.code = code;
    if (reason !== undefined) this.reason = reason;
  }
}

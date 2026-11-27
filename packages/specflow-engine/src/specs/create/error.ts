export type CreateOperationErrorCode =
  | 'CREATE_CONFLICT'
  | 'CREATE_RECOVERY_REQUIRED'
  /**
   * The Create stopped with its executor while a Git command of it may still run (creating the
   * worktree, or committing the scaffold with its lock still held): only an operator who checked that
   * no such Git runs resumes it (`nevo-specflow specs recover <operation> --confirmed-stopped
   * --confirmed-git-stopped`, after removing a stale `index.lock`).
   */
  | 'CREATE_GIT_UNSETTLED'
  | 'CREATE_OPERATION_INVALID'
  /** A user-typed branch override is not a valid branch name; nothing was reserved. */
  | 'BRANCH_NAME_INVALID'
  | 'CREATE_JOURNAL_CORRUPT'
  /** An unreadable journal read by id: never interpreted, never blocks Create or Close. */
  | 'CREATE_JOURNAL_UNSUPPORTED';

export class CreateOperationError extends Error {
  readonly code: CreateOperationErrorCode;

  constructor(code: CreateOperationErrorCode, message: string) {
    super(message);
    this.name = 'CreateOperationError';
    this.code = code;
  }
}

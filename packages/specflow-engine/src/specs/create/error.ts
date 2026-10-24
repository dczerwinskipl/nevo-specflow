export type CreateOperationErrorCode =
  | 'CREATE_CONFLICT'
  | 'CREATE_RECOVERY_REQUIRED'
  | 'CREATE_OPERATION_INVALID'
  /** A user-typed branch override is not a valid branch name; nothing was reserved. */
  | 'BRANCH_NAME_INVALID'
  | 'CREATE_JOURNAL_CORRUPT'
  /** An older-format journal read by id: never interpreted, never blocks Create or Close. */
  | 'CREATE_JOURNAL_UNSUPPORTED';

export class CreateOperationError extends Error {
  readonly code: CreateOperationErrorCode;

  constructor(code: CreateOperationErrorCode, message: string) {
    super(message);
    this.name = 'CreateOperationError';
    this.code = code;
  }
}

import { ApiError, type ErrorCodeTable } from '../../../api';
import type { CreateFailure } from './createFailure';

/**
 * The Runtime Create error codes with the meaning the product gives them. A code not listed
 * here is classified by its HTTP status, so a new server code never breaks the form.
 *
 * `outcome` is what the server declares about its state: validation and precondition answers come
 * before anything was written (`ENGINE_UNAVAILABLE` before the operation started), while the
 * journal and Git-uncertainty codes mean the result is unknown. A code the Runtime can also raise
 * after it reserved the operation (`CONTROL_LOCK_BUSY`, `REGISTRY_CONFLICT`, `GIT_POLICY_INVALID`,
 * `WORKTREE_PATH_CONFLICT`: the journal, files or a commit may already exist) is `unknown`; the form
 * then checks the operation instead of claiming nothing was created.
 */
export const createSpecErrorCodes: ErrorCodeTable = {
  CREATE_OPERATION_INVALID: { kind: 'validation', outcome: 'not-applied' },
  BRANCH_NAME_INVALID: { kind: 'validation', outcome: 'not-applied' },
  SPEC_VALIDATION_ERROR: { kind: 'validation', outcome: 'not-applied' },
  CREATE_CONFLICT: { kind: 'conflict', outcome: 'not-applied' },
  BRANCH_ALREADY_EXISTS: { kind: 'conflict', outcome: 'not-applied' },
  BRANCH_ALREADY_CHECKED_OUT: { kind: 'conflict', outcome: 'not-applied' },
  WORKTREE_PATH_CONFLICT: { kind: 'conflict', outcome: 'unknown' },
  SPEC_CONFLICT: { kind: 'conflict', outcome: 'not-applied' },
  REGISTRY_CONFLICT: { kind: 'conflict', outcome: 'unknown' },
  GIT_DISABLED: { kind: 'precondition', outcome: 'not-applied' },
  BASE_REF_NOT_FOUND: { kind: 'precondition', outcome: 'not-applied' },
  GIT_BASE_CONFIG_MISSING: { kind: 'precondition', outcome: 'not-applied' },
  // The project's own Git configuration is unusable (a typed branch has `BRANCH_NAME_INVALID`).
  // The Engine does not commit on the branch (project configuration) / cannot commit right now.
  BRANCH_PROTECTED: { kind: 'precondition', outcome: 'not-applied' },
  COMMIT_BLOCKED: { kind: 'conflict', outcome: 'not-applied' },
  // The files were written, the commit failed: an operator resumes the journalled operation.
  COMMIT_FAILED: { kind: 'recovery-required', outcome: 'unknown' },
  GIT_POLICY_INVALID: { kind: 'unavailable', outcome: 'unknown' },
  // A workspace or Specification vanished between reading the options and creating (answered 503).
  SPEC_NOT_FOUND: { kind: 'precondition', outcome: 'not-applied' },
  CREATE_RECOVERY_REQUIRED: { kind: 'recovery-required', outcome: 'unknown' },
  CREATE_JOURNAL_CORRUPT: { kind: 'recovery-required', outcome: 'unknown' },
  REGISTRY_RECOVERY_REQUIRED: { kind: 'recovery-required', outcome: 'unknown' },
  GIT_OPERATION_UNCERTAIN: { kind: 'recovery-required', outcome: 'unknown' },
  CONTROL_LOCK_BUSY: { kind: 'unavailable', outcome: 'unknown', retryable: true },
  ENGINE_UNAVAILABLE: { kind: 'unavailable', outcome: 'not-applied', retryable: true },
  CREATE_NOT_FOUND: { kind: 'not-found', outcome: 'not-applied' },
};

const branchConflictCodes = new Set([
  'BRANCH_ALREADY_EXISTS',
  'BRANCH_ALREADY_CHECKED_OUT',
  'WORKTREE_PATH_CONFLICT',
]);

/** Codes meaning "the request itself is malformed", not "an option went stale". */
const malformedCodes = new Set(['FST_ERR_VALIDATION', 'SPEC_VALIDATION_ERROR']);

/** What the request carried that decides which remedy a refusal calls for. */
export interface SentCreate {
  /** The branch name the owner typed into a new workspace, if any. */
  readonly customBranch?: string;
  /** The request asked for a new workspace (its branch is then generated or typed). */
  readonly newWorkspace?: boolean;
}

/** Why the Engine refused to commit on a branch, from what was sent (never from server text). */
export const protectedBranchFailure = (sent: SentCreate): CreateFailure => ({
  kind: 'branch-protected',
  cause: sent.customBranch ? 'typed-branch' : sent.newWorkspace ? 'generated-branch' : 'workspace',
});

/**
 * Maps a classified failure of the Create request to what the form shows. The server text is
 * never used; the code only selects the explanation.
 */
export function toCreateFailure(error: ApiError, sent: SentCreate = {}): CreateFailure {
  const code = error.code ?? 'unknown';
  if (code === 'BRANCH_PROTECTED') return protectedBranchFailure(sent);
  if (code === 'COMMIT_BLOCKED') return { kind: 'commit-blocked' };
  // The server cannot rule out that the operation was reserved: never claim a definite refusal.
  if (
    error.outcome === 'unknown' &&
    error.kind !== 'recovery-required' &&
    error.kind !== 'network' &&
    error.kind !== 'unauthenticated' &&
    error.kind !== 'forbidden'
  )
    return { kind: 'uncertain' };
  switch (error.kind) {
    case 'recovery-required':
      return code === 'COMMIT_FAILED'
        ? { kind: 'recovery-required', committed: true }
        : { kind: 'recovery-required' };
    case 'conflict':
      if (code === 'CREATE_CONFLICT') return { kind: 'name-conflict' };
      if (branchConflictCodes.has(code))
        return { kind: 'branch-exists', automatic: !sent.customBranch };
      return { kind: 'stale', code };
    case 'validation':
      if (code === 'BRANCH_NAME_INVALID') return { kind: 'branch-invalid' };
      return malformedCodes.has(code) ? { kind: 'failed' } : { kind: 'stale', code };
    case 'precondition':
      return { kind: 'stale', code };
    case 'forbidden':
      return { kind: 'forbidden' };
    case 'unauthenticated':
      return { kind: 'unauthenticated' };
    case 'network':
      return error.outcome === 'not-applied' ? { kind: 'offline' } : { kind: 'uncertain' };
    default:
      // Whatever may have reached the server and was not declared harmless stays uncertain.
      return error.outcome === 'unknown' ? { kind: 'uncertain' } : { kind: 'failed' };
  }
}

/**
 * What the form shows for a failure the inspection endpoint reports (the Runtime saw the operation
 * fail after reserving it). Same table and same retry semantics as a refused request: a code that
 * declares nothing was applied is a definite failure, anything else (or a code this build does not
 * know) leaves the outcome unknown.
 */
export function toOperationFailure(code: string, sent: SentCreate = {}): CreateFailure {
  const rule = Object.hasOwn(createSpecErrorCodes, code) ? createSpecErrorCodes[code] : undefined;
  return toCreateFailure(
    new ApiError({
      kind: rule?.kind ?? 'server',
      operation: 'specs.create.inspect',
      outcome: rule?.outcome ?? 'unknown',
      retryable: rule?.retryable ?? false,
      code,
    }),
    sent,
  );
}

import { ApiError, type ErrorCodeTable } from '../../../api';
import type { CreateFailure } from './createFailure';

/**
 * The Runtime Create error codes with the meaning the product gives them. A code not listed
 * here is classified by its HTTP status, so a new server code never breaks the form.
 *
 * `outcome` is what the server declares about its state: 4xx answers come from validation and
 * preconditions before anything was written, `ENGINE_UNAVAILABLE`/`CONTROL_LOCK_BUSY` before the
 * operation started, while the journal and Git-uncertainty codes mean the result is unknown.
 */
export const createSpecErrorCodes: ErrorCodeTable = {
  CREATE_OPERATION_INVALID: { kind: 'validation', outcome: 'not-applied' },
  BRANCH_NAME_INVALID: { kind: 'validation', outcome: 'not-applied' },
  SPEC_VALIDATION_ERROR: { kind: 'validation', outcome: 'not-applied' },
  CREATE_CONFLICT: { kind: 'conflict', outcome: 'not-applied' },
  BRANCH_ALREADY_EXISTS: { kind: 'conflict', outcome: 'not-applied' },
  BRANCH_ALREADY_CHECKED_OUT: { kind: 'conflict', outcome: 'not-applied' },
  WORKTREE_PATH_CONFLICT: { kind: 'conflict', outcome: 'not-applied' },
  SPEC_CONFLICT: { kind: 'conflict', outcome: 'not-applied' },
  REGISTRY_CONFLICT: { kind: 'conflict', outcome: 'not-applied' },
  GIT_DISABLED: { kind: 'precondition', outcome: 'not-applied' },
  BASE_REF_NOT_FOUND: { kind: 'precondition', outcome: 'not-applied' },
  GIT_BASE_CONFIG_MISSING: { kind: 'precondition', outcome: 'not-applied' },
  // The project's own Git configuration is unusable (a typed branch has `BRANCH_NAME_INVALID`).
  GIT_POLICY_INVALID: { kind: 'unavailable', outcome: 'not-applied' },
  // A workspace or Specification vanished between reading the options and creating (answered 503).
  SPEC_NOT_FOUND: { kind: 'precondition', outcome: 'not-applied' },
  CREATE_RECOVERY_REQUIRED: { kind: 'recovery-required', outcome: 'unknown' },
  CREATE_JOURNAL_CORRUPT: { kind: 'recovery-required', outcome: 'unknown' },
  REGISTRY_RECOVERY_REQUIRED: { kind: 'recovery-required', outcome: 'unknown' },
  GIT_OPERATION_UNCERTAIN: { kind: 'recovery-required', outcome: 'unknown' },
  CONTROL_LOCK_BUSY: { kind: 'unavailable', outcome: 'not-applied', retryable: true },
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

/**
 * Maps a classified failure of the Create request to what the form shows. The server text is
 * never used; the code only selects the explanation.
 */
export function toCreateFailure(
  error: ApiError,
  sent: { readonly customBranch?: string } = {},
): CreateFailure {
  const code = error.code ?? 'unknown';
  switch (error.kind) {
    case 'recovery-required':
      return { kind: 'recovery-required' };
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
export function toOperationFailure(
  code: string,
  sent: { readonly customBranch?: string } = {},
): CreateFailure {
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

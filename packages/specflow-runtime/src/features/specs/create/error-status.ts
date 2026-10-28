import type { DocumentErrorCode, DocumentErrorDetails } from '@nevo/specflow-contracts/documents';
import {
  CreateOperationError,
  DocumentError,
  GitCapabilityError,
  ProjectControlLockError,
  ProjectHomeError,
  SpecificationError,
  WorkspaceRegistryError,
  type GitCapabilityErrorCode,
  type ProjectControlLockErrorCode,
  type ProjectHomeErrorCode,
  type SpecificationErrorCode,
  type WorkspaceRegistryErrorCode,
} from '@nevo/specflow-engine';

/** The document codes a Create can answer with (admission of the archetype part). */
export const CREATE_DOCUMENT_ERROR_CODES = [
  'CATALOGUE_STALE',
  'ARCHETYPE_UNKNOWN',
  'DEFINITIONS_MISSING',
  'DOCUMENT_PATH_INVALID',
  'DOCUMENT_PATH_CONFLICT',
  'DOCUMENT_OPERATION_INVALID',
] as const satisfies readonly DocumentErrorCode[];
type CreateDocumentErrorCode = (typeof CREATE_DOCUMENT_ERROR_CODES)[number];

const CREATE_DOCUMENT_ERROR_CODE_SET: ReadonlySet<DocumentErrorCode> = new Set(
  CREATE_DOCUMENT_ERROR_CODES,
);

function isCreateDocumentErrorCode(code: DocumentErrorCode): code is CreateDocumentErrorCode {
  return CREATE_DOCUMENT_ERROR_CODE_SET.has(code);
}

export type CreateErrorCode =
  | CreateOperationError['code']
  | CreateDocumentErrorCode
  | GitCapabilityErrorCode
  | ProjectControlLockErrorCode
  | ProjectHomeErrorCode
  | SpecificationErrorCode
  | WorkspaceRegistryErrorCode;

export type CreateHttpStatus = 400 | 409 | 422 | 503;

/** Explicit, exhaustive transport policy. Unknown failures stay HTTP 500. */
export function statusForCreateError(code: CreateErrorCode): CreateHttpStatus {
  switch (code) {
    case 'CREATE_OPERATION_INVALID':
    case 'SPEC_VALIDATION_ERROR':
    case 'DOCUMENT_PATH_INVALID':
    case 'DOCUMENT_OPERATION_INVALID':
      return 400;

    case 'CREATE_CONFLICT':
    case 'SPEC_CONFLICT':
    case 'REGISTRY_CONFLICT':
    case 'BRANCH_ALREADY_EXISTS':
    case 'BRANCH_ALREADY_CHECKED_OUT':
    case 'WORKTREE_PATH_CONFLICT':
    case 'COMMIT_BLOCKED':
    case 'CATALOGUE_STALE':
    case 'DOCUMENT_PATH_CONFLICT':
      return 409;

    case 'BRANCH_NAME_INVALID':
    case 'GIT_DISABLED':
    case 'BRANCH_PROTECTED':
    case 'BASE_REF_NOT_FOUND':
    case 'GIT_BASE_CONFIG_MISSING':
    case 'ARCHETYPE_UNKNOWN':
    case 'DEFINITIONS_MISSING':
      return 422;

    case 'CREATE_RECOVERY_REQUIRED':
    case 'CREATE_JOURNAL_CORRUPT':
    case 'CREATE_JOURNAL_UNSUPPORTED':
    case 'PROJECT_HOME_NOT_FOUND':
    case 'PROJECT_HOME_AMBIGUOUS':
    case 'PROJECT_HOME_INVALID':
    case 'PROJECT_HOME_MISMATCH':
    case 'CONTROL_LOCK_BUSY':
    case 'CONTROL_LOCK_CORRUPT':
    case 'CONTROL_LOCK_OWNERSHIP_LOST':
    case 'CONTROL_LOCK_INVALID_HOME':
    case 'REGISTRY_NOT_FOUND':
    case 'REGISTRY_RECOVERY_REQUIRED':
    case 'REGISTRY_CORRUPT':
    case 'REGISTRY_UNSUPPORTED_VERSION':
    case 'REGISTRY_PROJECT_MISMATCH':
    case 'REGISTRY_WORKSPACE_UNAVAILABLE':
    case 'REGISTRY_WORKSPACE_MISMATCH':
    case 'GIT_POLICY_INVALID':
    case 'GIT_UNAVAILABLE':
    case 'NOT_GIT_REPOSITORY':
    case 'GIT_OPERATION_UNCERTAIN':
    case 'GIT_OPERATION_FAILED':
    case 'COMMIT_FAILED':
    case 'WORKTREE_MEMBERSHIP_MISMATCH':
    case 'SPEC_SOURCE_INVALID':
    case 'SPEC_NOT_FOUND':
      return 503;
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

/**
 * Only the Engine's public, typed failures are safe transport errors. A Node filesystem error such
 * as EACCES is not a client validation failure and must never be misreported as HTTP 4xx (it falls
 * through to the Runtime error handler, which answers a generic 500).
 */
/** The cause of a document refusal (for example `definitions-missing`), when the Engine named one. */
export function createErrorDetails(error: unknown): DocumentErrorDetails | undefined {
  return error instanceof DocumentError ? error.details : undefined;
}

export function createErrorCode(error: unknown): CreateErrorCode | undefined {
  if (
    error instanceof CreateOperationError ||
    error instanceof ProjectControlLockError ||
    error instanceof GitCapabilityError ||
    error instanceof SpecificationError ||
    error instanceof WorkspaceRegistryError ||
    error instanceof ProjectHomeError
  ) {
    return error.code;
  }
  if (error instanceof DocumentError && isCreateDocumentErrorCode(error.code)) return error.code;
  return undefined;
}

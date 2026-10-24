import type { DocumentErrorCode, DocumentErrorDetails } from '@nevo/specflow-contracts/documents';
import {
  DocumentError,
  GitCapabilityError,
  ProjectHomeError,
  SpecificationError,
  WorkspaceRegistryError,
} from '@nevo/specflow-engine';

export type DocumentHttpStatus = 400 | 404 | 409 | 413 | 415 | 422 | 503;

/**
 * Explicit, exhaustive transport policy for the whole document error table of the reference page
 * (reads emit a subset today; the table is complete so a later route cannot forget a code).
 */
export function statusForDocumentError(code: DocumentErrorCode): DocumentHttpStatus {
  switch (code) {
    case 'DOCUMENT_PATH_INVALID':
    case 'DOCUMENT_TYPE_INVALID':
    case 'DOCUMENT_OPERATION_INVALID':
      return 400;

    case 'DOCUMENT_NOT_FOUND':
    case 'DOCUMENT_FILE_MISSING':
      return 404;

    case 'DOCUMENT_REVISION_UNAVAILABLE':
    case 'DOCUMENT_REVISION_CONFLICT':
    case 'DOCUMENT_PATH_CONFLICT':
    case 'DOCUMENT_PROTECTED':
    case 'DOCUMENT_ALREADY_CLASSIFIED':
    case 'DOCUMENT_OPERATION_CONFLICT':
    case 'SPEC_MANIFEST_DIRTY':
    case 'SPEC_ARCHIVED':
    case 'SPEC_BUSY':
    case 'COMMIT_BLOCKED':
    case 'CATALOGUE_STALE':
      return 409;

    case 'DOCUMENT_TOO_LARGE':
      return 413;

    case 'DOCUMENT_NOT_EDITABLE':
      return 415;

    case 'BRANCH_PROTECTED':
    case 'ARCHETYPE_UNKNOWN':
      return 422;

    case 'SPEC_SOURCE_UNAVAILABLE':
    case 'DOCUMENT_RECOVERY_REQUIRED':
    case 'COMMIT_FAILED':
    case 'GIT_POLICY_INVALID':
    case 'CREATE_JOURNAL_UNSUPPORTED':
      return 503;
    default: {
      const exhaustive: never = code;
      return exhaustive;
    }
  }
}

export interface DocumentFailure {
  readonly status: DocumentHttpStatus;
  readonly body: {
    readonly error: DocumentErrorCode;
    readonly code: DocumentErrorCode;
    readonly details?: DocumentErrorDetails;
  };
}

function failure(code: DocumentErrorCode, details?: DocumentErrorDetails): DocumentFailure {
  return {
    status: statusForDocumentError(code),
    body: { error: code, code, ...(details ? { details } : {}) },
  };
}

/**
 * The HTTP failure for an error a document read can throw, or `undefined` for a defect (which the
 * Runtime error handler answers with a generic 500). Bodies carry the code only: never a message,
 * never a path.
 */
export function documentFailure(error: unknown): DocumentFailure | undefined {
  if (error instanceof DocumentError) return failure(error.code, error.details);
  if (error instanceof SpecificationError) {
    return error.code === 'SPEC_NOT_FOUND'
      ? failure('DOCUMENT_NOT_FOUND')
      : failure('SPEC_SOURCE_UNAVAILABLE');
  }
  // The canonical source (registry, Project Home, Git configuration) cannot be read.
  if (
    error instanceof WorkspaceRegistryError ||
    error instanceof ProjectHomeError ||
    error instanceof GitCapabilityError
  ) {
    return failure('SPEC_SOURCE_UNAVAILABLE');
  }
  return undefined;
}

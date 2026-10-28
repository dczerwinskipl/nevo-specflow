import type {
  ActionReason,
  DocumentErrorCode,
  DocumentErrorDetails,
} from '@nevo/specflow-contracts/documents';

import { DocumentError } from '../../document-rules/errors';

/** What can refuse or fail a document change, as data. The map below turns each into a contract code. */
export const DOCUMENT_CHANGE_CAUSES = [
  'revision-conflict',
  'document-not-found',
  'file-missing',
  'path-invalid',
  'path-too-long',
  'path-conflict',
  'protected',
  'type-invalid',
  'already-classified',
  'not-editable',
  'too-large',
  'operation-invalid',
  'limit-exceeded',
  'folder-expansion-limit',
  'operation-conflict',
  'operation-not-found',
  'operation-state-invalid',
  'manifest-dirty',
  'archived',
  'source-unavailable',
  'busy-commit-in-progress',
  'busy-queue-full',
  'busy-held-limit',
  'busy-recovery-required',
  'busy-create-or-close',
  'busy-manifest-changed',
  'busy-write-in-progress',
  'catalogue-stale',
  'archetype-not-defined',
  'archetype-invalid',
  'template-unknown',
  'write-no-space',
  'write-io-error',
  'write-ambiguous',
  'write-conflict',
  'journal-corrupt',
  'journal-unsupported',
  'payload-unprovable',
  'plan-invalid',
  'recovery-unresolved',
  'branch-protected',
  'branch-not-allowed',
  'commit-blocked',
  'git-policy-invalid',
  'close-commit-pending',
  'close-commit-failed',
  'close-commit-uncommitted',
  'uncommitted-limit',
] as const;

export type DocumentChangeCause = (typeof DOCUMENT_CHANGE_CAUSES)[number];

export interface DocumentChangeErrorMapping {
  readonly code: DocumentErrorCode;
  /** `details.reason` (the `ActionReason` vocabulary only). */
  readonly reason?: ActionReason;
  /** `details.cause` (open kebab-case). */
  readonly detail?: string;
}

/**
 * The exhaustive cause -> contract code table. `Record` over the cause union: a new cause fails
 * compilation here, and a test checks that every contract code the write path can emit is reachable.
 */
export const DOCUMENT_CHANGE_ERROR_MAP = {
  'revision-conflict': { code: 'DOCUMENT_REVISION_CONFLICT' },
  'document-not-found': { code: 'DOCUMENT_NOT_FOUND' },
  'file-missing': { code: 'DOCUMENT_FILE_MISSING' },
  'path-invalid': { code: 'DOCUMENT_PATH_INVALID' },
  'path-too-long': { code: 'DOCUMENT_PATH_INVALID', detail: 'path-too-long' },
  'path-conflict': { code: 'DOCUMENT_PATH_CONFLICT' },
  protected: { code: 'DOCUMENT_PROTECTED', reason: 'protected' },
  'type-invalid': { code: 'DOCUMENT_TYPE_INVALID' },
  'already-classified': { code: 'DOCUMENT_ALREADY_CLASSIFIED' },
  'not-editable': { code: 'DOCUMENT_NOT_EDITABLE', reason: 'not-editable' },
  'too-large': { code: 'DOCUMENT_TOO_LARGE' },
  'operation-invalid': { code: 'DOCUMENT_OPERATION_INVALID' },
  'limit-exceeded': { code: 'DOCUMENT_OPERATION_INVALID', detail: 'limit-exceeded' },
  'folder-expansion-limit': {
    code: 'DOCUMENT_OPERATION_INVALID',
    detail: 'folder-expansion-limit',
  },
  'operation-conflict': { code: 'DOCUMENT_OPERATION_CONFLICT' },
  'operation-not-found': { code: 'DOCUMENT_OPERATION_NOT_FOUND' },
  'operation-state-invalid': { code: 'DOCUMENT_OPERATION_STATE_INVALID' },
  'manifest-dirty': { code: 'SPEC_MANIFEST_DIRTY' },
  archived: { code: 'SPEC_ARCHIVED', reason: 'archived' },
  'source-unavailable': { code: 'SPEC_SOURCE_UNAVAILABLE' },
  'busy-commit-in-progress': { code: 'SPEC_BUSY', reason: 'busy', detail: 'commit-in-progress' },
  'busy-queue-full': { code: 'SPEC_BUSY', reason: 'busy', detail: 'queue-full' },
  'busy-held-limit': { code: 'SPEC_BUSY', reason: 'busy', detail: 'held-limit' },
  'busy-recovery-required': { code: 'SPEC_BUSY', reason: 'busy', detail: 'recovery-required' },
  'busy-create-or-close': { code: 'SPEC_BUSY', reason: 'busy', detail: 'create-or-close' },
  'busy-manifest-changed': { code: 'SPEC_BUSY', reason: 'busy', detail: 'manifest-changed' },
  'busy-write-in-progress': { code: 'SPEC_BUSY', reason: 'busy', detail: 'write-in-progress' },
  'catalogue-stale': { code: 'CATALOGUE_STALE' },
  'archetype-not-defined': { code: 'ARCHETYPE_UNKNOWN', detail: 'archetype-not-defined' },
  'archetype-invalid': { code: 'ARCHETYPE_UNKNOWN', detail: 'archetype-invalid' },
  'template-unknown': { code: 'ARCHETYPE_UNKNOWN', detail: 'template-unknown' },
  'write-no-space': { code: 'DOCUMENT_WRITE_FAILED', detail: 'no-space' },
  'write-io-error': { code: 'DOCUMENT_WRITE_FAILED', detail: 'io-error' },
  'write-ambiguous': { code: 'DOCUMENT_RECOVERY_REQUIRED', detail: 'write-ambiguous' },
  'write-conflict': { code: 'DOCUMENT_RECOVERY_REQUIRED', detail: 'write-conflict' },
  'journal-corrupt': { code: 'DOCUMENT_RECOVERY_REQUIRED', detail: 'journal-corrupt' },
  'journal-unsupported': { code: 'DOCUMENT_RECOVERY_REQUIRED', detail: 'journal-unsupported' },
  'payload-unprovable': { code: 'DOCUMENT_RECOVERY_REQUIRED', detail: 'payload-unprovable' },
  'plan-invalid': { code: 'DOCUMENT_RECOVERY_REQUIRED', detail: 'plan-invalid' },
  'recovery-unresolved': { code: 'DOCUMENT_RECOVERY_REQUIRED', detail: 'recovery-unresolved' },
  'branch-protected': { code: 'BRANCH_PROTECTED', reason: 'branch-protected' },
  'branch-not-allowed': { code: 'BRANCH_PROTECTED', reason: 'branch-not-allowed' },
  'commit-blocked': { code: 'COMMIT_BLOCKED', reason: 'commit-blocked' },
  'git-policy-invalid': { code: 'GIT_POLICY_INVALID', reason: 'git-policy-invalid' },
  'close-commit-pending': { code: 'DOCUMENT_COMMITS_PENDING', detail: 'commit-pending' },
  'close-commit-failed': { code: 'DOCUMENT_COMMITS_PENDING', detail: 'commit-failed' },
  'close-commit-uncommitted': { code: 'DOCUMENT_COMMITS_PENDING', detail: 'commit-uncommitted' },
  'uncommitted-limit': { code: 'DOCUMENT_UNCOMMITTED_LIMIT' },
} as const satisfies Record<DocumentChangeCause, DocumentChangeErrorMapping>;

/** Extra `details` a caller adds to the mapped ones. */
export interface DocumentChangeErrorExtras {
  readonly blockedBy?: string;
  readonly retryAfterMs?: number;
  readonly conflicts?: DocumentErrorDetails['conflicts'];
}

/** The document error for a cause. The message never carries an absolute path. */
export function documentChangeError(
  cause: DocumentChangeCause,
  message: string,
  extras: DocumentChangeErrorExtras = {},
): DocumentError {
  const mapping: DocumentChangeErrorMapping = DOCUMENT_CHANGE_ERROR_MAP[cause];
  const details: DocumentErrorDetails = {
    ...(mapping.reason !== undefined ? { reason: mapping.reason } : {}),
    ...(mapping.detail !== undefined ? { cause: mapping.detail } : {}),
    ...(extras.blockedBy !== undefined ? { blockedBy: extras.blockedBy } : {}),
    ...(extras.retryAfterMs !== undefined ? { retryAfterMs: extras.retryAfterMs } : {}),
    ...(extras.conflicts !== undefined ? { conflicts: extras.conflicts } : {}),
  };
  return new DocumentError(
    mapping.code,
    message,
    Object.keys(details).length > 0 ? details : undefined,
  );
}

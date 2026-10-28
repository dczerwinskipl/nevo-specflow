import { DOCUMENT_ERROR_CODES } from '@nevo/specflow-contracts/documents';
import { DocumentError, ProjectControlLockError, SpecificationError } from '@nevo/specflow-engine';
import { describe, expect, it } from 'vitest';

import { documentFailure, statusForDocumentError } from './error-status';

describe('statusForDocumentError', () => {
  it('maps the whole reference table', () => {
    const table: Record<(typeof DOCUMENT_ERROR_CODES)[number], number> = {
      DOCUMENT_NOT_FOUND: 404,
      DOCUMENT_FILE_MISSING: 404,
      SPEC_SOURCE_UNAVAILABLE: 503,
      DOCUMENT_REVISION_UNAVAILABLE: 409,
      DOCUMENT_REVISION_CONFLICT: 409,
      DOCUMENT_PATH_INVALID: 400,
      DOCUMENT_PATH_CONFLICT: 409,
      DOCUMENT_PROTECTED: 409,
      DOCUMENT_TYPE_INVALID: 400,
      DOCUMENT_ALREADY_CLASSIFIED: 409,
      DOCUMENT_NOT_EDITABLE: 415,
      DOCUMENT_TOO_LARGE: 413,
      DOCUMENT_OPERATION_INVALID: 400,
      DOCUMENT_OPERATION_CONFLICT: 409,
      DOCUMENT_RECOVERY_REQUIRED: 503,
      SPEC_MANIFEST_DIRTY: 409,
      SPEC_ARCHIVED: 409,
      SPEC_BUSY: 409,
      BRANCH_PROTECTED: 422,
      COMMIT_BLOCKED: 409,
      COMMIT_FAILED: 503,
      GIT_POLICY_INVALID: 503,
      CREATE_JOURNAL_UNSUPPORTED: 503,
      CATALOGUE_STALE: 409,
      ARCHETYPE_UNKNOWN: 422,
      DEFINITIONS_MISSING: 422,
      DOCUMENT_COMMITS_PENDING: 409,
      DOCUMENT_OPERATION_NOT_FOUND: 404,
      DOCUMENT_OPERATION_STATE_INVALID: 409,
      DOCUMENT_WRITE_FAILED: 503,
      DOCUMENT_UNCOMMITTED_LIMIT: 409,
      MANUAL_COMMIT_UNAVAILABLE: 409,
      MANUAL_COMMIT_CONFLICT: 409,
      MANUAL_COMMIT_SUBSET_INVALID: 422,
      MANUAL_COMMIT_STALE: 409,
      MANUAL_COMMIT_MESSAGE_INVALID: 400,
      MANUAL_COMMIT_RECOVERY_REQUIRED: 503,
    };
    for (const code of DOCUMENT_ERROR_CODES) expect(statusForDocumentError(code)).toBe(table[code]);
    expect(Object.keys(table).sort()).toEqual([...DOCUMENT_ERROR_CODES].sort());
  });
});

describe('documentFailure', () => {
  it('maps document errors to their status and a body with the code only', () => {
    expect(documentFailure(new DocumentError('DOCUMENT_TOO_LARGE', 'C:\\x\\y'))).toEqual({
      status: 413,
      body: { error: 'DOCUMENT_TOO_LARGE', code: 'DOCUMENT_TOO_LARGE' },
    });
    expect(
      documentFailure(new DocumentError('BRANCH_PROTECTED', 'x', { reason: 'branch-protected' })),
    ).toEqual({
      status: 422,
      body: {
        error: 'BRANCH_PROTECTED',
        code: 'BRANCH_PROTECTED',
        details: { reason: 'branch-protected' },
      },
    });
  });

  it('maps Specification errors: unknown is 404, any other source error is 503', () => {
    expect(documentFailure(new SpecificationError('SPEC_NOT_FOUND', 'x'))?.status).toBe(404);
    for (const code of ['SPEC_SOURCE_INVALID', 'SPEC_CONFLICT', 'SPEC_VALIDATION_ERROR'] as const) {
      expect(documentFailure(new SpecificationError(code, 'x'))).toEqual({
        status: 503,
        body: { error: 'SPEC_SOURCE_UNAVAILABLE', code: 'SPEC_SOURCE_UNAVAILABLE' },
      });
    }
  });

  it('maps a control lock failure to an unavailable source', () => {
    expect(documentFailure(new ProjectControlLockError('CONTROL_LOCK_BUSY', 'x'))).toEqual({
      status: 503,
      body: { error: 'SPEC_SOURCE_UNAVAILABLE', code: 'SPEC_SOURCE_UNAVAILABLE' },
    });
  });

  it('leaves defects to the generic handler', () => {
    expect(documentFailure(new Error('EACCES'))).toBeUndefined();
    expect(documentFailure('boom')).toBeUndefined();
  });
});

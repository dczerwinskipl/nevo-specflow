import type { TFunction } from 'i18next';
import { HttpClientError } from '@nevo/http-client';
import { describe, expect, it } from 'vitest';
import { documentMutationError, refusalReason } from './mutationErrors';

/** A translator that returns the key, so the mapping is asserted without a locale. */
const t = ((key: string) => key) as unknown as TFunction;

const refusal = (error: string, details?: unknown) =>
  new HttpClientError(error, { kind: 'http', status: 409, data: { error, details } });

describe('refusalReason', () => {
  it('prefers the reason the refusal carries', () => {
    const error = refusal('BRANCH_PROTECTED', { reason: 'archived' });
    expect(refusalReason(error, 'BRANCH_PROTECTED')).toBe('archived');
  });

  it('falls back to the reason the code implies', () => {
    expect(refusalReason(refusal('SPEC_ARCHIVED'), 'SPEC_ARCHIVED')).toBe('archived');
    expect(refusalReason(refusal('COMMIT_BLOCKED'), 'COMMIT_BLOCKED')).toBe('commit-blocked');
    expect(refusalReason(refusal('GIT_POLICY_INVALID'), 'GIT_POLICY_INVALID')).toBe(
      'git-policy-invalid',
    );
    expect(refusalReason(refusal('BRANCH_PROTECTED'), 'BRANCH_PROTECTED')).toBe('branch-protected');
    expect(refusalReason(new Error('x'), undefined)).toBe('branch-protected');
  });
});

describe('documentMutationError', () => {
  it('maps a Runtime code to its explanation, never to the server text', () => {
    expect(documentMutationError(refusal('DOCUMENT_PATH_CONFLICT'), t)).toBe(
      'documents.tree.error.pathConflict',
    );
    expect(documentMutationError(refusal('document-save-running'), t)).toBe(
      'documents.tree.error.saveRunning',
    );
  });

  it('explains a case-only rename only when the Runtime says so', () => {
    const caseOnly = refusal('DOCUMENT_OPERATION_INVALID', { cause: 'case-only-rename' });
    expect(documentMutationError(caseOnly, t)).toBe('documents.tree.error.caseOnlyRename');
    expect(documentMutationError(refusal('DOCUMENT_OPERATION_INVALID'), t)).toBe(
      'documents.tree.error.default',
    );
  });

  it('uses the default explanation for an unknown code', () => {
    expect(documentMutationError(new Error('x'), t)).toBe('documents.tree.error.default');
  });
});

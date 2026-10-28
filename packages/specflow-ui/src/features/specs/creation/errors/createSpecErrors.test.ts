import { HttpClientError } from '@nevo/http-client';
import { describe, expect, it } from 'vitest';
import { ApiError, classifyHttpError } from '../../../../api';
import type { CreateFailure } from './createFailure';
import { createSpecErrorCodes, toCreateFailure, toOperationFailure } from './createSpecErrors';

function fail(status: number, code?: string, method = 'POST'): ApiError {
  const classified = classifyHttpError(
    new HttpClientError('x', {
      kind: 'http',
      status,
      data: code ? { error: code, code } : undefined,
    }),
    { operation: 'specs.create', method, codes: createSpecErrorCodes },
  );
  if (!(classified instanceof ApiError)) throw new Error('expected ApiError');
  return classified;
}

describe('Create error codes', () => {
  it.each<[number, string, CreateFailure['kind']]>([
    [400, 'CREATE_OPERATION_INVALID', 'stale'],
    [400, 'SPEC_VALIDATION_ERROR', 'failed'],
    [400, 'FST_ERR_VALIDATION', 'failed'],
    [409, 'CREATE_CONFLICT', 'name-conflict'],
    [409, 'BRANCH_ALREADY_EXISTS', 'branch-exists'],
    [409, 'BRANCH_ALREADY_CHECKED_OUT', 'branch-exists'],
    [409, 'WORKTREE_PATH_CONFLICT', 'uncertain'],
    [409, 'SPEC_CONFLICT', 'stale'],
    [409, 'REGISTRY_CONFLICT', 'uncertain'],
    [422, 'GIT_DISABLED', 'stale'],
    [422, 'BASE_REF_NOT_FOUND', 'stale'],
    [422, 'GIT_BASE_CONFIG_MISSING', 'stale'],
    [503, 'GIT_POLICY_INVALID', 'uncertain'],
    [422, 'BRANCH_PROTECTED', 'branch-protected'],
    [409, 'COMMIT_BLOCKED', 'commit-blocked'],
    [503, 'COMMIT_FAILED', 'recovery-required'],
    [422, 'BRANCH_NAME_INVALID', 'branch-invalid'],
    // The name makes a path the Engine refuses: a name problem, never a stale option.
    [400, 'DOCUMENT_PATH_INVALID', 'name-invalid'],
    [409, 'DOCUMENT_PATH_CONFLICT', 'name-conflict'],
    [422, 'DEFINITIONS_MISSING', 'catalogue-stale'],
    [503, 'SPEC_NOT_FOUND', 'stale'],
    [503, 'CREATE_RECOVERY_REQUIRED', 'recovery-required'],
    [503, 'CREATE_JOURNAL_CORRUPT', 'recovery-required'],
    [503, 'REGISTRY_RECOVERY_REQUIRED', 'recovery-required'],
    [503, 'GIT_OPERATION_UNCERTAIN', 'recovery-required'],
    [503, 'CONTROL_LOCK_BUSY', 'uncertain'],
    [503, 'ENGINE_UNAVAILABLE', 'failed'],
    [503, 'PROJECT_HOME_UNAVAILABLE', 'uncertain'],
    [500, 'SOMETHING_NEW', 'uncertain'],
    [403, 'forbidden', 'forbidden'],
    [401, 'authentication_required', 'unauthenticated'],
    [429, 'rate_limited', 'failed'],
  ])('%i %s becomes the %s failure', (status, code, kind) => {
    expect(toCreateFailure(fail(status, code))).toMatchObject({ kind });
  });

  it('tells which remedy a protected branch calls for from what was sent, never from server text', () => {
    const refused = fail(422, 'BRANCH_PROTECTED');
    expect(toCreateFailure(refused, { customBranch: 'release/x', newWorkspace: true })).toEqual({
      kind: 'branch-protected',
      cause: 'typed-branch',
    });
    expect(toCreateFailure(refused, { newWorkspace: true })).toEqual({
      kind: 'branch-protected',
      cause: 'generated-branch',
    });
    expect(toCreateFailure(refused)).toEqual({ kind: 'branch-protected', cause: 'workspace' });
    expect(toOperationFailure('BRANCH_PROTECTED', { newWorkspace: true })).toEqual({
      kind: 'branch-protected',
      cause: 'generated-branch',
    });
  });

  it('a commit that failed after the files were written is recovery, marked as committed', () => {
    expect(toCreateFailure(fail(503, 'COMMIT_FAILED'))).toEqual({
      kind: 'recovery-required',
      committed: true,
    });
    expect(toOperationFailure('COMMIT_FAILED')).toEqual({
      kind: 'recovery-required',
      committed: true,
    });
    // The other journal codes stay the generic recovery.
    expect(toCreateFailure(fail(503, 'CREATE_RECOVERY_REQUIRED'))).toEqual({
      kind: 'recovery-required',
    });
  });

  it('declares an entry as leaving nothing behind only when it is raised before the reservation', () => {
    // Raised after the operation was reserved too (journal, files or a commit may exist).
    const mayFollowReservation = [
      'CONTROL_LOCK_BUSY',
      'REGISTRY_CONFLICT',
      'GIT_POLICY_INVALID',
      'WORKTREE_PATH_CONFLICT',
    ];
    for (const [code, rule] of Object.entries(createSpecErrorCodes))
      expect(rule.outcome, code).toBe(
        rule.kind === 'recovery-required' || mayFollowReservation.includes(code)
          ? 'unknown'
          : 'not-applied',
      );
  });

  it('an unknown 4xx code is classified by its status, never treated as an unknown outcome', () => {
    expect(toCreateFailure(fail(409, 'NEW_CONFLICT_CODE'))).toEqual({
      kind: 'stale',
      code: 'NEW_CONFLICT_CODE',
    });
    expect(toCreateFailure(fail(422, 'NEW_PRECONDITION'))).toEqual({
      kind: 'stale',
      code: 'NEW_PRECONDITION',
    });
  });

  it('keeps the stale code for the explanation and names an automatic branch', () => {
    expect(toCreateFailure(fail(422, 'BASE_REF_NOT_FOUND'))).toEqual({
      kind: 'stale',
      code: 'BASE_REF_NOT_FOUND',
    });
    expect(toCreateFailure(fail(409, 'BRANCH_ALREADY_EXISTS'))).toEqual({
      kind: 'branch-exists',
      automatic: true,
    });
    expect(
      toCreateFailure(fail(409, 'BRANCH_ALREADY_EXISTS'), { customBranch: 'feature/x' }),
    ).toEqual({ kind: 'branch-exists', automatic: false });
  });

  it('separates not sent from lost answers', () => {
    const notSent = new ApiError({
      kind: 'network',
      operation: 'specs.create',
      outcome: 'not-applied',
      retryable: true,
    });
    const lost = new ApiError({
      kind: 'network',
      operation: 'specs.create',
      outcome: 'unknown',
      retryable: true,
    });
    const timeout = new ApiError({
      kind: 'timeout',
      operation: 'specs.create',
      outcome: 'unknown',
      retryable: true,
    });
    expect(toCreateFailure(notSent)).toEqual({ kind: 'offline' });
    expect(toCreateFailure(lost)).toEqual({ kind: 'uncertain' });
    expect(toCreateFailure(timeout)).toEqual({ kind: 'uncertain' });
  });
});

describe('toOperationFailure (a failure the inspection endpoint reported)', () => {
  it.each<[string, CreateFailure['kind']]>([
    ['BRANCH_ALREADY_EXISTS', 'branch-exists'],
    ['BASE_REF_NOT_FOUND', 'stale'],
    ['CONTROL_LOCK_BUSY', 'uncertain'],
    ['REGISTRY_CONFLICT', 'uncertain'],
    ['GIT_POLICY_INVALID', 'uncertain'],
    ['WORKTREE_PATH_CONFLICT', 'uncertain'],
    ['GIT_OPERATION_UNCERTAIN', 'recovery-required'],
    ['GIT_OPERATION_FAILED', 'uncertain'],
    ['INTERNAL_ERROR', 'uncertain'],
    ['SOMETHING_NEW', 'uncertain'],
  ])('%s becomes the %s failure', (code, kind) => {
    expect(toOperationFailure(code)).toMatchObject({ kind });
  });

  it('names whether the rejected branch name was typed', () => {
    expect(toOperationFailure('BRANCH_ALREADY_EXISTS', { customBranch: 'feature/x' })).toEqual({
      kind: 'branch-exists',
      automatic: false,
    });
  });
});

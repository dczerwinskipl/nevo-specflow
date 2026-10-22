import type { CreatedSpec } from '@nevo/specflow-contracts/specs';
import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../api';
import { interpretWatchResult } from './interpretWatchResult';

const created = { specId: 's' } as CreatedSpec;
const apiError = (kind: ApiError['kind'], outcome: ApiError['outcome'], code?: string) =>
  new ApiError({ kind, operation: 'specs.create', outcome, retryable: false, code });

describe('interpretWatchResult', () => {
  it('passes the created specification through', () => {
    expect(interpretWatchResult({ kind: 'completed', created })).toEqual({
      kind: 'completed',
      created,
    });
  });

  it('keeps an open outcome stored: recovery, not started, unresolved', () => {
    expect(interpretWatchResult({ kind: 'recovery-required' })).toMatchObject({
      failure: { kind: 'recovery-required' },
      releaseStorage: false,
      discardAttempt: false,
    });
    expect(interpretWatchResult({ kind: 'not-started' })).toMatchObject({
      failure: { kind: 'uncertain' },
      releaseStorage: false,
      announce: 'notStarted',
    });
    expect(
      interpretWatchResult({ kind: 'unresolved', error: apiError('timeout', 'unknown') }),
    ).toMatchObject({ failure: { kind: 'uncertain' }, releaseStorage: false });
  });

  it.each(['unauthenticated', 'forbidden'] as const)(
    'tells a lost session or capability apart while the outcome stays open (%s)',
    (kind) => {
      expect(
        interpretWatchResult({ kind: 'unresolved', error: apiError(kind, 'not-applied') }),
      ).toMatchObject({ failure: { kind }, releaseStorage: false, discardAttempt: false });
    },
  );

  it('releases a refused request and drops the key only when replaying cannot succeed', () => {
    expect(
      interpretWatchResult({
        kind: 'failed',
        error: apiError('conflict', 'not-applied', 'CREATE_CONFLICT'),
      }),
    ).toMatchObject({
      failure: { kind: 'name-conflict' },
      releaseStorage: true,
      discardAttempt: true,
    });
    expect(
      interpretWatchResult(
        { kind: 'failed', error: apiError('conflict', 'not-applied', 'BRANCH_ALREADY_EXISTS') },
        { customBranch: 'feature/x' },
      ),
    ).toMatchObject({
      failure: { kind: 'branch-exists', automatic: false },
      releaseStorage: true,
      discardAttempt: false,
    });
  });

  it('a failure reported by the inspection is definite only when its code says nothing was applied', () => {
    expect(
      interpretWatchResult({ kind: 'operation-failed', code: 'BASE_REF_NOT_FOUND' }),
    ).toMatchObject({
      failure: { kind: 'stale', code: 'BASE_REF_NOT_FOUND' },
      releaseStorage: true,
      announce: 'operationFailed',
    });
    expect(
      interpretWatchResult({ kind: 'operation-failed', code: 'INTERNAL_ERROR' }),
    ).toMatchObject({ failure: { kind: 'uncertain' }, releaseStorage: false });
  });

  it('a non-API error of a refusal is a plain failure', () => {
    expect(interpretWatchResult({ kind: 'failed', error: new Error('x') })).toMatchObject({
      failure: { kind: 'failed' },
      releaseStorage: true,
    });
  });
});

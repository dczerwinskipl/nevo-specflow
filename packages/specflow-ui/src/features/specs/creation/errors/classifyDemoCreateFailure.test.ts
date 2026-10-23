import { describe, expect, it } from 'vitest';
import { HttpClientError } from '@nevo/http-client';
import { RequestNotSentError } from '../operation/creationPipeline';
import { classifyDemoCreateFailure } from './classifyDemoCreateFailure';

describe('classifyDemoCreateFailure', () => {
  const http = (status: number, data?: unknown) =>
    new HttpClientError('x', { kind: 'http', status, data });
  it('keeps definitive coded answers apart from uncertain ones', () => {
    // The Engine repeats the code in `error`: that is never a message for the reader.
    expect(
      classifyDemoCreateFailure(
        http(409, { error: 'BRANCH_ALREADY_EXISTS', code: 'BRANCH_ALREADY_EXISTS' }),
      ),
    ).toEqual({ kind: 'branch-exists', automatic: true });
    // A name the user typed is not "automatic": the field is the place to fix it.
    expect(
      classifyDemoCreateFailure(http(409, { error: 'm', code: 'BRANCH_ALREADY_EXISTS' }), {
        customBranch: 'feature/x',
      }),
    ).toEqual({ kind: 'branch-exists', automatic: false });
    for (const [status, code] of [
      [409, 'DEMO_WORKSPACE_UNAVAILABLE'],
      [400, 'CREATE_OPERATION_INVALID'],
      [422, 'BASE_REF_NOT_FOUND'],
    ] as const)
      expect(classifyDemoCreateFailure(http(status, { error: code, code })).kind).toBe('stale');
    expect(
      classifyDemoCreateFailure(http(409, { error: 'CREATE_CONFLICT', code: 'CREATE_CONFLICT' }))
        .kind,
    ).toBe('operation-conflict');
    expect(
      classifyDemoCreateFailure(
        http(503, { error: 'CREATE_RECOVERY_REQUIRED', code: 'CREATE_RECOVERY_REQUIRED' }),
      ).kind,
    ).toBe('recovery-required');
    expect(classifyDemoCreateFailure(http(403, { error: 'forbidden' })).kind).toBe('forbidden');
    expect(classifyDemoCreateFailure(http(401, { error: 'authentication_required' })).kind).toBe(
      'unauthenticated',
    );
    expect(
      classifyDemoCreateFailure(http(503, { error: 'demo_specification_creation_failed' })),
    ).toEqual({ kind: 'failed' }); // a code-like value is never shown as a message
  });
  it('maps the commit codes: nothing created (422, 409) or created but not committed (503)', () => {
    expect(
      classifyDemoCreateFailure(
        http(422, { error: 'BRANCH_PROTECTED', code: 'BRANCH_PROTECTED' }),
        {
          customBranch: 'release/x',
          newWorkspace: true,
        },
      ),
    ).toEqual({ kind: 'branch-protected', cause: 'typed-branch' });
    expect(
      classifyDemoCreateFailure(http(422, { error: 'BRANCH_PROTECTED', code: 'BRANCH_PROTECTED' })),
    ).toEqual({ kind: 'branch-protected', cause: 'workspace' });
    expect(
      classifyDemoCreateFailure(http(409, { error: 'COMMIT_BLOCKED', code: 'COMMIT_BLOCKED' })),
    ).toEqual({ kind: 'commit-blocked' });
    expect(
      classifyDemoCreateFailure(http(503, { error: 'COMMIT_FAILED', code: 'COMMIT_FAILED' })),
    ).toEqual({ kind: 'recovery-required', committed: true });
  });
  it('a lost answer is uncertain and must be checked, never repeated as a new create', () => {
    expect(classifyDemoCreateFailure(new Error('Lost create ACK')).kind).toBe('uncertain');
    expect(classifyDemoCreateFailure(new HttpClientError('net', { kind: 'network' })).kind).toBe(
      'uncertain',
    );
    expect(classifyDemoCreateFailure(http(502)).kind).toBe('uncertain');
  });
  // F-02 rule: only "never dispatched" is a definite "nothing happened".
  it('a request that was never dispatched is offline; a timeout or reset after dispatch is not', () => {
    expect(classifyDemoCreateFailure(new RequestNotSentError()).kind).toBe('offline');
    for (const code of ['ECONNABORTED', 'ERR_NETWORK', 'ETIMEDOUT'])
      expect(
        classifyDemoCreateFailure(new HttpClientError('t', { kind: 'network', code })).kind,
      ).toBe('uncertain');
    expect(classifyDemoCreateFailure(new HttpClientError('c', { kind: 'cancelled' })).kind).toBe(
      'uncertain',
    );
  });
  it('403 and a coded 5xx are definitive answers', () => {
    expect(classifyDemoCreateFailure(http(403)).kind).toBe('forbidden');
    expect(
      classifyDemoCreateFailure(
        http(400, { error: 'CREATE_OPERATION_INVALID', code: 'CREATE_OPERATION_INVALID' }),
      ),
    ).toEqual({ kind: 'stale', code: 'CREATE_OPERATION_INVALID' });
    expect(
      classifyDemoCreateFailure(
        http(422, { error: 'BASE_REF_NOT_FOUND', code: 'BASE_REF_NOT_FOUND' }),
      ).kind,
    ).toBe('stale');
    // The server's own text is never carried into the UI state.
    expect(classifyDemoCreateFailure(http(500, { error: 'boom' }))).toEqual({ kind: 'failed' });
  });
});

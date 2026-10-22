import { HttpClientError } from '@nevo/http-client';
import { describe, expect, it } from 'vitest';
import { ApiError, type ApiErrorKind, type MutationOutcome } from './ApiError';
import { classifyHttpError, readServerCode } from './classify';
import type { ErrorCodeTable } from './codes/common';

const codes: ErrorCodeTable = {
  CREATE_CONFLICT: { kind: 'conflict', outcome: 'not-applied' },
  CREATE_RECOVERY_REQUIRED: { kind: 'recovery-required', outcome: 'unknown' },
  CONTROL_LOCK_BUSY: { kind: 'unavailable', outcome: 'not-applied', retryable: true },
};

function http(status: number, data?: unknown, headers?: Record<string, string>): HttpClientError {
  return new HttpClientError('failed', { kind: 'http', status, data, headers });
}

function classify(error: HttpClientError, method = 'POST') {
  const result = classifyHttpError(error, { operation: 'specs.create', method, codes });
  if (!(result instanceof ApiError)) throw new Error('expected an ApiError');
  return result;
}

describe('readServerCode', () => {
  it.each([
    ['A authorization', { error: 'authentication_required' }, 'authentication_required'],
    [
      'B read feature',
      { error: 'specification_source_unavailable' },
      'specification_source_unavailable',
    ],
    ['C engine', { error: 'CREATE_CONFLICT', code: 'CREATE_CONFLICT' }, 'CREATE_CONFLICT'],
    ['D validation', { error: 'Bad Request', code: 'FST_ERR_VALIDATION' }, 'FST_ERR_VALIDATION'],
    [
      'E validation with message',
      { statusCode: 400, code: 'FST_ERR_VALIDATION', error: 'Bad Request', message: 'x' },
      'FST_ERR_VALIDATION',
    ],
    ['F login', { error: 'invalid_credentials' }, 'invalid_credentials'],
    ['G limiter', { statusCode: 429, error: 'rate_limited' }, 'rate_limited'],
    [
      'H leaking 500',
      {
        statusCode: 500,
        code: 'CLOSE_JOURNAL_CORRUPT',
        error: 'Internal Server Error',
        message: 'secret',
      },
      'CLOSE_JOURNAL_CORRUPT',
    ],
  ])('%s', (_shape, body, expected) => expect(readServerCode(body)).toBe(expected));

  it.each([
    ['unknown route', { message: 'Route GET:/x not found', error: 'Not Found', statusCode: 404 }],
    ['HTTP title only', { error: 'Internal Server Error' }],
    ['no body', undefined],
    ['text body', '<html></html>'],
  ])('finds no code in %s', (_name, body) => expect(readServerCode(body)).toBeUndefined());
});

describe('classifyHttpError', () => {
  it('returns a cancellation unchanged', () => {
    const cancelled = new HttpClientError('cancelled', { kind: 'cancelled' });
    expect(classifyHttpError(cancelled, { operation: 'x', method: 'GET' })).toBe(cancelled);
  });

  describe('transport failures', () => {
    it.each<[string, 'timeout' | 'network', string, MutationOutcome]>([
      ['mutation timeout', 'timeout', 'POST', 'unknown'],
      ['read timeout', 'timeout', 'GET', 'not-applied'],
      ['mutation network failure', 'network', 'POST', 'unknown'],
      ['read network failure', 'network', 'GET', 'not-applied'],
    ])('%s', (_name, kind, method, outcome) => {
      const error = classify(new HttpClientError('x', { kind }), method);
      expect(error).toMatchObject({ kind, outcome, retryable: true });
      expect(error.status).toBeUndefined();
    });

    it('treats an unexpected client error as a protocol error', () => {
      expect(classify(new HttpClientError('x', { kind: 'unexpected' }))).toMatchObject({
        kind: 'protocol',
        outcome: 'unknown',
        retryable: false,
      });
    });
  });

  describe('mapping of the eight body shapes', () => {
    it.each<[string, HttpClientError, ApiErrorKind, MutationOutcome, boolean, string?]>([
      [
        'A 401',
        http(401, { error: 'authentication_required' }),
        'unauthenticated',
        'not-applied',
        false,
        'authentication_required',
      ],
      ['A 403', http(403, { error: 'forbidden' }), 'forbidden', 'not-applied', false, 'forbidden'],
      [
        'B 404 domain',
        http(404, { error: 'specification_not_found' }),
        'not-found',
        'not-applied',
        false,
        'specification_not_found',
      ],
      [
        'B 409 revision',
        http(409, { error: 'document_revision_unavailable' }),
        'conflict',
        'not-applied',
        false,
        'document_revision_unavailable',
      ],
      [
        'C 409 context rule',
        http(409, { error: 'CREATE_CONFLICT', code: 'CREATE_CONFLICT' }),
        'conflict',
        'not-applied',
        false,
        'CREATE_CONFLICT',
      ],
      [
        'C 409 unlisted code by status',
        http(409, { error: 'BRANCH_ALREADY_EXISTS', code: 'BRANCH_ALREADY_EXISTS' }),
        'conflict',
        'not-applied',
        false,
        'BRANCH_ALREADY_EXISTS',
      ],
      [
        'C 422 unlisted code by status',
        http(422, { error: 'BASE_REF_NOT_FOUND', code: 'BASE_REF_NOT_FOUND' }),
        'precondition',
        'not-applied',
        false,
        'BASE_REF_NOT_FOUND',
      ],
      [
        'C 400 by status',
        http(400, { error: 'CREATE_OPERATION_INVALID', code: 'CREATE_OPERATION_INVALID' }),
        'validation',
        'not-applied',
        false,
        'CREATE_OPERATION_INVALID',
      ],
      [
        'C 503 recovery',
        http(503, { error: 'CREATE_RECOVERY_REQUIRED', code: 'CREATE_RECOVERY_REQUIRED' }),
        'recovery-required',
        'unknown',
        false,
        'CREATE_RECOVERY_REQUIRED',
      ],
      [
        'C 503 lock busy',
        http(503, { error: 'CONTROL_LOCK_BUSY', code: 'CONTROL_LOCK_BUSY' }),
        'unavailable',
        'not-applied',
        true,
        'CONTROL_LOCK_BUSY',
      ],
      [
        'C 503 unlisted code',
        http(503, { error: 'GIT_POLICY_INVALID', code: 'GIT_POLICY_INVALID' }),
        'unavailable',
        'unknown',
        true,
        'GIT_POLICY_INVALID',
      ],
      [
        'D validation',
        http(400, { error: 'Bad Request', code: 'FST_ERR_VALIDATION' }),
        'validation',
        'not-applied',
        false,
        'FST_ERR_VALIDATION',
      ],
      [
        'E validation',
        http(400, {
          statusCode: 400,
          code: 'FST_ERR_VALIDATION',
          error: 'Bad Request',
          message: 'body/title must NOT be empty',
        }),
        'validation',
        'not-applied',
        false,
        'FST_ERR_VALIDATION',
      ],
      [
        'E 413',
        http(413, {
          statusCode: 413,
          code: 'FST_ERR_CTP_BODY_TOO_LARGE',
          error: 'Payload Too Large',
          message: 'x',
        }),
        'protocol',
        'not-applied',
        false,
        'FST_ERR_CTP_BODY_TOO_LARGE',
      ],
      [
        'E route not found',
        http(404, { message: 'Route POST:/x not found', error: 'Not Found', statusCode: 404 }),
        'protocol',
        'not-applied',
        false,
        undefined,
      ],
      [
        'F login 401',
        http(401, { error: 'invalid_credentials' }),
        'unauthenticated',
        'not-applied',
        false,
        'invalid_credentials',
      ],
      [
        'F login 503',
        http(503, { error: 'service_unavailable' }),
        'unavailable',
        'unknown',
        true,
        'service_unavailable',
      ],
      [
        'G 429',
        http(429, { statusCode: 429, error: 'rate_limited' }),
        'rate-limited',
        'not-applied',
        true,
        'rate_limited',
      ],
      [
        'H 500 leaking message',
        http(500, {
          statusCode: 500,
          code: 'CLOSE_JOURNAL_CORRUPT',
          error: 'Internal Server Error',
          message: 'internal',
        }),
        'server',
        'unknown',
        false,
        'CLOSE_JOURNAL_CORRUPT',
      ],
      ['500 without body', http(500), 'server', 'unknown', false, undefined],
      ['422 without code', http(422, {}), 'precondition', 'not-applied', false, undefined],
    ])('%s', (_name, input, kind, outcome, retryable, code) => {
      expect(classify(input)).toMatchObject({
        kind,
        outcome,
        retryable,
        status: input.status,
        code,
      });
    });
  });

  it('maps 503 specification_source_unavailable to a permanent not-in-runtime unavailability', () => {
    const error = classify(http(503, { error: 'specification_source_unavailable' }), 'GET');
    expect(error).toMatchObject({
      kind: 'unavailable',
      reason: 'not-in-runtime',
      retryable: false,
      outcome: 'not-applied',
    });
  });

  it('classifies a transient 503 without a code as retryable unavailability', () => {
    expect(classify(http(503), 'GET')).toMatchObject({ kind: 'unavailable', retryable: true });
  });

  it('treats a non-JSON answer as a protocol error whose mutation outcome is unknown', () => {
    expect(classify(http(502, '<html>proxy</html>'))).toMatchObject({
      kind: 'protocol',
      outcome: 'unknown',
    });
    expect(classify(http(404, '<!doctype html>'), 'GET')).toMatchObject({
      kind: 'protocol',
      outcome: 'not-applied',
    });
  });

  it('reads Retry-After and the request id from the headers', () => {
    const error = classify(
      http(429, { error: 'rate_limited' }, { 'retry-after': '60', 'x-request-id': 'req-1' }),
    );
    expect(error.retryAfterMs).toBe(60_000);
    expect(error.requestId).toBe('req-1');
  });

  it('ignores an unreadable Retry-After', () => {
    expect(
      classify(http(429, { error: 'rate_limited' }, { 'retry-after': 'soon' })).retryAfterMs,
    ).toBeUndefined();
  });

  it('never exposes server text: the message is technical and carries only operation, kind and code', () => {
    const error = classify(
      http(500, {
        statusCode: 500,
        code: 'X',
        error: 'Internal Server Error',
        message: 'secret path /etc',
      }),
    );
    expect(error.message).toBe('specs.create:server:X');
    expect(error.message).not.toContain('secret');
  });

  it('falls back to the status for a code that is an object property name', () => {
    expect(classify(http(409, { error: 'constructor', code: 'constructor' }))).toMatchObject({
      kind: 'conflict',
    });
  });
});

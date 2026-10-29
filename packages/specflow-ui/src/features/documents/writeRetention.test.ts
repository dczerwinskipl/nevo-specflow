import { HttpClientError } from '@nevo/http-client';
import { describe, expect, it } from 'vitest';
import { writeRetention } from './writeRetention';

const http = (status: number, code?: string, details?: object) =>
  new HttpClientError('failed', {
    kind: 'http',
    status,
    data: code ? { error: code, code, ...(details ? { details } : {}) } : undefined,
  });

describe('which failed document writes are kept for an exact replay', () => {
  it('keeps recovery, a failed write and no answer; drops definite refusals', () => {
    expect(writeRetention(http(503, 'DOCUMENT_RECOVERY_REQUIRED'))).toBe('recovery');
    expect(writeRetention(http(503, 'DOCUMENT_WRITE_FAILED', { cause: 'no-space' }))).toBe(
      'unknown',
    );
    expect(writeRetention(new HttpClientError('reset', { kind: 'network' }))).toBe('unknown');
    expect(writeRetention(http(409, 'DOCUMENT_REVISION_CONFLICT'))).toBeUndefined();
  });
});

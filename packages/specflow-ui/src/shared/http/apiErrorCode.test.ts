import { HttpClientError } from '@nevo/http-client';
import { describe, expect, it } from 'vitest';
import { classifyHttpError } from '../../api/classify';
import { apiErrorCode, writeOutcomeUnknown } from './apiErrorCode';

const recovery = () =>
  new HttpClientError('Service Unavailable', {
    kind: 'http',
    status: 503,
    data: { error: 'DOCUMENT_RECOVERY_REQUIRED', code: 'DOCUMENT_RECOVERY_REQUIRED' },
  });

describe('a 503 DOCUMENT_RECOVERY_REQUIRED answer', () => {
  it('classified into an ApiError (no code rule): the outcome is unknown, the code is kept', () => {
    const error = classifyHttpError(recovery(), {
      operation: 'documents.save',
      method: 'PUT',
    });
    expect(writeOutcomeUnknown(error)).toBe(true);
    expect(apiErrorCode(error)).toBe('DOCUMENT_RECOVERY_REQUIRED');
  });

  it('as the raw client error the document writes receive: a status, so not "unknown"; the code decides', () => {
    // The document writes use the raw client: their recovery handling keys on this code
    // (retained save, resumable operation and import), not on an unknown outcome.
    expect(writeOutcomeUnknown(recovery())).toBe(false);
    expect(apiErrorCode(recovery())).toBe('DOCUMENT_RECOVERY_REQUIRED');
  });
});

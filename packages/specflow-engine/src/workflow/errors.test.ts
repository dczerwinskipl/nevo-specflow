import { describe, expect, it } from 'vitest';

import { DOCUMENT_CHANGE_ERROR_MAP } from '../specs/documents/changes/errors';
import { MANUAL_COMMIT_ERROR_MAP } from '../specs/manual-commit/errors';
import { SPECIFICATION_BUSY_CAUSES } from './errors';

describe('SPECIFICATION_BUSY_CAUSES', () => {
  it('names every busy cause a document or manual commit refusal can carry', () => {
    const busy = [
      ...Object.values(DOCUMENT_CHANGE_ERROR_MAP),
      ...Object.values(MANUAL_COMMIT_ERROR_MAP),
    ].flatMap((mapping) =>
      mapping.code === 'SPEC_BUSY' && 'detail' in mapping ? [mapping.detail] : [],
    );

    expect(busy.length).toBeGreaterThan(0);
    expect(SPECIFICATION_BUSY_CAUSES).toEqual(expect.arrayContaining([...new Set(busy)]));
  });
});

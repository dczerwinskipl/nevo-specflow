import { describe, expect, it } from 'vitest';

import type { DocumentBatchRecord } from '../changes/journal';
import { batchCommitRequest, batchTrailers } from './commit-request';

const batch = {
  operationId: '00000000-0000-4000-8000-000000000001',
  specId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
  slug: 'demo',
  branch: 'feature/work',
} as unknown as DocumentBatchRecord;
const member = (n: number, action = 'save') => ({
  operationId: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
  action,
});

describe('the trailers of a batch commit', () => {
  it('names the spec, the action, the effective documents and the other members', () => {
    expect(
      batchTrailers(
        batch,
        [member(1), member(2), member(3)],
        ['specs/active/demo/notes.md', 'specs/active/demo/specification.yaml'],
      ),
    ).toEqual({
      'Nevo-Spec': batch.specId,
      'Nevo-Action': 'save',
      'Nevo-Documents': 'notes.md,specification.yaml',
      'Nevo-Coalesced': `${member(2).operationId},${member(3).operationId}`,
    });
  });

  it('is mixed when the members differ and has no Coalesced for a single member', () => {
    const single = batchTrailers(batch, [member(1, 'create')], ['specs/active/demo/a.md']);
    expect(single['Nevo-Action']).toBe('create');
    expect('Nevo-Coalesced' in single).toBe(false);
    const mixed = batchTrailers(
      batch,
      [member(1), member(2, 'rename')],
      ['specs/active/demo/a.md'],
    );
    expect(mixed['Nevo-Action']).toBe('mixed');
  });

  it('cuts the coalesced ids at id boundaries with a count', () => {
    const members = Array.from({ length: 12 }, (_, i) => member(i + 1));
    const value = batchTrailers(batch, members, ['specs/active/demo/a.md'])['Nevo-Coalesced']!;
    expect(value.length).toBeLessThanOrEqual(200);
    expect(value).toMatch(/,\+\d+$/u);
    for (const part of value.split(',').filter((p) => !p.startsWith('+'))) {
      expect(part).toHaveLength(36);
    }
  });

  it('builds the request on the pinned branch with the batch id as the operation', () => {
    const request = batchCommitRequest(
      batch,
      'checkout-root',
      [member(1)],
      { effective: ['specs/active/demo/a.md'], dropped: ['specs/active/demo/b.md'] },
      1000,
    );
    expect(request).toMatchObject({
      root: 'checkout-root',
      expectedBranch: 'feature/work',
      paths: ['specs/active/demo/a.md'],
      droppedPaths: ['specs/active/demo/b.md'],
      operationId: batch.operationId,
      kind: 'document-change',
      deadlineMs: 1000,
    });
  });
});

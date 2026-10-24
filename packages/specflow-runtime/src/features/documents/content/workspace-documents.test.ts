import { DocumentError, SpecificationError, type SpecFlowEngine } from '@nevo/specflow-engine';
import { describe, expect, it, vi } from 'vitest';

const summaries = vi.hoisted(() => vi.fn());
vi.mock('@nevo/specflow-engine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@nevo/specflow-engine')>()),
  readRegisteredDocumentSummaries: summaries,
}));

import { createEngineWorkspaceDocuments } from './workspace-documents';

const engine = {} as SpecFlowEngine;

describe('createEngineWorkspaceDocuments', () => {
  it('maps registered documents to workspace items with the type id as kind', async () => {
    summaries.mockResolvedValueOnce([
      { id: 'overview', path: 'overview.md', type: 'overview', title: 'T', revision: 'r1' },
      { id: 'ux', path: 'sub/ux.md', type: 'ux', title: 'UX', revision: 'r2' },
    ]);
    expect(await createEngineWorkspaceDocuments(engine)('spec')).toEqual({
      state: 'available',
      data: {
        items: [
          { id: 'overview', title: 'T', filename: 'overview.md', revision: 'r1', kind: 'overview' },
          { id: 'ux', title: 'UX', filename: 'sub/ux.md', revision: 'r2', kind: 'ux' },
        ],
      },
    });
  });

  it.each([
    new DocumentError('SPEC_SOURCE_UNAVAILABLE', 'x'),
    new DocumentError('DOCUMENT_NOT_FOUND', 'x'),
    new SpecificationError('SPEC_SOURCE_INVALID', 'invalid manifest'),
  ])('degrades to the unavailable state for %s', async (error) => {
    summaries.mockRejectedValueOnce(error);
    expect(await createEngineWorkspaceDocuments(engine)('spec')).toEqual({
      state: 'unavailable',
      reason: 'source_unavailable',
    });
  });

  it('does not hide a defect', async () => {
    summaries.mockRejectedValueOnce(new Error('EACCES'));
    await expect(createEngineWorkspaceDocuments(engine)('spec')).rejects.toThrow('EACCES');
  });
});

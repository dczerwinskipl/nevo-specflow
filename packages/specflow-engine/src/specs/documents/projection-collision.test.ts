import { describe, expect, it, vi } from 'vitest';

vi.mock('./document-ids', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./document-ids')>()),
  // Every unclassified path derives the same id: the residual hash collision, forced.
  deriveUnclassifiedDocumentId: () => 'u-' + '0'.repeat(32),
}));

import { projectDocumentTree } from './projection';

const file = (path: string) => ({
  path,
  size: 1,
  revision: 'r',
  kind: 'text' as const,
  mediaType: 'text/plain; charset=utf-8',
});

describe('projectDocumentTree: derived id collision', () => {
  const manifest = {
    archetype: {
      id: 'minimal',
      version: 1,
      requirements: [{ documentType: 'overview', minCount: 1 }],
    },
    documents: [{ id: 'overview', path: 'overview.md', type: 'overview' }],
    folders: [],
  };
  const base = {
    manifest,
    manifestBytes: Buffer.from('m'),
    location: 'active' as const,
    truncated: false,
    skippedEntries: 0,
    skippedPaths: [],
    archiveLimit: { exceeded: false },
  };

  it('fails closed when two files derive the same id', () => {
    expect(() =>
      projectDocumentTree({
        ...base,
        files: [file('overview.md'), file('a.md'), file('b.md')],
      }),
    ).toThrowError(expect.objectContaining({ code: 'SPEC_SOURCE_UNAVAILABLE' }) as Error);
  });

  it('accepts one unclassified file (a registered path never takes part)', () => {
    const tree = projectDocumentTree({ ...base, files: [file('overview.md'), file('a.md')] });
    expect(tree.documents).toHaveLength(2);
  });
});

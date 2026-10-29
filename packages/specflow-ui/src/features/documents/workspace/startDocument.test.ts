import { describe, expect, it } from 'vitest';
import { documentTreeFixture } from '../../../../test-support/documents/fixtures';
import { startDocument } from './startDocument';

const tree = documentTreeFixture({
  documents: [
    { id: 'notes', path: 'notes.md' },
    { id: 'overview', path: 'overview.md', protected: true },
  ],
});

describe('the document a visit opens by itself', () => {
  it('is the main file when nothing is chosen on a split workspace', () => {
    expect(startDocument({ tree, openTabs: 0, split: true })).toBe('overview');
  });

  it('is nothing when the reader chose, on a narrow workspace, or without a main file', () => {
    expect(startDocument({ tree, documentId: 'notes', openTabs: 1, split: true })).toBeUndefined();
    expect(startDocument({ tree, openTabs: 1, split: true })).toBeUndefined();
    expect(startDocument({ tree, openTabs: 0, split: false })).toBeUndefined();
    expect(
      startDocument({ tree: documentTreeFixture({ documents: [] }), openTabs: 0, split: true }),
    ).toBeUndefined();
  });
});

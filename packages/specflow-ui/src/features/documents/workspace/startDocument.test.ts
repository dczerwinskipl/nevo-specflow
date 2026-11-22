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
  it('opens the main file beside the tree on split layouts', () => {
    expect(startDocument({ tree, openTabs: 0, supportsSplit: true })).toBe('overview');
  });

  it('leaves the tree visible on stacked layouts', () => {
    expect(startDocument({ tree, openTabs: 0, supportsSplit: false })).toBeUndefined();
  });

  it('is nothing when the reader chose, or without a main file', () => {
    expect(
      startDocument({ tree, documentId: 'notes', openTabs: 1, supportsSplit: true }),
    ).toBeUndefined();
    expect(startDocument({ tree, openTabs: 1, supportsSplit: true })).toBeUndefined();
    expect(
      startDocument({
        tree: documentTreeFixture({ documents: [] }),
        openTabs: 0,
        supportsSplit: true,
      }),
    ).toBeUndefined();
  });
});

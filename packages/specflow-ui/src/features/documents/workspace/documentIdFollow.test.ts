import { describe, expect, it } from 'vitest';
import { documentTreeFixture } from '../../../../test-support/documents/fixtures';
import { followedDocuments, treeWithFollowed } from './documentIdFollow';

const before = documentTreeFixture({
  folders: ['notes'],
  documents: [
    { id: 'u-notes-a-md', path: 'notes/a.md', classification: 'unclassified', type: undefined },
    { id: 'ux', path: 'notes/ux.md', type: 'ux' },
  ],
});
const record = (id: string, path: string, type?: string) => ({
  id,
  path,
  revision: 'r2',
  ...(type ? { type } : {}),
});

describe('followedDocuments', () => {
  it('follows a classified document to its registered id, with its type', () => {
    expect(
      followedDocuments(
        before,
        {
          action: 'classify',
          kind: 'document',
          documentId: 'u-notes-a-md',
          type: 'research',
          expectedRevision: '1',
        },
        { documents: [record('research', 'notes/a.md', 'research')] },
      ),
    ).toEqual([
      {
        from: 'u-notes-a-md',
        to: 'research',
        path: 'notes/a.md',
        revision: 'r2',
        type: 'research',
      },
    ]);
  });

  it('follows an unclassified file renamed in place and ignores a registered one (stable id)', () => {
    expect(
      followedDocuments(
        before,
        {
          action: 'rename',
          kind: 'document',
          documentId: 'u-notes-a-md',
          name: 'b.md',
          expectedRevision: '1',
        },
        { documents: [record('u-notes-b-md', 'notes/b.md')] },
      ),
    ).toEqual([{ from: 'u-notes-a-md', to: 'u-notes-b-md', path: 'notes/b.md', revision: 'r2' }]);
    expect(
      followedDocuments(
        before,
        {
          action: 'rename',
          kind: 'document',
          documentId: 'ux',
          name: 'x.md',
          expectedRevision: '1',
        },
        { documents: [record('ux', 'notes/x.md', 'ux')] },
      ),
    ).toEqual([]);
  });

  it('follows the unclassified files of a renamed or moved folder by their old paths', () => {
    expect(
      followedDocuments(
        before,
        { action: 'rename', kind: 'folder', path: 'notes', name: 'memo', expectedRevision: 't' },
        {
          documents: [record('u-memo-a-md', 'memo/a.md'), record('ux', 'memo/ux.md', 'ux')],
        },
      ),
    ).toEqual([{ from: 'u-notes-a-md', to: 'u-memo-a-md', path: 'memo/a.md', revision: 'r2' }]);
    expect(
      followedDocuments(
        before,
        {
          action: 'move',
          kind: 'folder',
          path: 'notes',
          targetFolder: 'old',
          expectedRevision: 't',
        },
        { documents: [record('u-old-notes-a-md', 'old/notes/a.md')] },
      ).map((move) => [move.from, move.to]),
    ).toEqual([['u-notes-a-md', 'u-old-notes-a-md']]);
  });

  it('puts followed documents in the cached tree under their new ids', () => {
    const next = treeWithFollowed(before, [
      {
        from: 'u-notes-a-md',
        to: 'research',
        path: 'notes/a.md',
        revision: 'r2',
        type: 'research',
      },
    ]);
    expect(next.documents[0]).toMatchObject({
      id: 'research',
      classification: 'registered',
      type: 'research',
      revision: 'r2',
    });
    expect(next.documents[1]).toBe(before.documents[1]);
  });
});

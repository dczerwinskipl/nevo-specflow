import { describe, expect, it } from 'vitest';
import { documentTreeFixture } from '../../../../test-support/documents/fixtures';
import { treeRows } from './documentTreePolicy';
import { NO_TYPE, activeFilterCount, filterTreeRows, treeTypes } from './treeFilter';

const tree = documentTreeFixture({
  folders: ['notes', 'notes/old', 'design'],
  documents: [
    { id: 'overview', path: 'overview.md', type: 'overview', protected: true },
    { id: 'ux', path: 'design/login-flow.md', type: 'ux' },
    {
      id: 'u-a',
      path: 'notes/old/meeting.md',
      classification: 'unclassified',
      type: undefined,
    },
  ],
  dangling: [
    {
      id: 'backend',
      path: 'backend.md',
      type: 'backend',
      actions: { delete: { available: true } },
    },
  ],
});
const rows = treeRows(tree);
const paths = (filtered: ReturnType<typeof filterTreeRows>) => ({
  folders: filtered.rows.folders.map((folder) => folder.path),
  documents: filtered.rows.documents.map((row) => row.path),
});

describe('filtering the tree', () => {
  it('keeps every row without an active filter', () => {
    expect(filterTreeRows(rows, { term: ' ', types: [] }).rows).toBe(rows);
  });

  it('matches the path and keeps the folders above a match', () => {
    const result = filterTreeRows(rows, { term: 'MEET', types: [] });
    expect(paths(result)).toEqual({
      folders: ['', 'notes', 'notes/old'],
      documents: ['notes/old/meeting.md'],
    });
    // The missing file is hidden by the filter: the tree says so.
    expect(result.hiddenMissing).toBe(1);
  });

  it('filters by type, with "no type" for unclassified files', () => {
    expect(paths(filterTreeRows(rows, { term: '', types: [NO_TYPE] })).documents).toEqual([
      'notes/old/meeting.md',
    ]);
    const backend = filterTreeRows(rows, { term: '', types: ['backend', 'ux'] });
    expect(paths(backend).documents).toEqual(['design/login-flow.md', 'backend.md']);
    expect(backend.hiddenMissing).toBe(0);
  });

  it('lists the types present and counts the active filters', () => {
    expect(treeTypes(rows)).toEqual(['overview', 'ux', NO_TYPE, 'backend']);
    expect(activeFilterCount({ term: 'x', types: ['ux'] })).toBe(2);
    expect(activeFilterCount({ term: ' ', types: [] })).toBe(0);
  });
});

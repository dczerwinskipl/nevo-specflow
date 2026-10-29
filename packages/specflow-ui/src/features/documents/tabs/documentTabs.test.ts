import { describe, expect, it } from 'vitest';
import { documentTabs, fileNameOf, neighbourOf, survivorOf } from './documentTabs';

const tree = (...paths: [string, string][]) => ({
  documents: paths.map(([id, path]) => ({ id, path })),
});

describe('neighbours', () => {
  it('takes the right neighbour, else the left one, and none for the last tab', () => {
    expect(neighbourOf(['a', 'b', 'c'], 'b')).toBe('c');
    expect(neighbourOf(['a', 'b', 'c'], 'c')).toBe('b');
    expect(neighbourOf(['a'], 'a')).toBeUndefined();
    expect(neighbourOf(['a'], 'x')).toBeUndefined();
  });

  it('skips tabs that close together', () => {
    expect(survivorOf(['a', 'b', 'c', 'd'], 'b', ['b', 'c'])).toBe('d');
    expect(survivorOf(['a', 'b', 'c'], 'c', ['b', 'c'])).toBe('a');
    expect(survivorOf(['a', 'b'], 'a', ['a', 'b'])).toBeUndefined();
  });
});

describe('document tabs', () => {
  it('names a tab after the file in the tree and marks unsaved tabs', () => {
    expect(documentTabs({ ids: ['a'], tree: tree(['a', 'docs/a.md']), dirty: ['a'] })).toEqual([
      { id: 'a', label: 'a.md', path: 'docs/a.md', dirty: true, state: 'ready' },
    ]);
  });

  it('shows a dangling entry as a missing tab named after its registered file', () => {
    expect(
      documentTabs({
        ids: ['backend'],
        tree: { documents: [], dangling: [{ id: 'backend', path: 'backend.md' }] },
        dirty: [],
      }),
    ).toEqual([
      { id: 'backend', label: 'backend.md', path: 'backend.md', dirty: false, state: 'missing' },
    ]);
  });

  it('refreshes the name after a rename (the id is stable) without a request', () => {
    const before = documentTabs({ ids: ['a'], tree: tree(['a', 'a.md']), dirty: [] });
    const after = documentTabs({ ids: ['a'], tree: tree(['a', 'notes/b.md']), dirty: [] });
    expect(before[0]).toMatchObject({ label: 'a.md' });
    expect(after[0]).toMatchObject({ label: 'b.md', path: 'notes/b.md', state: 'ready' });
  });

  it('shows loading until the tree is there and missing once the tree lacks the document', () => {
    expect(documentTabs({ ids: ['a'], tree: undefined, dirty: [] })[0]?.state).toBe('loading');
    expect(documentTabs({ ids: ['a'], tree: tree(), dirty: [] })[0]).toMatchObject({
      state: 'missing',
      label: 'a',
    });
  });

  it('keeps the last known name of a document that disappeared', () => {
    expect(
      documentTabs({
        ids: ['a'],
        tree: tree(),
        dirty: ['a'],
        knownPaths: { a: 'docs/a.md' },
      })[0],
    ).toEqual({ id: 'a', label: 'a.md', path: 'docs/a.md', dirty: true, state: 'missing' });
  });

  it('marks a document missing when the Runtime says so although the tree lists it', () => {
    expect(
      documentTabs({ ids: ['a'], tree: tree(['a', 'a.md']), dirty: [], unavailable: ['a'] })[0]
        ?.state,
    ).toBe('missing');
  });

  it('names a path by its last segment', () => {
    expect(fileNameOf('a/b/c.md')).toBe('c.md');
    expect(fileNameOf('')).toBe('');
  });
});

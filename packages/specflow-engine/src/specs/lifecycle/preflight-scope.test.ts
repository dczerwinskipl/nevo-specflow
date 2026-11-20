import { describe, expect, it } from 'vitest';

import { isAcceptedDirtyPath, scopedPaths } from './preflight';

describe('scopedPaths', () => {
  it("names only the Specification's own folder `specification`, its files first", () => {
    expect(
      scopedPaths(
        [
          'scratch-notes.txt',
          'specs/active/a-2/overview.md',
          'specs/active/a/overview.md',
          'specs/active/a',
        ],
        'specs/active/a',
      ),
    ).toEqual([
      { path: 'specs/active/a/overview.md', scope: 'specification' },
      { path: 'scratch-notes.txt', scope: 'other' },
      // A sibling whose slug starts with the same letters is another Specification.
      { path: 'specs/active/a-2/overview.md', scope: 'other' },
      { path: 'specs/active/a', scope: 'other' },
    ]);
  });

  it('scopes nothing without a Specification directory', () => {
    expect(scopedPaths(['specs/active/a/overview.md'], undefined)).toEqual([
      { path: 'specs/active/a/overview.md', scope: 'other' },
    ]);
  });
});

describe('isAcceptedDirtyPath (#181 sibling-isolation widening)', () => {
  it("accepts the closing Specification's own execution state", () => {
    expect(
      isAcceptedDirtyPath('specs/active/b/.execution/state.json', {
        specificationDirectory: 'specs/active/b',
        acceptExecutionState: true,
      }),
    ).toBe(true);
  });

  it('does not accept its own execution state without acceptExecutionState', () => {
    expect(
      isAcceptedDirtyPath('specs/active/b/.execution/state.json', {
        specificationDirectory: 'specs/active/b',
      }),
    ).toBe(false);
  });

  it('does not accept its own non-execution-state documents', () => {
    expect(
      isAcceptedDirtyPath('specs/active/b/overview.md', {
        specificationDirectory: 'specs/active/b',
        acceptExecutionState: true,
      }),
    ).toBe(false);
  });

  it('accepts a sibling directory matching the second of several known directories', () => {
    expect(
      isAcceptedDirtyPath('specs/active/other/.execution/state.json', {
        specificationDirectory: 'specs/active/b',
        acceptExecutionState: true,
        siblingDirectories: ['specs/active/a', 'specs/active/other'],
      }),
    ).toBe(true);
  });

  it('refuses a path matching no known directory', () => {
    expect(
      isAcceptedDirtyPath('specs/active/unregistered/.execution/state.json', {
        specificationDirectory: 'specs/active/b',
        acceptExecutionState: true,
        siblingDirectories: ['specs/active/a'],
      }),
    ).toBe(false);
  });

  it("never checks an owner's entry against a directory that is not that owner's own", () => {
    // A path that is execution-state-shaped under directory "a" but physically lies under "b"'s own
    // folder must not be exempted just because "a" is a known sibling directory elsewhere.
    expect(
      isAcceptedDirtyPath('specs/active/b/tasks/t1/notes.md', {
        specificationDirectory: 'specs/active/b',
        siblingDirectories: ['specs/active/a'],
      }),
    ).toBe(false);
  });

  it('refuses an unexplained path belonging to no registered directory even with siblings known', () => {
    expect(
      isAcceptedDirtyPath('scratch-notes.txt', {
        specificationDirectory: 'specs/active/b',
        acceptExecutionState: true,
        siblingDirectories: ['specs/active/a'],
      }),
    ).toBe(false);
  });

  it("a single known directory (today's only caller shape) behaves byte-for-byte as before", () => {
    const check = { specificationDirectory: 'specs/active/b', acceptExecutionState: true };
    expect(isAcceptedDirtyPath('specs/active/b/.execution/state.json', check)).toBe(true);
    expect(isAcceptedDirtyPath('specs/active/b/overview.md', check)).toBe(false);
    expect(isAcceptedDirtyPath('specs/active/other/overview.md', check)).toBe(false);
  });
});

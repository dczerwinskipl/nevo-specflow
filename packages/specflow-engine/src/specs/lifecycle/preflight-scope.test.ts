import { describe, expect, it } from 'vitest';

import { scopedPaths } from './preflight';

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

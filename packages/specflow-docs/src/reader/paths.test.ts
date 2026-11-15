import { describe, expect, it } from 'vitest';

import { pathsUnderDocsRoot, skippedUnderDocsRoot } from './paths';

describe('reader paths', () => {
  it('rewrites paths below docs.root, also inside skip reasons, and nothing else', () => {
    expect(
      skippedUnderDocsRoot('docs/v1.0', [
        {
          path: 'docs/v1.0/a.md',
          error: "duplicate id 'x' (also in docs/v1.0/b.md, docs/v1.0/c/d.md)",
        },
        { path: 'docs/v1.0/e.md', error: 'Invalid YAML frontmatter in docs/v1.0/e.md: bad' },
      ]),
    ).toEqual([
      { path: 'a.md', error: "duplicate id 'x' (also in b.md, c/d.md)" },
      { path: 'e.md', error: 'Invalid YAML frontmatter in e.md: bad' },
    ]);
    // Only a whole path segment matches, and `.` is not a wildcard.
    expect(pathsUnderDocsRoot('docs', 'see mydocs/a.md and docs2/a.md')).toBe(
      'see mydocs/a.md and docs2/a.md',
    );
    expect(pathsUnderDocsRoot('docs/v1.0', 'docs/v1x0/a.md')).toBe('docs/v1x0/a.md');
  });
});

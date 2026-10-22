import { describe, expect, it } from 'vitest';

import {
  branchPatternProblem,
  engineCommitRefusal,
  isValidBranchPattern,
  matchesBranchPattern,
} from './branch-protection';

/** Same vectors as the Engine copy (packages/specflow-engine/test/branch-patterns.test.ts). */
const MATCH_VECTORS: readonly (readonly [string, string, boolean])[] = [
  ['main', 'main', true],
  ['main', 'Main', false],
  ['main', 'main2', false],
  ['main', 'feature/main', false],
  ['release/*', 'release/1.0', true],
  ['release/*', 'release/1.0/rc', false],
  ['release/*', 'release/x', true],
  ['release/**', 'release/1.0/rc', true],
  ['release/**', 'release/1.0', true],
  ['release/**', 'release', false],
  ['**', 'a/b/c', true],
  ['*', 'a/b', false],
  ['*', 'a', true],
  ['feature/*-x', 'feature/a-x', true],
  ['feature/*-x', 'feature/a/b-x', false],
  ['v?.0', 'v1.0', true],
  ['v?.0', 'v10.0', false],
  ['a?b', 'a/b', false],
  ['v[0-9].0', 'v7.0', true],
  ['v[0-9].0', 'vx.0', false],
  ['v[!0-9].0', 'vx.0', true],
  ['v[!0-9].0', 'v1.0', false],
  ['v[^0-9].0', 'v/.0', false],
  ['[abc]ar', 'bar', true],
  ['[abc]ar', 'dar', false],
  ['x[-a]y', 'x-y', true],
  ['a.b', 'axb', false],
  ['a.b', 'a.b', true],
];

describe('branch protection pattern', () => {
  it.each(MATCH_VECTORS)('pattern %j against %j -> %s', (pattern, branch, expected) => {
    expect(isValidBranchPattern(pattern)).toBe(true);
    expect(matchesBranchPattern(pattern, branch)).toBe(expected);
  });

  it.each([
    ['', 'empty'],
    ['x'.repeat(201), 'too-long'],
    ['a b', 'characters'],
    ['a\\b', 'characters'],
    ['a{b}', 'characters'],
    ['/a', 'structure'],
    ['a/', 'structure'],
    ['a//b', 'structure'],
    ['a..b', 'structure'],
    ['refs/heads/main', 'structure'],
    ['a.lock', 'structure'],
    ['[', 'structure'],
    ['[]', 'structure'],
    ['[!]', 'structure'],
    ['[z-a]', 'structure'],
    ['a]', 'structure'],
    ['a!b', 'structure'],
    ['[a/b]', 'structure'],
  ] as const)('rejects %j as %s', (pattern, problem) => {
    expect(branchPatternProblem(pattern)).toBe(problem);
    expect(matchesBranchPattern(pattern, 'main')).toBe(false);
  });

  it('decides protected before allowed and treats no allow-list as allowed', () => {
    expect(engineCommitRefusal({ protectedBranches: [] }, 'main')).toBeUndefined();
    expect(engineCommitRefusal({ protectedBranches: ['main'] }, 'main')).toBe('branch-protected');
    expect(
      engineCommitRefusal(
        { protectedBranches: ['release/**'], allowedBranches: ['**'] },
        'release/1',
      ),
    ).toBe('branch-protected');
    expect(
      engineCommitRefusal({ protectedBranches: [], allowedBranches: ['feature/**'] }, 'develop'),
    ).toBe('branch-not-allowed');
    expect(
      engineCommitRefusal(
        { protectedBranches: [], allowedBranches: ['feature/**'] },
        'feature/a/b',
      ),
    ).toBeUndefined();
  });
});

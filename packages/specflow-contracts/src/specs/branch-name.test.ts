import { describe, expect, it } from 'vitest';

import { BRANCH_NAME_MAX_LENGTH, branchNameProblem, isValidBranchName } from './branch-name';

describe('branch name rule', () => {
  it.each(['feature/x', 'a', 'release-1.2/rc.1', 'A_b/c-d', 'x'.repeat(BRANCH_NAME_MAX_LENGTH)])(
    'accepts %j',
    (name) => {
      expect(isValidBranchName(name)).toBe(true);
    },
  );

  it.each([
    ['', 'empty'],
    ['x'.repeat(BRANCH_NAME_MAX_LENGTH + 1), 'too-long'],
    ['_x', 'characters'],
    ['-x', 'characters'],
    ['zażółć', 'characters'],
    ['a#b', 'characters'],
    ['a@b', 'characters'],
    ['a b', 'characters'],
    ['a..b', 'structure'],
    ['a//b', 'structure'],
    ['a/', 'structure'],
    ['a.', 'structure'],
    ['x.lock', 'structure'],
    ['a/.hidden', 'structure'],
    ['a/b.lock/c', 'structure'],
  ] as const)('rejects %j as %s', (name, problem) => {
    expect(branchNameProblem(name)).toBe(problem);
  });
});

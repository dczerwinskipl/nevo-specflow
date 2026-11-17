import { describe, expect, it } from 'vitest';

import { parseGitWorktreePolicy } from '../../version-control/worktrees/policy';
import { closeRepositoryMode } from './repository-mode';

const gitOn = parseGitWorktreePolicy({ git: { enabled: true } });
const gitOff = parseGitWorktreePolicy({ git: { enabled: false, integrationTargetBranch: 'main' } });
const noGitBlock = parseGitWorktreePolicy({});

describe('closeRepositoryMode', () => {
  it('archives a Specification in place when Git is off or not configured at all', () => {
    for (const policy of [gitOff, noGitBlock]) {
      expect(closeRepositoryMode(policy, { kind: 'specification-close' })).toBe('git-off');
      expect(
        closeRepositoryMode(policy, {
          kind: 'specification-close',
          integrateToTargetBranch: false,
        }),
      ).toBe('git-off');
    }
  });

  it('refuses an explicit integration when Git is off instead of archiving silently', () => {
    expect(() =>
      closeRepositoryMode(noGitBlock, {
        kind: 'specification-close',
        integrateToTargetBranch: true,
      }),
    ).toThrow(expect.objectContaining({ code: 'CLOSE_INVALID' }));
  });

  it('keeps Git when the project uses it, and for Worktree and Workspace Close', () => {
    expect(closeRepositoryMode(gitOn, { kind: 'specification-close' })).toBe('git');
    expect(closeRepositoryMode(gitOff, { kind: 'worktree-close' })).toBe('git');
    expect(closeRepositoryMode(gitOff, { kind: 'workspace-close' })).toBe('git');
  });
});

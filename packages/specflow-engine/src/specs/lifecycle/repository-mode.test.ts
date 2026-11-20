import { describe, expect, it } from 'vitest';

import { parseGitWorktreePolicy } from '../../version-control/worktrees/policy';
import { closeRepositoryMode, repositoryModeOf } from './repository-mode';

const gitOn = parseGitWorktreePolicy({ git: { enabled: true } });
const gitOff = parseGitWorktreePolicy({ git: { enabled: false, integrationTargetBranch: 'main' } });
const noGitBlock = parseGitWorktreePolicy({});

describe('closeRepositoryMode', () => {
  it('archives a Specification in place when Git is off or not configured at all', () => {
    for (const policy of [gitOff, noGitBlock]) {
      expect(repositoryModeOf(policy)).toBe('git-off');
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

  it('refuses Worktree and Workspace Close when Git is off', () => {
    for (const kind of ['worktree-close', 'workspace-close'] as const) {
      expect(() => closeRepositoryMode(gitOff, { kind })).toThrow(
        expect.objectContaining({
          code: 'CLOSE_INVALID',
          message:
            'Git is off for this project: closing a worktree integrates it with Git; archive the Specification instead, or turn Git on.',
        }),
      );
    }
  });

  it('keeps Git for every Close when the project uses it', () => {
    expect(repositoryModeOf(gitOn)).toBe('git');
    for (const kind of ['specification-close', 'worktree-close', 'workspace-close'] as const) {
      expect(closeRepositoryMode(gitOn, { kind })).toBe('git');
    }
  });
});

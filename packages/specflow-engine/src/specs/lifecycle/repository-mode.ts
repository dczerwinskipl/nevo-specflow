import type { GitWorktreePolicy } from '../../version-control/worktrees/policy';
import { CloseOperationError } from './model';

/**
 * How a Close treats the repository: `git` (archive commit, optional integration, the repository
 * preconditions) or `git-off` (archive in place, nothing committed or merged, no repository
 * precondition).
 */
export type CloseRepositoryMode = 'git' | 'git-off';

/** The repository mode the project Git policy sets: Git off with `git.enabled: false` or no `git:` block. */
export function repositoryModeOf(policy: Pick<GitWorktreePolicy, 'enabled'>): CloseRepositoryMode {
  return policy.enabled ? 'git' : 'git-off';
}

/**
 * The one decision of the Close repository mode, from the project Git policy (owner decisions
 * 2026-11-17): a Specification Close in a project with Git off archives in place. With Git off,
 * asking a Specification Close to integrate (primary or linked) and any Worktree or Workspace Close
 * (an integration by definition) are refused with `CLOSE_INVALID` before the workflow gate.
 */
export function closeRepositoryMode(
  policy: Pick<GitWorktreePolicy, 'enabled'>,
  request: {
    readonly kind: 'specification-close' | 'worktree-close' | 'workspace-close';
    readonly integrateToTargetBranch?: boolean;
  },
): CloseRepositoryMode {
  if (repositoryModeOf(policy) === 'git') {
    return 'git';
  }

  if (request.kind !== 'specification-close') {
    throw new CloseOperationError(
      'CLOSE_INVALID',
      'Git is off for this project: closing a worktree integrates it with Git; archive the Specification instead, or turn Git on.',
    );
  }

  if (request.integrateToTargetBranch === true) {
    throw new CloseOperationError(
      'CLOSE_INVALID',
      'Git is off for this project: a Close archives the Specification in place and cannot integrate it.',
    );
  }

  return 'git-off';
}

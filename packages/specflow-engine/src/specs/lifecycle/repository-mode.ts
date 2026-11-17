import type { GitWorktreePolicy } from '../../version-control/worktrees/policy';
import { CloseOperationError } from './model';

/**
 * How a Close treats the repository: `git` (archive commit, optional integration, the repository
 * preconditions) or `git-off` (archive in place, nothing committed or merged, no repository
 * precondition).
 */
export type CloseRepositoryMode = 'git' | 'git-off';

/**
 * The one decision of the Close repository mode, from the project Git policy (owner decision
 * 2026-11-17): a Specification Close in a project with Git off (`git.enabled: false`, or no `git:`
 * block) archives in place. Asking such a Close to integrate is refused (`CLOSE_INVALID`) rather
 * than silently archived. A Worktree or Workspace Close is a Git integration by definition and keeps
 * the Git mode.
 */
export function closeRepositoryMode(
  policy: Pick<GitWorktreePolicy, 'enabled'>,
  request: {
    readonly kind: 'specification-close' | 'worktree-close' | 'workspace-close';
    readonly integrateToTargetBranch?: boolean;
  },
): CloseRepositoryMode {
  if (request.kind !== 'specification-close' || policy.enabled) {
    return 'git';
  }

  if (request.integrateToTargetBranch === true) {
    throw new CloseOperationError(
      'CLOSE_INVALID',
      'Git is off for this project: a Close archives the Specification in place and cannot integrate it.',
    );
  }

  return 'git-off';
}

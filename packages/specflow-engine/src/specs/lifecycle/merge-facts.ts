import { executeGit } from '../../git/process';
import { CloseOperationError, type ClosePlan } from './model';

/**
 * What a Close merges, read at preview time:
 * - `integrates`: `sourceBranch` is merged into `targetBranch`; `commitsAhead` counts the commits
 *   of the source not on the target (0: nothing to merge; a Specification Close adds its archive
 *   commit on top);
 * - `not-integrated`: nothing is merged, for `reason` `archive-only` (the linked Specification is
 *   archived on its own branch, as asked) or `primary-checkout` (the Specification lives in the
 *   primary checkout and is archived directly on `sourceBranch`, the integration branch), or
 *   `git-off` (Git is off for the project: the Specification is archived in place in `checkout`,
 *   nothing is committed and no branch is read; the archive stays uncommitted there, so a linked
 *   worktree created while Git was on later meets `uncommitted-changes` in a Worktree Close with Git
 *   on until it is committed).
 */
export type CloseMergeFacts =
  | {
      readonly status: 'integrates';
      readonly sourceBranch: string;
      readonly targetBranch: string;
      readonly commitsAhead: number;
    }
  | {
      readonly status: 'not-integrated';
      readonly reason: 'archive-only' | 'primary-checkout';
      readonly sourceBranch: string;
    }
  | {
      readonly status: 'not-integrated';
      readonly reason: 'git-off';
      readonly checkout: 'primary' | 'linked';
    };

/** Read-only: the merge facts of an admitted (not yet reserved) Specification or Worktree Close plan. */
export async function readCloseMergeFacts(plan: ClosePlan): Promise<CloseMergeFacts> {
  if (plan.gitOff) {
    return {
      status: 'not-integrated',
      reason: 'git-off',
      checkout: plan.source.instanceId === undefined ? 'primary' : 'linked',
    };
  }

  const sourceBranch = plan.source.branch;
  const integrates = plan.kind !== 'specification-close' || plan.integrateToTargetBranch === true;
  if (!integrates) {
    return {
      status: 'not-integrated',
      reason: plan.integrateToTargetBranch === false ? 'archive-only' : 'primary-checkout',
      sourceBranch,
    };
  }

  if (!plan.target || !plan.targetBranch) {
    throw new CloseOperationError('CLOSE_PREFLIGHT', 'The integration target is not planned.');
  }

  const counted = await executeGit(plan.source.root, [
    'rev-list',
    '--count',
    plan.target.head + '..' + plan.source.head,
  ]);
  const count = counted.stdout.trim();
  if (counted.exitCode !== 0 || !/^[0-9]{1,15}$/u.test(count)) {
    throw new CloseOperationError('CLOSE_PREFLIGHT', 'The commits to merge cannot be counted.');
  }

  return {
    status: 'integrates',
    sourceBranch,
    targetBranch: plan.targetBranch,
    commitsAhead: Number(count),
  };
}

import type { CommitPolicyMode } from '@nevo/specflow-contracts/documents';

import type { ResolvedProjectHome } from '../../project/home/home';
import { readProjectGitPolicy } from '../../version-control/worktrees/config';
import { effectiveAutoCommit } from '../../version-control/worktrees/policy';

/**
 * `auto` or `manual` for the documents while Git is enabled; `undefined` while it is disabled (the
 * setting is inert then) or the policy cannot be read. Read fresh, lock-free, no Git process.
 */
export async function readCommitPolicyMode(
  context: ResolvedProjectHome,
): Promise<CommitPolicyMode | undefined> {
  try {
    const { policy } = await readProjectGitPolicy(context);
    if (!policy.enabled) {
      return undefined;
    }

    return effectiveAutoCommit(policy, 'documents').auto ? 'auto' : 'manual';
  } catch {
    return undefined;
  }
}

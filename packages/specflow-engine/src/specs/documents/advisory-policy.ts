import { lstat, open, readFile } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import type { SpecFlowEngine } from '../../application';
import { GitCapabilityError } from '../../git/errors';
import { engineCommitRefusal } from '../../version-control/commits/branch-patterns';
import { readProjectGitPolicy } from '../../version-control/worktrees/config';
import type { PolicyReason } from './projection';

/**
 * Advisory branch reasons for the tree (`branch-protected`, `branch-not-allowed`,
 * `git-policy-invalid`). The same policy evaluation as create-options (`engineCommitRefusal`), but
 * read-only and free of Git processes: the branch is read from the checkout's `HEAD` file. When the
 * branch cannot be determined cheaply (detached HEAD, unreadable file) no reason is reported;
 * enforcement still happens on write.
 */
export async function advisoryPolicyReason(
  engine: SpecFlowEngine,
  workspaceRoot: string,
): Promise<PolicyReason | undefined> {
  let policy;
  try {
    policy = (await readProjectGitPolicy(engine.context)).policy;
  } catch (error) {
    return error instanceof GitCapabilityError && error.code === 'GIT_POLICY_INVALID'
      ? 'git-policy-invalid'
      : undefined;
  }
  if (!policy.enabled) return undefined;
  const branch = await readCheckedOutBranch(workspaceRoot);
  return branch === undefined ? undefined : engineCommitRefusal(policy.commits, branch);
}

const HEAD_MAX_BYTES = 4096;

/**
 * Short branch name from `<git dir>/HEAD` (`ref: refs/heads/<name>`); `undefined` for a detached
 * HEAD or anything unreadable. The git dir is `.git` for a primary checkout and the `gitdir:` target
 * of the `.git` file for a linked worktree.
 */
export async function readCheckedOutBranch(workspaceRoot: string): Promise<string | undefined> {
  try {
    const dotGit = join(workspaceRoot, '.git');
    const stat = await lstat(dotGit);
    let gitDir: string;
    if (stat.isDirectory()) {
      gitDir = dotGit;
    } else if (stat.isFile() && stat.size <= HEAD_MAX_BYTES) {
      const match = /^gitdir:\s*(.+?)\s*$/mu.exec(await readFile(dotGit, 'utf8'));
      if (!match) return undefined;
      gitDir = isAbsolute(match[1]!) ? match[1]! : resolve(workspaceRoot, match[1]!);
    } else {
      return undefined;
    }
    const handle = await open(join(gitDir, 'HEAD'), 'r');
    try {
      const buffer = Buffer.alloc(HEAD_MAX_BYTES);
      const { bytesRead } = await handle.read(buffer, 0, HEAD_MAX_BYTES, 0);
      const head = /^ref:\s*refs\/heads\/(.+?)\s*$/mu.exec(buffer.toString('utf8', 0, bytesRead));
      return head ? head[1] : undefined;
    } finally {
      await handle.close();
    }
  } catch {
    return undefined;
  }
}

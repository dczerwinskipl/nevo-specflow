import { lstat, open } from 'node:fs/promises';
import { isAbsolute, join, resolve } from 'node:path';

import type { SpecFlowEngine } from '../../application';
import { GitCapabilityError } from '../../git/errors';
import { engineCommitRefusal } from '../../version-control/commits/branch-patterns';
import { readProjectGitPolicy } from '../../version-control/worktrees/config';
import type { PolicyReason } from './projection';
import { ADVISORY_FILE_MAX_BYTES } from './limits';
import { READ_OPEN_FLAGS } from './verified-file';

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

/**
 * Text of a small regular file, or `undefined`. Opened like every other file the layer reads
 * (no symlink, no blocking on a FIFO), checked to be a regular file on the descriptor, and read
 * with a hard bound.
 */
async function readSmallRegularFile(path: string): Promise<string | undefined> {
  const handle = await open(path, READ_OPEN_FLAGS);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > ADVISORY_FILE_MAX_BYTES) return undefined;
    const buffer = Buffer.alloc(ADVISORY_FILE_MAX_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, ADVISORY_FILE_MAX_BYTES, 0);
    return buffer.toString('utf8', 0, bytesRead);
  } finally {
    await handle.close();
  }
}

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
    } else if (stat.isFile()) {
      const text = await readSmallRegularFile(dotGit);
      const target = text === undefined ? undefined : /^gitdir:\s*(.+?)\s*$/mu.exec(text)?.[1];
      if (target === undefined) return undefined;
      gitDir = isAbsolute(target) ? target : resolve(workspaceRoot, target);
    } else {
      return undefined;
    }
    const head = await readSmallRegularFile(join(gitDir, 'HEAD'));
    const ref = head === undefined ? null : /^ref:\s*refs\/heads\/(.+?)\s*$/mu.exec(head);
    return ref ? ref[1] : undefined;
  } catch {
    return undefined;
  }
}

import { lstat } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';

import { commonDirectoryOf, gitDirectoryOf } from '../../documents/write/preflight-cache';

/** How long a resumed commit waits for a Git process the stopped Create may have left running. */
export const ORPHAN_GIT_WAIT_MS = 10_000;
const POLL_MS = 200;

async function exists(path: string): Promise<boolean> {
  try {
    await lstat(path);

    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code !== 'ENOENT';
  }
}

/**
 * The lock files a `git commit` holds in a checkout while it runs: the index lock and `HEAD.lock` in
 * the checkout's own Git directory, the branch's ref lock in the shared one. A commit takes the index
 * lock in its first milliseconds and keeps a lock until it has updated the branch.
 */
async function commitLocks(workspaceRoot: string, branch: string): Promise<string[] | undefined> {
  const gitDirectory = await gitDirectoryOf(workspaceRoot).catch(() => undefined);
  if (gitDirectory === undefined) {
    return undefined;
  }

  const common = await commonDirectoryOf(gitDirectory);
  const candidates = [
    join(gitDirectory, 'index.lock'),
    join(gitDirectory, 'HEAD.lock'),
    join(common, 'refs', 'heads', ...branch.split('/')) + '.lock',
  ];
  const held: string[] = [];
  for (const candidate of candidates) {
    if (await exists(candidate)) {
      held.push(candidate);
    }
  }

  return held;
}

/**
 * Whether the checkout is free of a `git commit` the stopped executor may have started (on Windows a
 * child Git outlives its killed parent): no commit lock is held, waiting up to `waitMs` for one to go.
 * `false` when a lock stays (a Git that still runs, or one killed holding it) or the checkout's Git
 * directory cannot be read: the caller fails closed instead of committing alongside it.
 */
export async function waitForOrphanCommit(
  workspaceRoot: string,
  branch: string,
  waitMs: number = ORPHAN_GIT_WAIT_MS,
): Promise<boolean> {
  const deadline = Date.now() + waitMs;
  for (;;) {
    const held = await commitLocks(workspaceRoot, branch);
    if (held?.length === 0) {
      return true;
    }

    if (held === undefined || Date.now() >= deadline) {
      return false;
    }

    await sleep(POLL_MS);
  }
}

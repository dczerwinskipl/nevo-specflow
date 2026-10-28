import type { CommitPort } from '../../../version-control/commits/port';
import { decideBatchReplay } from '../changes/inspection';
import type { BatchPathExpectation } from '../changes/journal';
import { inspectBatch } from './inspect';

/**
 * Whether the checkout's HEAD holds the recorded post state of EVERY batch path and the working
 * tree agrees: the proof that an unrecorded commit (found by its trailer, or made by hand) is the
 * batch. A trailer alone proves nothing: its committer address is public, so a commit that names the
 * batch id but holds only some of the paths, or other bytes, is not the batch.
 */
export async function headHoldsWholeBatch(
  commits: CommitPort,
  root: string,
  expectations: readonly BatchPathExpectation[],
): Promise<boolean> {
  const split = await commits.effectivePaths(
    root,
    expectations.map((entry) => entry.path),
  );
  if (split.effective.length > 0) return false;
  return decideBatchReplay(await inspectBatch(root, expectations, split.facts)) === 'done';
}

/**
 * Whether the commit `sha` holds the recorded post state of every path it was asked to commit: the
 * committed blob is exactly the working file and the working file is the recorded post state. A
 * foreign write that landed between the guard and `git add` shows here. Paths that were dropped from
 * the effective set did not change and are not part of the check.
 */
export async function commitHoldsPaths(
  commits: CommitPort,
  root: string,
  expectations: readonly BatchPathExpectation[],
  effective: readonly string[],
  sha: string,
): Promise<boolean> {
  const wanted = new Set(effective);
  const subset = expectations.filter((entry) => wanted.has(entry.path));
  const facts = await commits.pathFacts(
    root,
    subset.map((entry) => entry.path),
    sha,
  );
  return decideBatchReplay(await inspectBatch(root, subset, facts)) === 'done';
}

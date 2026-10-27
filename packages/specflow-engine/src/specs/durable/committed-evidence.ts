import { GitCapabilityError } from '../../git/errors';
import type { CommitPort } from '../../version-control/commits/port';

/**
 * Primitives for deciding whether paths are already committed as the Engine recorded them. The
 * per-path batch inspection of document changes is built on these in `documents/changes`; Create's
 * scaffold check uses them directly.
 */

/** Whether `actual` lists exactly the `expected` paths (order of `expected` is irrelevant; `actual` is sorted). */
export function isExactPathSet(actual: readonly string[], expected: readonly string[]): boolean {
  const sorted = [...expected].sort();
  return actual.length === sorted.length && sorted.every((path, index) => path === actual[index]);
}

/**
 * The first path whose blob in `sha` is not what Git stores for the working file's bytes under the
 * repository's attributes, or `undefined` when every blob matches. Precondition: the caller has just
 * verified that the working files are the recorded bytes.
 */
export async function firstBlobMismatch(
  commits: Pick<CommitPort, 'blobMatchesWorkingFile'>,
  root: string,
  sha: string,
  paths: readonly string[],
): Promise<string | undefined> {
  for (const path of paths) {
    if (!(await commits.blobMatchesWorkingFile(root, sha, path))) return path;
  }
  return undefined;
}

/**
 * Files already exist when a commit is attempted, so a policy refusal (`BRANCH_PROTECTED`,
 * `COMMIT_BLOCKED`) there is surfaced as `COMMIT_FAILED` (recovery required), never as the "nothing
 * was created" admission codes. Any other error is returned unchanged.
 */
export function guardRefusalAsCommitFailed(error: unknown): unknown {
  if (
    error instanceof GitCapabilityError &&
    (error.code === 'BRANCH_PROTECTED' || error.code === 'COMMIT_BLOCKED')
  ) {
    return new GitCapabilityError(
      'COMMIT_FAILED',
      'The Engine commit failed.',
      error.code + ':' + (error.reason ?? ''),
    );
  }
  return error;
}

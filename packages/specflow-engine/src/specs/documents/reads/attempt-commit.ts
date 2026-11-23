import { ATTEMPT_COMMIT_PATHS_MAX } from '@nevo/specflow-contracts/documents';

import type { AttemptCommitPathHolds } from '../../uncommitted/attempts';
import type { TreeAttemptCommit } from '../projection';

/**
 * The waiting agent attempt commit (D15) that takes files of the Specification in `directory`
 * (checkout-relative, `specs/active/<slug>`), as its tree reports it: the oldest such attempt with
 * the Specification-relative paths it takes, `unreadable` when the holds cannot be read, else
 * `undefined`. The same holds the document writer refuses writes with, so the tree says before the
 * click what the write would be refused for. Pure.
 */
export function treeAttemptCommitOf(
  holds: AttemptCommitPathHolds | undefined,
  directory: string,
): TreeAttemptCommit | undefined {
  if (holds === undefined) {
    return undefined;
  }

  if (!holds.readable) {
    return { kind: 'unreadable' };
  }

  const prefix = directory + '/';
  for (const { wait, paths: all } of holds.holds) {
    const paths = all
      .filter((path) => path.startsWith(prefix))
      .map((path) => path.slice(prefix.length));
    if (paths.length === 0) {
      continue;
    }

    return {
      kind: 'held',
      paths,
      hold: {
        reason: wait.reason,
        ...(wait.code !== undefined ? { code: wait.code } : {}),
        attemptId: wait.attemptId,
        subject: wait.subject,
        step: wait.step,
        attempt: wait.attempt,
        stepTitle: wait.stepTitle,
        count: paths.length,
        paths: paths.slice(0, ATTEMPT_COMMIT_PATHS_MAX),
      },
    };
  }

  return undefined;
}

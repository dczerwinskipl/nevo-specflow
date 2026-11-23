import { ERROR_DETAIL_PATHS_MAX } from '@nevo/specflow-contracts/documents';

import { foldPathKey } from '../../document-rules/document-paths';
import type { DocumentError } from '../../document-rules/errors';
import type { OwnedExecution } from '../../durable';
import {
  attemptCommitState,
  namedAttempt,
  type AttemptCommitPathHolds,
} from '../../uncommitted/attempts';
import { documentChangeError } from '../changes/errors';
import type { DocumentChangePlan } from '../changes/plan/model';

/**
 * The refusal of a write to a path a waiting agent attempt commit (D15) takes, or `undefined`:
 * while a finished attempt's commit is pending or failed, its ledger entries and declared files are
 * the attempt's alone, so any other write to one of them (the owner's save, create, rename, move or
 * delete, a Task document's edit, another agent's Turn) would make that commit refuse them as mixed
 * (`ATTEMPT_COMMIT_MIXED_AUTHORS`) or, with automatic commits on, commit the agent's work as the
 * owner's. Only the attempt's own Turns write them. Other paths of the Specification stay writable.
 * Fails closed: when the holds cannot be read, every write is refused (`COMMIT_BLOCKED`). Pure;
 * called under the control lock of the reservation, before anything is written or queued.
 */
export function attemptCommitHeld(
  holds: AttemptCommitPathHolds,
  plan: Pick<DocumentChangePlan, 'paths'>,
  owned: Pick<OwnedExecution, 'operationId'> | undefined,
): DocumentError | undefined {
  if (!holds.readable) {
    return documentChangeError(
      'commit-blocked',
      "An agent attempt's record cannot be read, so SpecFlow cannot tell which files the commit " +
        "of its work still takes. Repair or remove the unreadable record under the project's local " +
        'state, then try again.',
      { blockedBy: 'attempt-record-unreadable' },
    );
  }

  const planned = new Map(plan.paths.map((path) => [foldPathKey(path.path), path.path]));
  for (const hold of holds.holds) {
    if (owned !== undefined && hold.invocations.has(owned.operationId)) {
      continue;
    }

    const held = hold.paths.flatMap((path) => {
      const mine = planned.get(foldPathKey(path));

      return mine !== undefined ? [mine] : [];
    });
    if (held.length === 0) {
      continue;
    }

    return documentChangeError(
      'attempt-commit',
      `The agent's work in ${namedAttempt(hold.wait)} is not committed yet (its commit ` +
        `${attemptCommitState(hold.wait)}), and these files are part of it. They cannot change ` +
        'until that commit ran, so that the agent and you never share an uncommitted file: retry ' +
        'the commit of that attempt, then try again. Other documents can still be changed.',
      { paths: [...new Set(held)].sort().slice(0, ERROR_DETAIL_PATHS_MAX) },
    );
  }

  return undefined;
}

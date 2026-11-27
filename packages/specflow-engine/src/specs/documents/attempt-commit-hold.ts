import { ERROR_DETAIL_PATHS_MAX } from '@nevo/specflow-contracts/documents';

import { foldPathKey } from '../document-rules/document-paths';
import type { DocumentError } from '../document-rules/errors';
import type { SpecFlowEngine } from '../../application';
import {
  attemptCommitState,
  namedAttempt,
  NO_ATTEMPT_COMMIT_HOLDS,
  type AttemptCommitHolds,
  type AttemptCommitPathHold,
  type ReadableAttemptCommitHolds,
} from '../uncommitted/attempts';
import { documentChangeError } from './changes/errors';

/**
 * What would take the held paths: a write of documents (the owner's save, create, rename, move or
 * delete, a Task document's edit, another agent's Turn) or a commit (the manual commit of a
 * Specification or of the checkout, the owner's commit of the execution state).
 */
export type HeldPathUse = 'change' | 'commit';

/**
 * The refusal of a write or a commit of a path a waiting agent attempt commit (D15) takes, or
 * `undefined`: while a finished attempt's commit is pending or failed, its ledger entries and
 * declared files are the attempt's alone. Another write to one of them would make that commit
 * refuse them as mixed (`ATTEMPT_COMMIT_MIXED_AUTHORS`) or, with automatic commits on, commit the
 * agent's work as the owner's; another commit of them would take the agent's work away from its
 * attempt commit, so a Retry no longer holds all of it. Only the hold `exempt` names is left out: the
 * attempt's own Turns (a write) or its own attempt commit (a commit). Other paths stay usable. Fails
 * closed: when the holds cannot be read, everything is refused (`COMMIT_BLOCKED`). Pure; the callers
 * judge it under the control lock of their reservation, before anything is written or published.
 */
export function attemptCommitHeld(
  holds: AttemptCommitHolds,
  paths: readonly string[],
  use: HeldPathUse,
  exempt: (hold: AttemptCommitPathHold) => boolean,
): DocumentError | undefined {
  if (!holds.readable) {
    return attemptHoldsUnreadable();
  }

  const wanted = new Map(paths.map((path) => [foldPathKey(path), path]));
  for (const hold of holds.holds) {
    if (exempt(hold)) {
      continue;
    }

    const held = hold.paths.flatMap((path) => {
      const mine = wanted.get(foldPathKey(path));

      return mine !== undefined ? [mine] : [];
    });
    if (held.length === 0) {
      continue;
    }

    const lead =
      `The agent's work in ${namedAttempt(hold.wait)} is not committed yet (its commit ` +
      `${attemptCommitState(hold.wait)}), and these files are part of it.`;

    return documentChangeError(
      'attempt-commit',
      use === 'change'
        ? `${lead} They cannot change until that commit ran, so that the agent and you never ` +
            'share an uncommitted file: retry the commit of that attempt, then try again. Other ' +
            'documents can still be changed.'
        : `${lead} Only that attempt's own commit takes them, so that all of the agent's work ` +
            'stays in it: retry the commit of that attempt, then commit the rest.',
      { paths: [...new Set(held)].sort().slice(0, ERROR_DETAIL_PATHS_MAX) },
    );
  }

  return undefined;
}

/** The refusal (`COMMIT_BLOCKED`) while the holds cannot be read: what an attempt holds is unknown. */
export function attemptHoldsUnreadable(): DocumentError {
  return documentChangeError(
    'commit-blocked',
    "An agent attempt's record cannot be read, so SpecFlow cannot tell which files the commit " +
      "of its work still takes. Repair or remove the unreadable record under the project's local " +
      'state, then try again.',
    { blockedBy: 'attempt-record-unreadable' },
  );
}

/**
 * The attempt commit holds of the checkout `workspaceId` (`SpecFlowEngine.attemptCommitHolds`, none
 * where no workflow is composed), for a caller that cannot go on without them (Close):
 * `COMMIT_BLOCKED` when they cannot be read. Lock-free and Git-free.
 */
export async function readableAttemptCommitHolds(
  engine: SpecFlowEngine,
  workspaceId: string,
): Promise<ReadableAttemptCommitHolds> {
  const holds = (await engine.attemptCommitHolds?.(workspaceId)) ?? NO_ATTEMPT_COMMIT_HOLDS;
  if (!holds.readable) {
    throw attemptHoldsUnreadable();
  }

  return holds;
}

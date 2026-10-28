/**
 * `recover <operation> --resume|--adopt|--abandon` for a manual commit that needs recovery (ADR 0018
 * decision 8, ADR 0016 decisions 13 and 15). Each mode takes the checkout's lease like the commit itself,
 * so a recovery never runs beside the queue or another manual commit.
 *
 * - `resume`: the commit is looked up by its trailer; a commit that is the whole manual commit completes
 *   it, none leaves the attempt to be made again (the port refuses while an index lock is held).
 * - `adopt`: HEAD must hold the recorded content of every path (a hand commit, an amended commit); the
 *   manual commit completes with the commit that last touched the paths and the ledger is pruned.
 * - `abandon`: the manual commit ends without a commit and the ledger stays exactly as it is.
 */
import { manualCommitError } from './errors';
import { headHoldsSnapshot } from './evidence';
import {
  complete,
  doneOf,
  errorOfFailedJournal,
  executeManualCommit,
  finish,
  runClaimed,
  type ManualCommitDone,
} from './execute';
import { findManualCommitJournal, readSnapshot } from './journal-store';
import { MANUAL_COMMIT_ABANDONED, type ManualCommitJournal } from './model';
import type { ManualCommitRuntime } from './runtime';

export type ManualCommitRecoverMode = 'resume' | 'adopt' | 'abandon';

function unresolved(): Error {
  return manualCommitError(
    'recovery-required',
    'The repository does not show whether this manual commit was made; adopt a commit or abandon it.',
    { cause: 'recovery-unresolved' },
  );
}

/** What a repeat of a recovery finds: the operation where it ended up. */
async function repeatOf(
  rt: ManualCommitRuntime,
  journal: ManualCommitJournal,
  mode: ManualCommitRecoverMode,
): Promise<ManualCommitDone | undefined> {
  if (journal.stage === 'completed' && mode !== 'abandon') return doneOf(rt, journal, true);
  if (journal.stage === 'failed' && mode === 'abandon') {
    if (journal.reason === MANUAL_COMMIT_ABANDONED) return { journal, paths: [], replayed: true };
    throw errorOfFailedJournal(journal);
  }
  return undefined;
}

export async function recoverManualCommit(
  rt: ManualCommitRuntime,
  operationId: string,
  mode: ManualCommitRecoverMode,
): Promise<ManualCommitDone> {
  const journal = await findManualCommitJournal(rt.context, operationId);
  if (journal === undefined) {
    throw manualCommitError('operation-not-found', 'The manual commit does not exist.');
  }
  const repeated = await repeatOf(rt, journal, mode);
  if (repeated !== undefined) return repeated;

  if (mode === 'resume') {
    if (journal.stage === 'completed' || journal.stage === 'failed') {
      throw manualCommitError(
        'operation-state-invalid',
        'Only a manual commit that has not ended can be resumed.',
      );
    }
    return executeManualCommit(rt, journal);
  }
  if (journal.stage !== 'recovery-required') {
    throw manualCommitError(
      'operation-state-invalid',
      'Only a manual commit that needs recovery can be adopted or abandoned.',
    );
  }
  const reason = journal.reason ?? 'uncertain';
  if (mode === 'abandon') {
    return runClaimed(rt, journal, async (claimed) => ({
      journal: await finish(rt, claimed, 'failed', { reason: MANUAL_COMMIT_ABANDONED }),
      paths: [],
      replayed: false,
    }));
  }
  return runClaimed(rt, journal, async (claimed) => {
    const entries = await readSnapshot(rt.context, claimed);
    const paths = entries.map((entry) => entry.path);
    if (!(await headHoldsSnapshot(rt.commits, claimed.workspaceRoot, entries, paths))) {
      await finish(rt, claimed, 'recovery-required', { reason });
      throw unresolved();
    }
    const state = await rt.commits.inspectPaths(claimed.workspaceRoot, paths);
    const sha =
      state.state === 'committed' ? state.sha : await rt.commits.head(claimed.workspaceRoot);
    if (sha === undefined) {
      await finish(rt, claimed, 'recovery-required', { reason });
      throw unresolved();
    }
    return complete(rt, claimed, entries, { sha, paths });
  });
}

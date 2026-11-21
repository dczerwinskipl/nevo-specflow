/**
 * What an agent attempt's commit holds (D15), decided from the ledger and the attempt's journal
 * alone. Pure: no I/O, no Git.
 */
import type { AgentAttemptJournal, AgentDeclaredPath } from '../../journal/model';

/** One ledger entry as the selection reads it (the ledger's `LedgerEntry`). */
export interface AttemptLedgerEntry {
  readonly path: string;
  readonly operationIds: readonly string[];
  readonly operationCount: number;
  readonly executions?: readonly { readonly operationId: string; readonly executionId: string }[];
}

export interface AttemptLedgerSelection {
  /** The entries every operation of which one of the attempt's Turns made: committed. Sorted. */
  readonly paths: readonly string[];
  /**
   * Entries whose listed operations are all the attempt's, but that forgot older operations (the
   * ledger keeps the newest ids, `operationCount` counts all): who made those cannot be proven, so
   * nothing is committed (fail closed). Sorted.
   */
  readonly unprovable: readonly string[];
}

/** The Runtime invocations of the attempt's Turns: the execution claims its operations name. */
export function attemptInvocations(journal: AgentAttemptJournal): ReadonlySet<string> {
  return new Set(journal.turns.map((turn) => turn.invocationId));
}

/**
 * The ledger entries of the attempt: those whose every operation was made by one of its Turns (an
 * operation names its Turn in `executions`). An entry with an operation of anyone else (the owner,
 * another attempt, an operation made without a Turn) stays out: the commit never takes another
 * author's change.
 */
export function selectAttemptLedgerEntries(
  entries: readonly AttemptLedgerEntry[],
  invocations: ReadonlySet<string>,
): AttemptLedgerSelection {
  const paths: string[] = [];
  const unprovable: string[] = [];
  for (const entry of entries) {
    const authors = new Map(
      (entry.executions ?? []).map((execution) => [execution.operationId, execution.executionId]),
    );
    const ours =
      entry.operationIds.length > 0 &&
      entry.operationIds.every((id) => invocations.has(authors.get(id) ?? ''));
    if (!ours) {
      continue;
    }

    (entry.operationCount > entry.operationIds.length ? unprovable : paths).push(entry.path);
  }

  return { paths: paths.sort(), unprovable: unprovable.sort() };
}

/** The declared paths that were never hashed (too large, or not named when published). */
export function unhashedDeclared(declared: readonly AgentDeclaredPath[]): readonly string[] {
  return declared
    .filter((entry) => entry.oversize === true)
    .map((entry) => entry.path)
    .sort();
}

/**
 * What an agent attempt's commit holds (D15), decided from the ledger and the attempt's journal
 * alone. Pure: no I/O, no Git.
 */
import { ledgerAuthorsOf, type LedgerEntry } from '../../../../specs/durable/ledger/model';
import type { AgentAttemptJournal, AgentDeclaredPath } from '../../journal/model';

export interface AttemptLedgerSelection {
  /** The entries every operation of which one of the attempt's Turns made: committed. Sorted. */
  readonly paths: readonly string[];
  /**
   * Entries the attempt changed together with someone else (an owner, another attempt, a tool):
   * the commit would take another author's change, so it is refused, naming them. Sorted.
   */
  readonly mixed: readonly string[];
}

/** The Runtime invocations of the attempt's Turns: the execution claims its operations name. */
export function attemptInvocations(journal: AgentAttemptJournal): ReadonlySet<string> {
  return new Set(journal.turns.map((turn) => turn.invocationId));
}

/**
 * The ledger entries of the attempt, judged by each entry's authors (`ledgerAuthorsOf`, which no
 * truncation of its operation ids drops): an entry only the attempt's Turns made is selected; an
 * entry the attempt never touched stays out (another author's change is never committed); an entry
 * both made is `mixed` and refuses the commit.
 */
export function selectAttemptLedgerEntries(
  entries: readonly LedgerEntry[],
  invocations: ReadonlySet<string>,
): AttemptLedgerSelection {
  const paths: string[] = [];
  const mixed: string[] = [];
  for (const entry of entries) {
    const authors = ledgerAuthorsOf(entry);
    const ours = authors.executions.filter((id) => invocations.has(id));
    if (ours.length === 0) {
      continue;
    }

    const alone = authors.unattributed !== true && ours.length === authors.executions.length;
    (alone ? paths : mixed).push(entry.path);
  }

  return { paths: paths.sort(), mixed: mixed.sort() };
}

/** The declared paths that were never hashed (too large, or not named when published). */
export function unhashedDeclared(declared: readonly AgentDeclaredPath[]): readonly string[] {
  return declared
    .filter((entry) => entry.oversize === true)
    .map((entry) => entry.path)
    .sort();
}

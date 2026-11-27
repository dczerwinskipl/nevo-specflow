import { isExecutionStatePathOf } from '../../../specs/execution-paths';
import { ledgerAuthorsOf, type LedgerEntry } from '../../../specs/durable/ledger/model';

/**
 * The uncommitted execution state of the Specification in `directory` that is the owner's to commit
 * (what `commit-execution-state` takes): every entry below `.execution/` or `tasks/` but those only
 * agent attempts in progress or waiting for their commit wrote (`attemptExecutions`, their own
 * commit takes them). `attemptExecutions` undefined (the journals cannot all be read): every entry an
 * execution wrote counts too. Checkout-relative, sorted. Pure.
 */
export function ownerStatePaths(
  entries: readonly LedgerEntry[],
  directory: string,
  attemptExecutions: ReadonlySet<string> | undefined,
): string[] {
  return entries
    .filter((entry) => {
      if (!isExecutionStatePathOf(directory, entry.path)) {
        return false;
      }

      const authors = ledgerAuthorsOf(entry);

      return (
        attemptExecutions === undefined ||
        authors.unattributed === true ||
        authors.executions.some((id) => !attemptExecutions.has(id))
      );
    })
    .map((entry) => entry.path)
    .sort();
}

import type { CommitPort } from '../../version-control/commits/port';
import type { LedgerHeadProbe } from '../durable';

/**
 * The ledger's question "does the working tree already equal HEAD for this path?", answered by the
 * commit port's read-only effective-set function (attribute-aware blob ids, a removed file equals an
 * absent blob). Read-only: nothing is staged or mutated.
 */
export function headProbeOf(commits: CommitPort): LedgerHeadProbe {
  return async (workspaceRoot, paths) => {
    const { dropped } = await commits.effectivePaths(workspaceRoot, paths);

    return new Set(dropped);
  };
}

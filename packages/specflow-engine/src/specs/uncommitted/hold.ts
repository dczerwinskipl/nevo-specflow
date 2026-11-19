import type { SpecFlowEngine } from '../../application';
import { readProjectGitPolicy } from '../../version-control/worktrees/config';
import { listLedgerRecords } from '../durable';
import { isExecutionStatePathOf } from '../execution-paths';

export interface UncommittedHold {
  readonly workspaceId: string;
  /** Operations that left the paths (the newest ids the ledger keeps, at most 50 in total). */
  readonly operationIds: readonly string[];
  readonly paths: number;
}

/**
 * Ledger entries a Specification Close does not wait for: the execution state (`.execution/**`,
 * `tasks/**`) of every active Specification physically present in the same checkout, which an
 * archive commit (its own, or a sibling's already-committed one) accounts for.
 */
export interface UncommittedAllowance {
  /** Each Specification's own checkout-relative directory (`specs/active/<slug>`), by its id. */
  readonly directories: ReadonlyMap<string, string>;
}

/**
 * Whether the ledger still holds paths of a checkout: the fact that makes Close refuse
 * (`commit-uncommitted`). Lock-free, Git-free. With Git disabled nothing can be committed, so the
 * ledger holds nothing back (an unreadable policy is treated as Git enabled: fail closed). The entries
 * `allowance` names do not hold the checkout.
 */
export async function readUncommittedHold(
  engine: SpecFlowEngine,
  workspaceId: string,
  allowance?: UncommittedAllowance,
): Promise<UncommittedHold | undefined> {
  const { records, unreadable } = await listLedgerRecords(engine.context, { workspaceId });
  const entries = records.flatMap((record) => {
    // Each owner's entries are checked only against ITS OWN directory, never a sibling's.
    const directory =
      record.owner.kind === 'specification'
        ? allowance?.directories.get(record.owner.id)
        : undefined;

    return record.entries.filter(
      (entry) => directory === undefined || !isExecutionStatePathOf(directory, entry.path),
    );
  });
  // A record that cannot be read is a fact nobody can judge: it holds the checkout like an entry.
  if (entries.length === 0 && unreadable === 0) {
    return undefined;
  }

  try {
    if (!(await readProjectGitPolicy(engine.context)).policy.enabled) {
      return undefined;
    }
  } catch {
    // Fail closed.
  }

  const ids = new Set(entries.flatMap((entry) => entry.operationIds));

  return { workspaceId, operationIds: [...ids].slice(-50), paths: entries.length };
}

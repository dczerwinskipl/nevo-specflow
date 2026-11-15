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
 * `tasks/**`) of the Specification it archives, which its archive commit takes along.
 */
export interface UncommittedAllowance {
  readonly specId: string;
  /** The checkout-relative directory of the Specification (`specs/active/<slug>`). */
  readonly directory: string;
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
  const entries = records.flatMap((record) =>
    record.entries.filter(
      (entry) =>
        allowance === undefined ||
        record.owner.kind !== 'specification' ||
        record.owner.id !== allowance.specId ||
        !isExecutionStatePathOf(allowance.directory, entry.path),
    ),
  );
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

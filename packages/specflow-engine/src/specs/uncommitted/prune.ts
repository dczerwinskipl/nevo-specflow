import type { SpecFlowEngine } from '../../application';
import { openVersionControl } from '../../version-control';
import type { CommitPort } from '../../version-control/commits/port';
import { readProjectGitPolicy } from '../../version-control/worktrees/config';
import { listLedgerRecords, pruneLedgerRecord } from '../durable';
import { headProbeOf } from './head-probe';

export interface PruneUncommittedOptions {
  /** Only the ledgers of this checkout; default every checkout of the Project Home. */
  readonly workspaceId?: string;
  /** The commit port (defaults to the Engine's own). */
  readonly commits?: CommitPort;
  readonly now?: () => string;
}

export interface PruneUncommittedOutcome {
  /** Entries removed because their path now equals HEAD. */
  readonly removed: number;
  /** Entries still recorded. */
  readonly remaining: number;
}

/**
 * Removes the ledger entries whose path a commit now holds (a queued batch, a manual commit, a hand
 * commit): the effect that keeps the ledger equal to "what is uncommitted". Read-only Git (one
 * effective-set read per non-empty record), never a mutation, no Git at all for an empty ledger or
 * while Git is disabled. Best effort per record: a record that cannot be judged stays as it is, which
 * keeps Close refusing rather than losing the fact.
 */
export async function pruneUncommitted(
  engine: SpecFlowEngine,
  options: PruneUncommittedOptions = {},
): Promise<PruneUncommittedOutcome> {
  const { records } = await listLedgerRecords(
    engine.context,
    options.workspaceId !== undefined ? { workspaceId: options.workspaceId } : {},
  );
  const nonEmpty = records.filter((record) => record.entries.length > 0);
  if (nonEmpty.length === 0) return { removed: 0, remaining: 0 };
  try {
    if (!(await readProjectGitPolicy(engine.context)).policy.enabled) {
      return { removed: 0, remaining: count(nonEmpty) };
    }
  } catch {
    return { removed: 0, remaining: count(nonEmpty) };
  }
  const probe = headProbeOf(options.commits ?? openVersionControl(engine).commits);
  const now = options.now ?? (() => new Date().toISOString());
  let removed = 0;
  let remaining = 0;
  for (const record of nonEmpty) {
    try {
      const outcome = await pruneLedgerRecord(
        engine.context,
        record.workspaceId,
        record.owner,
        probe,
        now,
      );
      removed += outcome.removed.length;
      remaining += outcome.remaining;
    } catch {
      remaining += record.entries.length;
    }
  }
  return { removed, remaining };
}

function count(records: readonly { readonly entries: readonly unknown[] }[]): number {
  return records.reduce((sum, record) => sum + record.entries.length, 0);
}

import {
  SharedResourceError,
  overlaps,
  sortedResources,
  type ClaimSelf,
  type ClaimSource,
  type MutationResource,
} from '../durable/claims';
import type { ResolvedProjectHome } from '../../project/home/home';
import { listManualCommitJournals, readSnapshot } from './journal-store';
import { MANUAL_COMMIT_STAGE_FACTS, type ManualCommitJournal } from './model';

/**
 * Resources a manual commit claims: the scoped claim of its checkout and nothing else, exactly like a
 * document operation. It coexists with document operations and with Create (every `checkout-scoped:`
 * claim does) and is excluded by Close, whose `checkout:<workspaceId>` claim pairs with it. Two manual
 * commits of one checkout, and a manual commit and a queue batch, exclude each other through the lease,
 * not through a claim.
 */
export function resourcesForManualCommit(
  record: Pick<ManualCommitJournal, 'workspaceId'>,
): readonly MutationResource[] {
  return sortedResources(['checkout-scoped:' + record.workspaceId]);
}

/** Whether the journal is a resource claim: see `MANUAL_COMMIT_STAGE_FACTS`. */
export function manualCommitHoldsClaim(journal: Pick<ManualCommitJournal, 'stage'>): boolean {
  return MANUAL_COMMIT_STAGE_FACTS[journal.stage].holdsClaim;
}

/**
 * The conflict rule of manual commit journals for the shared claim check: only journals that hold a
 * claim count; the operation asking never conflicts with its own journal.
 */
export function assertManualCommitClaimsAvailable(
  records: readonly ManualCommitJournal[],
  requested: readonly MutationResource[],
  self: ClaimSelf | undefined,
): void {
  for (const record of records) {
    if (self?.kind === 'manual-commit' && self.operationId === record.operationId) continue;
    if (!manualCommitHoldsClaim(record)) continue;
    if (overlaps(requested, resourcesForManualCommit(record))) {
      throw new SharedResourceError(
        'RESOURCE_CONFLICT',
        'An unfinished manual commit reserves this checkout; finish or recover it.',
      );
    }
  }
}

/** The manual commit journals as a claim source of the shared resource check (Create, Close, writes). */
export const manualCommitClaims: ClaimSource<ManualCommitJournal> = {
  list: (context) => listManualCommitJournals(context),
  assertAvailable: assertManualCommitClaimsAvailable,
};

/** The paths a manual commit that has not settled holds, as the writer's reservation sees them. */
export interface ManualCommitPathView {
  readonly operationId: string;
  readonly workspaceId: string;
  readonly stage: 'reserved' | 'committing' | 'recovery-required';
  /** Checkout-relative paths. */
  readonly paths: ReadonlySet<string>;
}

/**
 * The manual commits of a checkout that have not settled, with the paths they commit. Read-only and
 * lock-free (the reservation calls it while it holds the control lock).
 */
export async function listManualCommitPathViews(
  context: ResolvedProjectHome,
  workspaceId: string,
): Promise<readonly ManualCommitPathView[]> {
  const views: ManualCommitPathView[] = [];
  for (const journal of await listManualCommitJournals(context)) {
    if (journal.workspaceId !== workspaceId) continue;
    if (
      journal.stage !== 'reserved' &&
      journal.stage !== 'committing' &&
      journal.stage !== 'recovery-required'
    ) {
      continue;
    }
    const entries = await readSnapshot(context, journal);
    views.push({
      operationId: journal.operationId,
      workspaceId: journal.workspaceId,
      stage: journal.stage,
      paths: new Set(entries.map((entry) => entry.path)),
    });
  }
  return views;
}

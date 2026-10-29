import type { ResolvedProjectHome } from '../../project/home/home';
import { listCreateJournals, type CreateJournal } from '../create/journal';
// Journal-only dependency: importing execution operations here would create an admission cycle.
import { listExecutionJournals } from '../../execution/journal';
import {
  SharedResourceError,
  assertClaimsAvailable,
  claimCheckOf,
  overlaps,
  sortedResources,
  type ClaimSelf,
  type ClaimSource,
  type MutationResource,
} from '../durable';
import { documentChangeClaims } from '../documents/write/claim-source';
import { manualCommitClaims } from '../manual-commit/claims';
import { listCloseJournals, resourcesForClosePlan, type CloseJournal } from '../lifecycle';

// The resource algebra and the claim check live in the generic durable core; these re-exports keep
// the existing import path of Create and Close.
export { SharedResourceError, overlaps, sortedResources, type MutationResource };

/**
 * A Create in an existing checkout writes only its own Spec directory and
 * registry binding: independent Creates are compatible. A Close owns the
 * ENTIRE checkout/index and therefore excludes all such scoped Creates.
 *
 * Distinct managed worktree additions reserve independent refs and paths,
 * but a Close disposing worktree metadata excludes all in-flight additions.
 */
export function resourcesForCreate(record: CreateJournal): readonly MutationResource[] {
  const identity = ['spec:' + record.specId];
  if (record.target.kind === 'existing') {
    return sortedResources([...identity, 'checkout-scoped:' + record.target.workspaceId]);
  }

  return sortedResources([
    ...identity,
    'ref:refs/heads/' + record.target.branch.toLowerCase(),
    'worktree-path:' + record.target.workspaceRoot.toLowerCase(),
    ...(record.target.integrationDestination
      ? [
          'checkout:' + record.target.integrationDestination.workspaceId,
          'ref:refs/heads/' + record.target.integrationDestination.branch.toLowerCase(),
        ]
      : []),
    'git-worktree-admin-scoped:' + record.projectId,
  ]);
}

function settledClose(stage: string): boolean {
  return stage === 'completed' || stage === 'archived-linked-awaiting-integration';
}

const createClaims: ClaimSource<CreateJournal> = {
  // Resolved at the call: this module sits in an import cycle and is first loaded from different entry points.
  list: (context) => listCreateJournals(context),
  assertAvailable(records, requested, self) {
    for (const record of records) {
      if (self?.kind === 'create' && self.operationId === record.operationId) {
        continue;
      }

      if (record.stage === 'completed') {
        continue;
      }

      if (overlaps(requested, resourcesForCreate(record))) {
        throw new SharedResourceError(
          'RESOURCE_CONFLICT',
          'Unfinished Create reserves a conflicting checkout/ref; inspect or recover it.',
        );
      }
    }
  },
};

const closeClaims: ClaimSource<CloseJournal> = {
  list: (context) => listCloseJournals(context),
  assertAvailable(records, requested, self) {
    for (const record of records) {
      if (
        record.plan.resources.join('\0') !==
        resourcesForClosePlan(record.plan, record.projectId).join('\0')
      ) {
        throw new SharedResourceError(
          'RESOURCE_JOURNAL_CORRUPT',
          'Close journal resource inventory is inconsistent.',
        );
      }

      if (self?.kind === 'close' && self.operationId === record.plan.operationId) {
        continue;
      }

      if (record.stage === 'archived-linked-awaiting-integration') {
        // A separate operator-reconciled checkpoint proves the scratch checkout
        // was removed from the filesystem AND Git metadata before releasing admin.
        if (record.scratchRetired === true) {
          continue;
        }

        // Original source/target claims settle after a positively proven known
        // conflict; retained scratch still owns Git worktree metadata. A NEW
        // Worktree Close cannot race removal or reuse this scratch checkout.
        const scratchClaims = [
          'git-worktree-admin:' + record.projectId,
          ...(record.scratch ? ['worktree-path:' + record.scratch.root.toLowerCase()] : []),
        ];
        if (overlaps(requested, scratchClaims)) {
          throw new SharedResourceError(
            'RESOURCE_CONFLICT',
            'Retained conflicting scratch must be reconciled before another Git worktree lifecycle.',
          );
        }

        continue;
      }

      if (settledClose(record.stage)) {
        continue;
      }

      if (overlaps(requested, record.plan.resources)) {
        throw new SharedResourceError(
          'RESOURCE_CONFLICT',
          'Unfinished Close reserves a conflicting checkout/ref; inspect or recover it.',
        );
      }
    }
  },
};

/**
 * Cross-slice durable admission, invoked only while holding the short Project
 * Home control lock. Journals themselves are the claim records; there is no
 * secondary reservation store and no PID/TTL-based recovery. Creates are checked
 * before Closes, and both before document changes and manual commits.
 */
export async function assertSharedResourcesAvailable(
  context: ResolvedProjectHome,
  requested: readonly MutationResource[],
  self?: ClaimSelf,
): Promise<void> {
  for await (const execution of listExecutionJournals(context, true)) {
    if (
      execution.phase === 'settled' ||
      (self?.kind === 'external' && self.operationId === execution.intent.operationId)
    ) {
      continue;
    }

    throw new SharedResourceError(
      'RESOURCE_CONFLICT',
      'An external execution reserves this project; inspect or reconcile it.',
    );
  }

  await assertClaimsAvailable(
    context,
    [
      claimCheckOf(createClaims),
      claimCheckOf(closeClaims),
      claimCheckOf(documentChangeClaims),
      claimCheckOf(manualCommitClaims),
    ],
    requested,
    self,
  );
}

import { SharedResourceError, overlaps, type ClaimSource } from '../durable';
import { listCloseJournals } from './journal/store';
import { resourcesForClosePlan, type CloseJournal } from './model';

export const closeClaims: ClaimSource<CloseJournal> = {
  list: listCloseJournals,
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
            { kind: 'close', operationId: record.plan.operationId },
          );
        }

        continue;
      }

      if (record.stage === 'completed') {
        continue;
      }

      if (overlaps(requested, record.plan.resources)) {
        throw new SharedResourceError(
          'RESOURCE_CONFLICT',
          'Unfinished Close reserves a conflicting checkout/ref; inspect or recover it.',
          { kind: 'close', operationId: record.plan.operationId },
        );
      }
    }
  },
};

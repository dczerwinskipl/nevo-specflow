import type { ResolvedProjectHome } from '../../project/home/home';
import { listCreateJournals, type CreateJournal } from '../create/journal';
import { listCloseJournals } from '../lifecycle';
import { resourcesForClosePlan } from '../lifecycle';

export type MutationResource = string;

export class SharedResourceError extends Error {
  readonly code: 'RESOURCE_CONFLICT' | 'RESOURCE_JOURNAL_CORRUPT';

  constructor(code: 'RESOURCE_CONFLICT' | 'RESOURCE_JOURNAL_CORRUPT', message: string) {
    super(message);
    this.name = 'SharedResourceError';
    this.code = code;
  }
}

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

export function sortedResources(resources: readonly string[]): readonly MutationResource[] {
  return [...new Set(resources)].sort();
}

/** Scoped claims coexist with each other, but conflict with the exclusive claim. */
export function overlaps(left: readonly string[], right: readonly string[]): boolean {
  for (const first of left) {
    for (const second of right) {
      if (first === second) {
        if (first.startsWith('checkout-scoped:') || first.startsWith('git-worktree-admin-scoped:'))
          continue;
        return true;
      }
      for (const [exclusive, scoped] of [
        ['checkout:', 'checkout-scoped:'],
        ['git-worktree-admin:', 'git-worktree-admin-scoped:'],
      ] as const) {
        if (
          (first.startsWith(exclusive) && second === scoped + first.slice(exclusive.length)) ||
          (second.startsWith(exclusive) && first === scoped + second.slice(exclusive.length))
        ) {
          return true;
        }
      }
    }
  }
  return false;
}

function settledClose(stage: string): boolean {
  return stage === 'completed' || stage === 'archived-linked-awaiting-integration';
}

/**
 * Cross-slice durable admission, invoked only while holding the short Project
 * Home control lock. Journals themselves are the claim records; there is no
 * secondary reservation store and no PID/TTL-based recovery.
 */
export async function assertSharedResourcesAvailable(
  context: ResolvedProjectHome,
  requested: readonly MutationResource[],
  self?: { readonly kind: 'create' | 'close'; readonly operationId: string },
): Promise<void> {
  const [creates, closes] = await Promise.all([
    listCreateJournals(context),
    listCloseJournals(context),
  ]);

  for (const record of creates) {
    if (self?.kind === 'create' && self.operationId === record.operationId) continue;
    if (record.stage === 'completed') continue;
    if (overlaps(requested, resourcesForCreate(record))) {
      throw new SharedResourceError(
        'RESOURCE_CONFLICT',
        'Unfinished Create reserves a conflicting checkout/ref; inspect or recover it.',
      );
    }
  }

  for (const record of closes) {
    if (
      record.plan.resources.join('\0') !==
      resourcesForClosePlan(record.plan, record.projectId).join('\0')
    ) {
      throw new SharedResourceError(
        'RESOURCE_JOURNAL_CORRUPT',
        'Close journal resource inventory is inconsistent.',
      );
    }
    if (self?.kind === 'close' && self.operationId === record.plan.operationId) continue;
    if (record.stage === 'archived-linked-awaiting-integration') {
      // A separate operator-reconciled checkpoint proves the scratch checkout
      // was removed from the filesystem AND Git metadata before releasing admin.
      if (record.scratchRetired === true) continue;
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
    if (settledClose(record.stage)) continue;
    if (overlaps(requested, record.plan.resources)) {
      throw new SharedResourceError(
        'RESOURCE_CONFLICT',
        'Unfinished Close reserves a conflicting checkout/ref; inspect or recover it.',
      );
    }
  }
}

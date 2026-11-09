import type {
  ToolOperation,
  WorkCounts,
  WorkDigest,
  WorkSummary,
} from '@nevo/specflow-contracts/sessions';

/**
 * Turn-wide Work aggregate kept in the Turn record and updated in the same transaction as every
 * Work open/state change and ToolAction open/state change, so reads never scan Work or actions.
 * Turns created before this aggregate existed carry none and are never backfilled.
 */
export interface WorkAggregate {
  counts: WorkCounts;
  digest: WorkDigest;
}

type WorkState = WorkSummary['state'];

export function emptyWorkAggregate(): WorkAggregate {
  return {
    counts: {
      total: 0,
      inProgress: 0,
      byKind: { commentary: 0, reasoning: 0, interaction: 0, tool: 0 },
    },
    digest: { opened: {} },
  };
}

/** Runtime opens every Work in the `active` state. */
export function countWorkOpened(
  aggregate: WorkAggregate,
  kind: WorkSummary['kind'],
): WorkAggregate {
  const { counts } = aggregate;

  return {
    ...aggregate,
    counts: {
      total: counts.total + 1,
      inProgress: counts.inProgress + 1,
      byKind: { ...counts.byKind, [kind]: counts.byKind[kind] + 1 },
    },
  };
}

/** `inProgress` counts Work in the `active` state only. */
export function countWorkTransition(
  aggregate: WorkAggregate,
  from: WorkState,
  to: WorkState,
): WorkAggregate {
  const delta = Number(to === 'active') - Number(from === 'active');
  if (delta === 0) {
    return aggregate;
  }

  return {
    ...aggregate,
    counts: { ...aggregate.counts, inProgress: aggregate.counts.inProgress + delta },
  };
}

/** `opened` counts every opened ToolAction of the Turn, whatever state it later reaches. */
export function countActionOpened(
  aggregate: WorkAggregate,
  operation: ToolOperation,
): WorkAggregate {
  const { opened } = aggregate.digest;

  return {
    ...aggregate,
    digest: {
      ...aggregate.digest,
      opened: { ...opened, [operation]: (opened[operation] ?? 0) + 1 },
    },
  };
}

/** `failed` additionally counts the ToolActions whose state became `failed`. */
export function countActionTransition(
  aggregate: WorkAggregate,
  operation: ToolOperation,
  from: WorkState,
  to: WorkState,
): WorkAggregate {
  if (from === to || to !== 'failed') {
    return aggregate;
  }

  const failed = aggregate.digest.failed ?? {};

  return {
    ...aggregate,
    digest: {
      ...aggregate.digest,
      failed: { ...failed, [operation]: (failed[operation] ?? 0) + 1 },
    },
  };
}

/** A digest is published only once the Turn has opened at least one ToolAction. */
export function hasToolActions(digest: WorkDigest): boolean {
  return Object.values(digest.opened).some((count) => count > 0);
}

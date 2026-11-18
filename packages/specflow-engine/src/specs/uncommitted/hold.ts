import type { SpecFlowEngine } from '../../application';
import { readProjectGitPolicy } from '../../version-control/worktrees/config';
import { effectiveAutoCommit } from '../../version-control/worktrees/policy';
import { listLedgerRecords, type LedgerReason } from '../durable';
import { isExecutionStatePath, isExecutionStatePathOf } from '../execution-paths';

/**
 * Whose paths hold a checkout. A Specification's are counted as `workflowState` (its `.execution/**`
 * and `tasks/**`, written by the workflow) and `documents` (everything else of it); `definitions` are
 * the files an install wrote.
 */
export type UncommittedHoldOwner =
  | {
      readonly kind: 'specification';
      readonly specId: string;
      readonly workflowState: number;
      readonly documents: number;
    }
  | { readonly kind: 'definitions'; readonly paths: number };

export interface UncommittedHold {
  readonly workspaceId: string;
  /** Operations that left the paths (the newest ids the ledger keeps, at most 50 in total). */
  readonly operationIds: readonly string[];
  readonly paths: number;
  /** Why the Engine left them uncommitted (`auto-commit-off`, `abandoned`), each once. */
  readonly reasons: readonly LedgerReason[];
  /**
   * The documents commit policy now: `auto: false` is manual commit mode, `source: 'default'` when
   * no setting names it (off is the default). Absent when the configuration cannot be read.
   */
  readonly policy?: { readonly auto: boolean; readonly source: 'project' | 'local' | 'default' };
  /** Per owner, in the ledger's order; an owner whose paths `allowance` accepts is left out. */
  readonly owners: readonly UncommittedHoldOwner[];
  /** Ledger records that cannot be read: they hold the checkout like entries. */
  readonly unreadable: number;
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

const SPECIFICATION_PATH = /^specs\/active\/[^/]+\/(.+)$/u;

/** Whether a checkout-relative path is the execution state of the Specification it lies in. */
const isWorkflowState = (path: string): boolean => {
  const inside = SPECIFICATION_PATH.exec(path)?.[1];

  return inside !== undefined && isExecutionStatePath(inside);
};

/**
 * Whether the ledger still holds paths of a checkout: the fact that makes Close refuse
 * (`commit-uncommitted`), with whose paths they are and why they are uncommitted. Lock-free,
 * Git-free. With Git disabled nothing can be committed, so the ledger holds nothing back (an
 * unreadable policy is treated as Git enabled: fail closed). The entries `allowance` names do not
 * hold the checkout.
 */
export async function readUncommittedHold(
  engine: SpecFlowEngine,
  workspaceId: string,
  allowance?: UncommittedAllowance,
): Promise<UncommittedHold | undefined> {
  const { records, unreadable } = await listLedgerRecords(engine.context, { workspaceId });
  const held = records.flatMap((record) => {
    const entries = record.entries.filter(
      (entry) =>
        allowance === undefined ||
        record.owner.kind !== 'specification' ||
        record.owner.id !== allowance.specId ||
        !isExecutionStatePathOf(allowance.directory, entry.path),
    );

    return entries.length === 0 ? [] : [{ owner: record.owner, entries }];
  });
  const entries = held.flatMap((record) => record.entries);
  // A record that cannot be read is a fact nobody can judge: it holds the checkout like an entry.
  if (entries.length === 0 && unreadable === 0) {
    return undefined;
  }

  let policy: UncommittedHold['policy'];
  try {
    const configured = (await readProjectGitPolicy(engine.context)).policy;
    if (!configured.enabled) {
      return undefined;
    }

    const effective = effectiveAutoCommit(configured, 'documents');
    policy = { auto: effective.auto, source: effective.source };
  } catch {
    // Fail closed: the hold stands, without a policy to name.
  }

  const ids = new Set(entries.flatMap((entry) => entry.operationIds));

  return {
    workspaceId,
    operationIds: [...ids].slice(-50),
    paths: entries.length,
    reasons: [...new Set(entries.map((entry) => entry.reason))].sort(),
    ...(policy !== undefined ? { policy } : {}),
    owners: held.map(({ owner, entries: owned }): UncommittedHoldOwner => {
      if (owner.kind === 'definitions') {
        return { kind: 'definitions', paths: owned.length };
      }

      const workflowState = owned.filter((entry) => isWorkflowState(entry.path)).length;

      return {
        kind: 'specification',
        specId: owner.id,
        workflowState,
        documents: owned.length - workflowState,
      };
    }),
    unreadable,
  };
}

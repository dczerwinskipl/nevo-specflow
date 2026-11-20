import { UNCOMMITTED_HOLD_PATHS_MAX } from '@nevo/specflow-contracts/documents';

import type { SpecFlowEngine } from '../../application';
import { readProjectGitPolicy } from '../../version-control/worktrees/config';
import { effectiveAutoCommit } from '../../version-control/worktrees/policy';
import { resolveSpecificationForRead } from '../discovery';
import { listLedgerRecords, type LedgerReason } from '../durable';
import { isExecutionStatePath, isExecutionStatePathOf } from '../execution-paths';

/** How many paths of one owner a hold names; `count` is the total. */
export const UNCOMMITTED_HOLD_PATHS_NAMED = UNCOMMITTED_HOLD_PATHS_MAX;

/**
 * Whose paths hold a checkout, with the first {@link UNCOMMITTED_HOLD_PATHS_NAMED} of them (`paths`,
 * checkout-relative, workflow state first) of `count`. A Specification's are counted as
 * `workflowState` (its `.execution/**` and `tasks/**`, written by the workflow) and `documents`
 * (everything else of it), with its `title` when it can be read and whether a step of its runs is in
 * progress (`stepInProgress`; absent when unknown); `definitions` are the files an install wrote.
 */
export type UncommittedHoldOwner =
  | {
      readonly kind: 'specification';
      readonly specId: string;
      readonly title?: string;
      readonly workflowState: number;
      readonly documents: number;
      readonly stepInProgress?: boolean;
      readonly count: number;
      readonly paths: readonly string[];
    }
  | { readonly kind: 'definitions'; readonly count: number; readonly paths: readonly string[] };

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
    owners: await Promise.all(
      held.map(async ({ owner, entries: owned }): Promise<UncommittedHoldOwner> => {
        const paths = owned.map((entry) => entry.path);
        if (owner.kind === 'definitions') {
          return { kind: 'definitions', count: paths.length, paths: named(paths) };
        }

        const state = paths.filter(isWorkflowState);
        const title = await titleOf(engine, owner.id);
        const stepInProgress =
          state.length > 0 ? await engine.stepInProgress?.(owner.id) : undefined;

        return {
          kind: 'specification',
          specId: owner.id,
          ...(title !== undefined ? { title } : {}),
          workflowState: state.length,
          documents: paths.length - state.length,
          ...(stepInProgress !== undefined ? { stepInProgress } : {}),
          count: paths.length,
          paths: named([...state, ...paths.filter((path) => !isWorkflowState(path))]),
        };
      }),
    ),
    unreadable,
  };
}

const named = (paths: readonly string[]): readonly string[] =>
  paths.slice(0, UNCOMMITTED_HOLD_PATHS_NAMED);

/** The Specification's title, read without Git; `undefined` when it cannot be read. */
async function titleOf(engine: SpecFlowEngine, specId: string): Promise<string | undefined> {
  try {
    const found = await resolveSpecificationForRead(engine, specId);

    return found.status === 'available' ? found.specification.title : undefined;
  } catch {
    return undefined;
  }
}

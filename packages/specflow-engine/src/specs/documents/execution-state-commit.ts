import { randomUUID } from 'node:crypto';

import type { SpecFlowEngine } from '../../application';
import { readProjectGitPolicy } from '../../version-control/worktrees/config';
import { effectiveAutoCommit } from '../../version-control/worktrees/policy';
import { resolveSpecification } from '../discovery';
import { readLedgerRecord } from '../durable';
import { isExecutionStatePathOf } from '../execution-paths';
import { pruneUncommitted } from '../uncommitted';
import {
  closureOf,
  editedSince,
  readWorkingContents,
  scopeEntriesOf,
  type ScopeEntry,
} from '../manual-commit';
import { containerDirectory } from './changes/plan/container';
import { manualCommit, type ManualCommitCommandOptions } from './manual-commit';
import { workflowCommitMessage } from './queue/commit-summary';

/**
 * Execution state the commit left out because someone edited part of it since the Engine wrote it:
 * `edited` are those paths, `paths` everything that travels with them (closed under shared operation
 * ids, `edited` included). They stay uncommitted until the person commits them (with Git; the ledger
 * then forgets them) or a Close takes them into its archive commit.
 */
export interface HeldExecutionState {
  readonly edited: readonly string[];
  readonly paths: readonly string[];
}

/** What committing a Specification's execution state did. */
export type ExecutionStateCommitOutcome =
  | {
      readonly kind: 'committed';
      readonly sha?: string;
      readonly paths: readonly string[];
      readonly held?: HeldExecutionState;
    }
  /**
   * The ledger holds no execution state of the Specification (or every path already equals HEAD), or
   * all of it is `held`.
   */
  | { readonly kind: 'nothing-to-commit'; readonly held?: HeldExecutionState }
  /** Git is disabled, or auto-commit is on (the queue commits the workflow state by itself). */
  | { readonly kind: 'not-applicable'; readonly reason: 'git-disabled' | 'auto-commit-on' };

/** What the commit of the execution state says: `phrase` in its subject, `details` in its body. */
export interface ExecutionStateCommitChange {
  /** What happened, for example `finish "Design the solution"`. */
  readonly phrase: string;
  /** Body lines, for example the step id and attempt. */
  readonly details?: readonly string[];
}

const messageText = (message: { subject: string; body: string }): string =>
  message.body.length > 0 ? `${message.subject}\n\n${message.body}` : message.subject;

/**
 * Commits what the uncommitted-changes ledger holds of the Specification's execution state
 * (`.execution/**`, `tasks/**`, Task documents included) as `spec(workflow): <phrase> in <slug>`
 * (never cut, see `workflowCommitMessage`), when auto-commit is off for the documents: the "Next"
 * post action of a manual step (owner decision 2026-11-12). It is a manual commit (ADR 0018) of the
 * `specification` scope limited to those paths, closed under shared operation ids (an operation is
 * never split), so no other uncommitted path of the Specification goes with it and nothing outside the
 * ledger is ever committed. Runs outside the project control lock.
 *
 * A path edited since the Engine wrote it (an agent or a person writing `tasks/<id>/task.md`
 * directly, for example) would refuse the whole manual commit, and keep refusing every later one,
 * since each takes all the execution state. So it is left out before the commit, with every path of
 * its operations (`held`), and the rest is committed. Other refusals are the manual commit's
 * (`MANUAL_COMMIT_CONFLICT` still, when a path is edited between this check and the commit).
 */
export async function commitExecutionState(
  engine: SpecFlowEngine,
  specId: string,
  change: ExecutionStateCommitChange,
  options: ManualCommitCommandOptions = {},
): Promise<ExecutionStateCommitOutcome> {
  const { policy } = await readProjectGitPolicy(engine.context);
  if (!policy.enabled) {
    return { kind: 'not-applicable', reason: 'git-disabled' };
  }

  if (effectiveAutoCommit(policy, 'documents').auto) {
    return { kind: 'not-applicable', reason: 'auto-commit-on' };
  }

  const found = await resolveSpecification(engine, specId);
  if (found.status !== 'available') {
    return { kind: 'nothing-to-commit' };
  }

  const directory = containerDirectory(found.specification.slug, { kind: 'specification' });
  const plan = async () => {
    const record = await readLedgerRecord(engine.context, found.workspaceId, {
      kind: 'specification',
      id: specId,
    });
    const entries = scopeEntriesOf(record === undefined ? [] : [record]);
    const seed = entries
      .map((entry) => entry.path)
      .filter((path) => isExecutionStatePathOf(directory, path));
    const closure = seed.length === 0 ? [] : closureOf(entries, seed);

    return { closure, held: await heldOf(found.workspaceRoot, entries, closure) };
  };

  let planned = await plan();
  if (planned.held) {
    // An edit a person already committed with Git is no edit any more: the prune drops the entries
    // HEAD holds (the sweep would, later), and only what is still edited is held.
    await pruneUncommitted(engine, { workspaceId: found.workspaceId });
    planned = await plan();
  }

  const { closure, held } = planned;
  const paths = held ? closure.filter((path) => !held.paths.includes(path)) : closure;
  if (paths.length === 0) {
    return { kind: 'nothing-to-commit', ...(held ? { held } : {}) };
  }

  const result = await manualCommit(
    engine,
    {
      operationId: randomUUID(),
      scope: 'specification',
      specId,
      message: messageText(
        workflowCommitMessage(change.phrase, found.specification.slug, change.details),
      ),
      paths,
    },
    options,
  );
  if (result.paths.length === 0) {
    return { kind: 'nothing-to-commit', ...(held ? { held } : {}) };
  }

  return {
    kind: 'committed',
    ...(result.commit.sha !== undefined ? { sha: result.commit.sha } : {}),
    paths: result.paths,
    ...(held ? { held } : {}),
  };
}

/** The paths of `closure` edited since their post-image, and everything that travels with them. */
async function heldOf(
  root: string,
  entries: readonly ScopeEntry[],
  closure: readonly string[],
): Promise<HeldExecutionState | undefined> {
  if (closure.length === 0) {
    return undefined;
  }

  const working = await readWorkingContents(root, closure);
  // The manual commit's own rule (admission step 8), judged here so the rest can still be committed.
  const edited = editedSince(
    entries.filter((entry) => working.has(entry.path)),
    working,
  );
  if (edited.length === 0) {
    return undefined;
  }

  const travelling = new Set(closureOf(entries, edited));

  return { edited, paths: closure.filter((path) => travelling.has(path)) };
}

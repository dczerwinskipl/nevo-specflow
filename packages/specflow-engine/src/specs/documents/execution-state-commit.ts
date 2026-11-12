import { randomUUID } from 'node:crypto';

import type { SpecFlowEngine } from '../../application';
import { readProjectGitPolicy } from '../../version-control/worktrees/config';
import { effectiveAutoCommit } from '../../version-control/worktrees/policy';
import { resolveSpecification } from '../discovery';
import { readLedgerRecord } from '../durable';
import { isExecutionStatePathOf } from '../execution-paths';
import { closureOf, scopeEntriesOf } from '../manual-commit';
import { containerDirectory } from './changes/plan/container';
import { manualCommit, type ManualCommitCommandOptions } from './manual-commit';
import {
  DOCUMENT_COMMIT_SUBJECT_MAX,
  WORKFLOW_COMMIT_SUBJECT_PREFIX,
  fitParts,
} from './queue/commit-summary';

/** What committing a Specification's execution state did. */
export type ExecutionStateCommitOutcome =
  | { readonly kind: 'committed'; readonly sha?: string; readonly paths: readonly string[] }
  /** The ledger holds no execution state of the Specification (or every path already equals HEAD). */
  | { readonly kind: 'nothing-to-commit' }
  /** Git is disabled, or auto-commit is on (the queue commits the workflow state by itself). */
  | { readonly kind: 'not-applicable'; readonly reason: 'git-disabled' | 'auto-commit-on' };

/**
 * Commits what the uncommitted-changes ledger holds of the Specification's execution state
 * (`.execution/**`, `tasks/**`, Task documents included) as `spec(workflow): <summary> in <slug>`,
 * when auto-commit is off for
 * the documents: the "Next" post action of a manual step (owner decision 2026-11-12). It is a manual
 * commit (ADR 0018) of the `specification` scope limited to those paths, closed under shared operation
 * ids (an operation is never split), so no other uncommitted path of the Specification goes with it and
 * nothing outside the ledger is ever committed. Runs outside the project control lock. Refusals are
 * the manual commit's (`MANUAL_COMMIT_CONFLICT` when a path was edited by hand since, for example).
 */
export async function commitExecutionState(
  engine: SpecFlowEngine,
  specId: string,
  summary: string,
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
  const record = await readLedgerRecord(engine.context, found.workspaceId, {
    kind: 'specification',
    id: specId,
  });
  const entries = scopeEntriesOf(record === undefined ? [] : [record]);
  const seed = entries
    .map((entry) => entry.path)
    .filter((path) => isExecutionStatePathOf(directory, path));
  if (seed.length === 0) {
    return { kind: 'nothing-to-commit' };
  }

  const result = await manualCommit(
    engine,
    {
      operationId: randomUUID(),
      scope: 'specification',
      specId,
      message: fitParts(
        [
          WORKFLOW_COMMIT_SUBJECT_PREFIX,
          { name: summary },
          ' in ',
          { name: found.specification.slug },
        ],
        DOCUMENT_COMMIT_SUBJECT_MAX,
      ),
      paths: closureOf(entries, seed),
    },
    options,
  );
  if (result.paths.length === 0) {
    return { kind: 'nothing-to-commit' };
  }

  return {
    kind: 'committed',
    ...(result.commit.sha !== undefined ? { sha: result.commit.sha } : {}),
    paths: result.paths,
  };
}

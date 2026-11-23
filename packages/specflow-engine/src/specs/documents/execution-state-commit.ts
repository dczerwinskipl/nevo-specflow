import { randomUUID } from 'node:crypto';

import type { SpecFlowEngine } from '../../application';
import { TASK_INDEX_FILE, TASK_MANIFEST_FILE, TASKS_FOLDER } from '../../tasks/resource/model';
import { openVersionControl } from '../../version-control';
import type { DocumentPathFacts } from '../../version-control/commits/document-change';
import { readProjectGitPolicy } from '../../version-control/worktrees/config';
import { effectiveAutoCommit } from '../../version-control/worktrees/policy';
import { resolveSpecification } from '../discovery';
import { readLedgerRecord } from '../durable';
import { ledgerAuthorsOf } from '../durable/ledger/model';
import { EXECUTION_DIRECTORY, isExecutionStatePathOf } from '../execution-paths';
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
 * Execution state the commit left out because someone edited part of it since the Engine wrote it,
 * or because an agent Turn wrote it (the agent's attempt commit takes that, D15): `edited` are the
 * edited paths, `paths` everything held, with everything that travels with them (closed under shared operation
 * ids, the Task index joining none, `edited` included; the index itself when it waits for a held Task). They stay uncommitted until the person commits them (with Git; the ledger
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
 * The Task index (`tasks/index.yaml`) joins no operations ({@link closureOf} `unlinked`): every Task
 * create, edit or removal rewrites it whole, so it would tie the operations of all Tasks into one.
 *
 * A path edited since the Engine wrote it (an agent or a person writing `tasks/<id>/task.md`
 * directly, for example) would refuse the whole manual commit, and keep refusing every later one.
 * So it is left out before the commit, with every path of its operations (`held`: the files of that
 * Task, not those of the other Tasks), and the rest is committed. The index goes with the rest unless
 * it would register a held Task that HEAD does not have, or drop one HEAD still has; then it is held
 * too, and the next commit after the held Task is released takes it. Other refusals are the manual
 * commit's (`MANUAL_COMMIT_CONFLICT` still, when a path is edited between this check and the commit).
 *
 * An entry an agent Turn wrote (its durable authors name an execution: the Task drafts and execution
 * state of an agent attempt) is never taken, nor anything that travels with it: it belongs to that
 * attempt's own commit alone (D15), so this owner's commit can never split the agent's work.
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
  const index = `${directory}/${TASKS_FOLDER}/${TASK_INDEX_FILE}`;
  const unlinked = new Set([index]);
  const commits = openVersionControl(engine).commits;
  const plan = async () => {
    const record = await readLedgerRecord(engine.context, found.workspaceId, {
      kind: 'specification',
      id: specId,
    });
    const entries = scopeEntriesOf(record === undefined ? [] : [record]);
    // An entry an agent Turn wrote (its durable authors name an execution) is the agent's work: only
    // its attempt commit takes it (D15), never this owner's commit, so it is held with everything
    // that travels with it.
    const authored = new Set(
      (record?.entries ?? [])
        .filter((entry) => ledgerAuthorsOf(entry).executions.length > 0)
        .map((entry) => entry.path),
    );
    const seed = entries
      .map((entry) => entry.path)
      .filter((path) => isExecutionStatePathOf(directory, path) && !authored.has(path));
    const closure = seed.length === 0 ? [] : closureOf(entries, seed, unlinked);
    const agents = closure.filter((path) => authored.has(path));
    const edited = await heldOf(found.workspaceRoot, entries, closure, unlinked);

    return {
      entries,
      closure,
      held:
        agents.length > 0
          ? withAgentWork(edited, closureOf(entries, agents, unlinked), closure)
          : edited,
    };
  };

  let planned = await plan();
  if (planned.held && planned.held.edited.length > 0) {
    // An edit a person already committed with Git is no edit any more: the prune drops the entries
    // HEAD holds (the sweep would, later), and only what is still edited is held.
    await pruneUncommitted(engine, { workspaceId: found.workspaceId });
    planned = await plan();
  }

  const { entries, closure } = planned;
  const held = planned.held
    ? await withIndex(planned.held, { entries, closure, index, directory, unlinked }, (paths) =>
        commits.pathFacts(found.workspaceRoot, paths),
      )
    : undefined;
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
      unlinkedPaths: [...unlinked],
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

/**
 * `held` widened by the agents' entries of `closure` and what travels with them (`travelling`): never
 * committed here; `edited` stays what someone edited.
 */
function withAgentWork(
  held: HeldExecutionState | undefined,
  travelling: readonly string[],
  closure: readonly string[],
): HeldExecutionState {
  const paths = new Set([...(held?.paths ?? []), ...travelling]);

  return { edited: held?.edited ?? [], paths: closure.filter((path) => paths.has(path)) };
}

/** The paths of `closure` edited since their post-image, and everything that travels with them. */
async function heldOf(
  root: string,
  entries: readonly ScopeEntry[],
  closure: readonly string[],
  unlinked: ReadonlySet<string>,
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

  const travelling = new Set(closureOf(entries, edited, unlinked));

  return { edited, paths: closure.filter((path) => travelling.has(path)) };
}

/** The Task a path of the execution state belongs to: its folder below `tasks/`, or its run record. */
function taskOf(directory: string, path: string): string | undefined {
  const inside = path.startsWith(directory + '/') ? path.slice(directory.length + 1) : undefined;
  const match =
    inside === undefined
      ? null
      : (new RegExp(`^${TASKS_FOLDER}/([^/]+)/.+$`, 'u').exec(inside) ??
        new RegExp(`^${EXECUTION_DIRECTORY}/${TASKS_FOLDER}/([^/]+)\\.yaml$`, 'u').exec(inside));

  return match?.[1];
}

interface IndexScope {
  readonly entries: readonly ScopeEntry[];
  readonly closure: readonly string[];
  readonly index: string;
  readonly directory: string;
  readonly unlinked: ReadonlySet<string>;
}

/**
 * `held`, widened so that HEAD stays consistent with its Task index (`validateTaskResources`: no
 * `unregistered` folder, no `broken` run, no `dangling` entry read from HEAD).
 *
 * The index waits when committing it would register a held Task that HEAD does not have (its creation
 * is held) or drop one HEAD still has (its removal is held), or when it is held itself (edited by
 * hand). While it waits, every Task of the commit whose manifest exists in only one of the working
 * tree and HEAD (a creation or a removal) waits too, with every path of its operations: HEAD keeps the
 * old index and exactly the Tasks it lists. Edits of Tasks that HEAD already registers still commit.
 */
async function withIndex(
  held: HeldExecutionState,
  scope: IndexScope,
  pathFacts: (paths: readonly string[]) => Promise<readonly DocumentPathFacts[]>,
): Promise<HeldExecutionState> {
  const { entries, closure, index, directory, unlinked } = scope;
  if (!closure.includes(index)) {
    return held;
  }

  const taskIds = [...new Set(closure.flatMap((path) => taskOf(directory, path) ?? []))].sort();
  const manifestOf = (taskId: string) =>
    `${directory}/${TASKS_FOLDER}/${taskId}/${TASK_MANIFEST_FILE}`;
  const facts = taskIds.length === 0 ? [] : await pathFacts(taskIds.map(manifestOf));
  const moved = new Set(
    taskIds.filter((taskId) => {
      const fact = facts.find((candidate) => candidate.path === manifestOf(taskId));

      // A manifest Git cannot tell about is treated as moved: it waits rather than risk HEAD.
      return fact === undefined || (fact.working === null) !== (fact.head === null);
    }),
  );
  const heldTask = (path: string) => {
    const taskId = taskOf(directory, path);

    return taskId !== undefined && moved.has(taskId);
  };

  if (!held.paths.includes(index) && !held.paths.some(heldTask)) {
    return held;
  }

  const travelling = new Set(
    closureOf(entries, [...held.paths, ...closure.filter(heldTask)], unlinked),
  );

  return {
    edited: held.edited,
    paths: [...new Set([...closure.filter((path) => travelling.has(path)), index])].sort(),
  };
}

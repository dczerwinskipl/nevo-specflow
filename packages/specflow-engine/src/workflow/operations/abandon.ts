import { abandonRun, newRun, type RunAbandonment } from '@nevo/workflow';

import { abandonBlockers, SpecificationExitBlockedError } from '../close/blockers';
import { resolveSpecificationExecution } from '../definitions/catalogue';
import { WorkflowError } from '../errors';
import { ABANDON_REASON_MAX } from '../limits';
import {
  manifestOf,
  taskPosition,
  type ExecutionTask,
  type OwnerActor,
  type SpecificationExecutionRecord,
  type WorkflowActor,
} from '../state/model';
import type { ExecutionChange, ExecutionSnapshot } from '../state/store';
import { executionTasks, findTask, isoNow, type WorkflowDependencies } from './loaded-execution';
import { exitStateOf } from './specification-exit';

export interface AbandonSpecificationInput {
  readonly specId: string;
  /** Why the Specification is abandoned; required, at most `ABANDON_REASON_MAX` characters. */
  readonly reason: string;
  readonly actor: OwnerActor;
}

export interface AbandonSpecificationResult {
  readonly specId: string;
  /** The Specification run's end: when, by whom, why and from where. */
  readonly abandonment: RunAbandonment<WorkflowActor>;
  /** The Tasks this abandon cancelled, in id order (not those cancelled earlier). */
  readonly cancelledTasks: readonly string[];
  /** The Tasks whose run this abandon ended, in id order. */
  readonly abandonedTaskRuns: readonly string[];
}

/**
 * The owner ends a Specification without realizing it ("close without realization"). In one change
 * of the execution store, the Specification run (created first, pinned to the archetype's live
 * workflow, when it never started) and every Task run that has not ended end as `abandoned`, with
 * the owner and the reason; every Task that is not cancelled and whose run has not ended (drafts and
 * Tasks never started included) becomes `cancelled` with the status change source `abandon`. Close
 * then finds nothing unfinished (`closeBlockers`); its Git and workspace rules are unchanged.
 *
 * Final: there is no reopen. A retry with the same reason returns the same result (and finishes the
 * change if it did not finish publishing); another reason, or a completed Specification run, is
 * `WORKFLOW_SPECIFICATION_ENDED`. Not a bypass: a pending change of the execution store or of a
 * Task's documents, a broken Task or another operation on the Specification refuses it with
 * `WORKFLOW_EXIT_BLOCKED` and the blockers (`SpecificationExitBlockedError`). A Specification whose
 * archetype binds no workflow and that never ran has nothing to abandon (`WORKFLOW_NOT_CONFIGURED`).
 */
export function abandonSpecification(
  dependencies: WorkflowDependencies,
  input: AbandonSpecificationInput,
): Promise<AbandonSpecificationResult> {
  const reason = input.reason.trim();
  if (!reason || reason.length > ABANDON_REASON_MAX) {
    return Promise.reject(
      new WorkflowError(
        'WORKFLOW_INPUT_INVALID',
        `Abandoning needs a reason of 1 to ${String(ABANDON_REASON_MAX)} characters.`,
      ),
    );
  }

  if (input.actor.class !== 'human') {
    return Promise.reject(
      new WorkflowError(
        'WORKFLOW_EXECUTOR_NOT_ALLOWED',
        'Only the owner abandons a Specification.',
      ),
    );
  }

  return dependencies.serialize(async () => {
    const snapshot = await dependencies.store.read(input.specId);
    const ended = snapshot.specification?.value.run;
    if (ended?.position.state === 'terminal') {
      return repeated(dependencies, snapshot, reason);
    }

    const blockers = abandonBlockers(await exitStateOf(dependencies, snapshot));
    if (blockers.length > 0) {
      throw new SpecificationExitBlockedError(blockers);
    }

    const at = isoNow(dependencies);
    const command = { at, actor: input.actor, reason };
    const record = specificationRecord(
      dependencies,
      snapshot,
      await archetypeOf(dependencies, snapshot),
    );
    const change: ExecutionChange = {
      specification: {
        expected: snapshot.specification?.revision ?? null,
        next: { ...record, run: abandonRun<WorkflowActor>(record.run, command) },
      },
      ...taskWrites(snapshot, executionTasks(dependencies.catalogue, snapshot).tasks, command),
    };
    await dependencies.store.apply(input.specId, change);

    return resultOf(await dependencies.store.read(input.specId));
  });
}

/** The archetype is read only when the Specification never started (its run record names it). */
async function archetypeOf(
  dependencies: WorkflowDependencies,
  snapshot: ExecutionSnapshot,
): Promise<string> {
  return (
    snapshot.specification?.value.archetype ??
    (await dependencies.references.archetype(snapshot.specId))
  );
}

function specificationRecord(
  dependencies: WorkflowDependencies,
  snapshot: ExecutionSnapshot,
  archetype: string,
): SpecificationExecutionRecord {
  const existing = snapshot.specification?.value;
  if (existing) {
    return existing;
  }

  const resolved = resolveSpecificationExecution(dependencies.catalogue, archetype);
  if (resolved.kind === 'problem') {
    throw new WorkflowError('WORKFLOW_NOT_CONFIGURED', resolved.message);
  }

  return {
    specId: snapshot.specId,
    archetype,
    taskTypes: resolved.taskTypes,
    run: newRun<WorkflowActor>(resolved.workflow),
  };
}

function taskWrites(
  snapshot: ExecutionSnapshot,
  tasks: readonly ExecutionTask[],
  command: { readonly at: string; readonly actor: OwnerActor; readonly reason: string },
): Pick<ExecutionChange, 'manifests' | 'runs'> {
  const manifests: NonNullable<ExecutionChange['manifests']>[number][] = [];
  const runs: NonNullable<ExecutionChange['runs']>[number][] = [];
  for (const task of tasks) {
    if (taskPosition(task).state === 'terminal') {
      continue;
    }

    const stored = findTask(snapshot, task.taskId);
    if (task.run && stored.run) {
      runs.push({
        taskId: task.taskId,
        expected: stored.run.revision,
        next: {
          specId: task.specId,
          taskId: task.taskId,
          run: abandonRun<WorkflowActor>(task.run, command),
        },
      });
    }

    if (task.status !== 'cancelled' && stored.manifest) {
      manifests.push({
        taskId: task.taskId,
        expected: stored.manifest.revision,
        next: manifestOf({
          ...task,
          status: 'cancelled',
          statusChange: { source: 'abandon', at: command.at, reason: command.reason },
        }),
      });
    }
  }

  return {
    ...(manifests.length > 0 ? { manifests } : {}),
    ...(runs.length > 0 ? { runs } : {}),
  };
}

/**
 * A Specification whose run ended: the same abandon again returns its result, after finishing the
 * change if it is still pending (an empty change only does that); anything else is refused.
 */
async function repeated(
  dependencies: WorkflowDependencies,
  snapshot: ExecutionSnapshot,
  reason: string,
): Promise<AbandonSpecificationResult> {
  const abandonment = snapshot.specification?.value.run.abandonment;
  if (abandonment?.reason !== reason) {
    throw new WorkflowError(
      'WORKFLOW_SPECIFICATION_ENDED',
      abandonment
        ? 'The Specification was abandoned already, for another reason; abandoning is final.'
        : 'The Specification workflow completed; it cannot be abandoned.',
    );
  }

  if (await dependencies.holds.pendingExecutionChange(snapshot.specId)) {
    await dependencies.store.apply(snapshot.specId, {});
  }

  return resultOf(snapshot);
}

/** The result of the abandon recorded in a snapshot, so a retry returns the same one. */
function resultOf(snapshot: ExecutionSnapshot): AbandonSpecificationResult {
  const abandonment = snapshot.specification?.value.run.abandonment;
  if (!abandonment) {
    throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'The abandon was not recorded.');
  }

  const byThisAbandon = (candidate: RunAbandonment<WorkflowActor> | undefined) =>
    candidate?.at === abandonment.at && candidate.reason === abandonment.reason;

  return {
    specId: snapshot.specId,
    abandonment,
    cancelledTasks: snapshot.manifests
      .filter(
        ({ value }) =>
          value.status === 'cancelled' &&
          value.statusChange?.source === 'abandon' &&
          value.statusChange.at === abandonment.at,
      )
      .map(({ value }) => value.id)
      .sort(),
    abandonedTaskRuns: snapshot.runs
      .filter(({ value }) => byThisAbandon(value.run.abandonment))
      .map(({ value }) => value.taskId)
      .sort(),
  };
}

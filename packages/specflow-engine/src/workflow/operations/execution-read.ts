import { taskProjection, type ActionDependencies, type ActionProjection } from './actions';
import { inspectSnapshot, type ExecutionInspection } from './inspect';

/**
 * Where a Task stands for the owner, derived from the Engine's facts (its status, run position and
 * action projection), never stored:
 *
 * - `needs-approval`: a draft;
 * - `in-progress`: its run started and has not ended (a step is active, the next one is ready, or it
 *   waits for an event);
 * - `ready`: it can start now (`not-started`);
 * - `waiting`: it cannot start only because dependencies have not completed yet, and every one of
 *   them still can;
 * - `blocked`: it cannot start for another reason (its type is no longer allowed, its definition is
 *   missing or changed, a required context entry does not resolve, or a dependency can never
 *   complete);
 * - `done`: its run completed;
 * - `ended`: its run was abandoned (with its Specification);
 * - `held`: on hold;
 * - `cancelled`: will not be done;
 * - `broken`: its files are inconsistent (`ExecutionInspection.brokenTasks`).
 */
export type TaskLane =
  | 'needs-approval'
  | 'in-progress'
  | 'ready'
  | 'waiting'
  | 'blocked'
  | 'done'
  | 'ended'
  | 'held'
  | 'cancelled'
  | 'broken';

/** Whether the Specification's Tasks are prepared: none yet, a draft still open, or all decided. */
export type TaskPreparation = 'empty' | 'preparing' | 'prepared';

/**
 * Progress over the Tasks meant to be done: `total` counts every Task that is neither cancelled nor
 * ended by an abandon (a broken Task counts, it is not done), `completed` those whose run completed.
 */
export interface TaskProgress {
  readonly completed: number;
  readonly total: number;
}

export interface ExecutionReading {
  readonly inspection: ExecutionInspection;
  /** The action projection of each requested Task, from the same snapshot as `inspection`. */
  readonly actions: ReadonlyMap<string, ActionProjection>;
  /** The lane of each requested Task and of every broken Task. */
  readonly lanes: ReadonlyMap<string, TaskLane>;
  /** Over every Task of the inspection, whichever Tasks were projected. */
  readonly progress: TaskProgress;
  readonly preparation: TaskPreparation;
}

export interface ReadExecutionOptions {
  /**
   * The Tasks whose action projection (and lane) is read: `all`, some, or none (`[]`) when only the
   * inspection, progress and preparation are needed.
   */
  readonly tasks: 'all' | readonly string[];
}

function laneOf(
  entry: ExecutionInspection['tasks'][number],
  projection: ActionProjection,
): TaskLane {
  const { record } = entry;
  if (record.status === 'cancelled') {
    return 'cancelled';
  }

  const position = projection.position;
  if (position.kind === 'terminal') {
    return position.outcome === 'completed' ? 'done' : 'ended';
  }

  if (record.status === 'draft') {
    return 'needs-approval';
  }

  if (record.status === 'on-hold') {
    return 'held';
  }

  if (record.run && record.run.position.state !== 'not-started') {
    return 'in-progress';
  }

  if (position.kind === 'not-started') {
    return 'ready';
  }

  if (position.kind === 'blocked') {
    const onlyDependencies = position.blockers.every(
      (blocker) => blocker.kind === 'dependencies' && blocker.unsatisfiable.length === 0,
    );

    return onlyDependencies && position.blockers.length > 0 ? 'waiting' : 'blocked';
  }

  return 'in-progress';
}

/**
 * One read of a Specification's execution for presentation: the inspection, the action projection
 * of the requested Tasks, and the lanes, progress and preparation derived from them, all from ONE
 * snapshot read under `serialize`, so no part reflects another moment. Read-only, like its parts.
 */
export function readExecution(
  dependencies: ActionDependencies,
  specId: string,
  options: ReadExecutionOptions,
): Promise<ExecutionReading> {
  return dependencies.serialize(async () => {
    const snapshot = await dependencies.store.read(specId);
    const inspection = inspectSnapshot(dependencies.catalogue, snapshot);
    const wanted =
      options.tasks === 'all'
        ? inspection.tasks.map((entry) => entry.record.taskId)
        : options.tasks.filter((taskId) =>
            inspection.tasks.some((entry) => entry.record.taskId === taskId),
          );
    const actions = new Map<string, ActionProjection>();
    for (const taskId of wanted) {
      actions.set(
        taskId,
        await taskProjection(dependencies, snapshot, { kind: 'task', specId, taskId }),
      );
    }

    const lanes = new Map<string, TaskLane>();
    for (const entry of inspection.tasks) {
      const projection = actions.get(entry.record.taskId);
      if (projection) {
        lanes.set(entry.record.taskId, laneOf(entry, projection));
      }
    }

    for (const taskId of inspection.brokenTasks) {
      lanes.set(taskId, 'broken');
    }

    return {
      inspection,
      actions,
      lanes,
      progress: progressOf(inspection),
      preparation:
        inspection.tasks.length + inspection.brokenTasks.length === 0
          ? 'empty'
          : inspection.tasks.some((entry) => entry.record.status === 'draft')
            ? 'preparing'
            : 'prepared',
    };
  });
}

/** {@link TaskProgress} of an inspection: it needs no action projection. */
function progressOf(inspection: ExecutionInspection): TaskProgress {
  let completed = 0;
  let total = inspection.brokenTasks.length;
  for (const { record } of inspection.tasks) {
    const position = record.run?.position;
    const outcome = position?.state === 'terminal' ? position.outcome : undefined;
    if (record.status === 'cancelled' || outcome === 'abandoned') {
      continue;
    }

    total += 1;
    completed += outcome === 'completed' ? 1 : 0;
  }

  return { completed, total };
}

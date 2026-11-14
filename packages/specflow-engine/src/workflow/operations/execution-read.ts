import type { RunPosition } from '@nevo/workflow';

import type { AttentionItem } from '../attention/model';
import { taskPosition, type TaskStatus } from '../state/model';
import { taskProjection, type ActionDependencies, type ActionProjection } from './actions';
import { inspectSnapshot, type ExecutionInspection } from './inspect';
import type { StartBlocker } from './start-blockers';

/**
 * The neutral facts of one readable Task, derived from its record and its action projection, never
 * stored. They describe authoritative state only: no group, label or order (a dashboard grouping is
 * a presentation of these facts, owned by the surface).
 */
export interface TaskFacts {
  /** The preparation status (`draft`, `ready`, `on-hold`, `cancelled`). */
  readonly preparation: TaskStatus;
  /** On hold by its own escalation (`statusChange.source: escalation`). */
  readonly escalated: boolean;
  /** Where its run stands (`not-started` without a run); a terminal position carries the outcome. */
  readonly position: RunPosition;
  /** Its next step can start now: the start-blocker rule of the action projection finds none. */
  readonly startable: boolean;
  /** Why its next step cannot start (the projection's blockers); empty when it can, or is active. */
  readonly startBlockers: readonly StartBlocker[];
  /** It waits for these direct dependencies (`unsatisfiable`: those that can never complete). */
  readonly dependencyWait?: {
    readonly waitingFor: readonly string[];
    readonly unsatisfiable: readonly string[];
  };
  /** The workflow its run is pinned to is missing or changed. */
  readonly definitionChanged: boolean;
  /** What a person has to do about it now, if anything (the projection's `attention`). */
  readonly attention?: AttentionItem;
}

/** Whether the Specification's Tasks are prepared: none yet, a draft still open, or all decided. */
export type TaskPreparation = 'empty' | 'preparing' | 'prepared';

/**
 * Progress over the Tasks meant to be done: `total` counts every Task that is neither cancelled nor
 * ended by an abandon (a broken Task counts, it is not done; a Task on hold counts, it is
 * unfinished), `completed` those whose run completed. `cancelled` and `onHold` count those Tasks
 * apart, so a surface names them without guessing.
 */
export interface TaskProgress {
  readonly completed: number;
  readonly total: number;
  readonly cancelled: number;
  readonly onHold: number;
}

export interface ExecutionReading {
  readonly inspection: ExecutionInspection;
  /** The action projection of each requested Task, from the same snapshot as `inspection`. */
  readonly actions: ReadonlyMap<string, ActionProjection>;
  /** The neutral facts of each requested readable Task (broken ones: `inspection.brokenTasks`). */
  readonly facts: ReadonlyMap<string, TaskFacts>;
  /**
   * Every attention item of the snapshot (`inspection.attention`, `deriveAttention`) and the start-blocker items of the
   * requested Tasks: complete for `tasks: 'all'`. Broken Tasks first, then the Specification, then
   * its Tasks in id order; at most one per subject.
   */
  readonly attention: readonly AttentionItem[];
  /** Over every Task of the inspection, whichever Tasks were projected. */
  readonly progress: TaskProgress;
  readonly preparation: TaskPreparation;
}

export interface ReadExecutionOptions {
  /**
   * The Tasks whose action projection (and facts) is read: `all`, some, or none (`[]`) when only
   * the inspection, progress and preparation are needed.
   */
  readonly tasks: 'all' | readonly string[];
}

/** {@link TaskFacts} of a Task the inspection lists, from its action projection. Pure. */
export function taskFactsOf(
  entry: ExecutionInspection['tasks'][number],
  projection: ActionProjection,
): TaskFacts {
  const { record } = entry;
  const position = projection.position;
  const startBlockers = position.kind === 'blocked' ? position.blockers : [];
  const dependencies = startBlockers.find(
    (blocker): blocker is Extract<StartBlocker, { kind: 'dependencies' }> =>
      blocker.kind === 'dependencies',
  );

  return {
    preparation: record.status,
    escalated: record.status === 'on-hold' && record.statusChange?.source === 'escalation',
    position: taskPosition(record),
    startable: position.kind === 'not-started' || position.kind === 'ready',
    startBlockers,
    ...(dependencies
      ? {
          dependencyWait: {
            waitingFor: dependencies.waitingFor,
            unsatisfiable: dependencies.unsatisfiable,
          },
        }
      : {}),
    definitionChanged: entry.definitionChanged === true,
    ...(projection.attention ? { attention: projection.attention } : {}),
  };
}

/**
 * One read of a Specification's execution for presentation: the inspection, the action projection
 * of the requested Tasks, and the facts, attention, progress and preparation derived from them, all
 * from ONE snapshot read under `serialize`, so no part reflects another moment. Read-only, like its
 * parts.
 */
export function readExecution(
  dependencies: ActionDependencies,
  specId: string,
  options: ReadExecutionOptions,
): Promise<ExecutionReading> {
  return dependencies.serialize(async () => {
    const snapshot = await dependencies.store.read(specId);
    const inspection = inspectSnapshot(dependencies.catalogue, snapshot);
    const derived = inspection.attention;
    const wanted =
      options.tasks === 'all'
        ? inspection.tasks.map((entry) => entry.record.taskId)
        : options.tasks.filter((taskId) =>
            inspection.tasks.some((entry) => entry.record.taskId === taskId),
          );
    const actions = new Map<string, ActionProjection>();
    const facts = new Map<string, TaskFacts>();
    for (const entry of inspection.tasks) {
      const taskId = entry.record.taskId;
      if (!wanted.includes(taskId)) {
        continue;
      }

      const projection = await taskProjection(
        dependencies,
        snapshot,
        { kind: 'task', specId, taskId },
        derived,
      );
      actions.set(taskId, projection);
      facts.set(taskId, taskFactsOf(entry, projection));
    }

    return {
      inspection,
      actions,
      facts,
      attention: attentionOf(derived, facts),
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

/** The derived items with the start-blocker items of the projected Tasks, in the reading's order. */
function attentionOf(
  derived: readonly AttentionItem[],
  facts: ReadonlyMap<string, TaskFacts>,
): AttentionItem[] {
  const taskOf = (item: AttentionItem) =>
    item.subject.kind === 'task' ? item.subject.taskId : undefined;
  const items = [...derived];
  for (const [taskId, task] of facts) {
    if (task.attention && !derived.some((item) => taskOf(item) === taskId)) {
      items.push(task.attention);
    }
  }

  const rank = (item: AttentionItem) =>
    item.reason === 'task-broken' ? 0 : item.subject.kind === 'specification' ? 1 : 2;

  const id = (item: AttentionItem) => taskOf(item) ?? '';

  return items.sort(
    (left, right) =>
      rank(left) - rank(right) || (id(left) < id(right) ? -1 : id(left) > id(right) ? 1 : 0),
  );
}

/** {@link TaskProgress} of an inspection: it needs no action projection. */
function progressOf(inspection: ExecutionInspection): TaskProgress {
  let completed = 0;
  let cancelled = 0;
  let onHold = 0;
  let total = inspection.brokenTasks.length;
  for (const { record } of inspection.tasks) {
    const outcome =
      record.run?.position.state === 'terminal' ? record.run.position.outcome : undefined;
    if (record.status === 'cancelled' || outcome === 'abandoned') {
      cancelled += record.status === 'cancelled' ? 1 : 0;
      continue;
    }

    total += 1;
    completed += outcome === 'completed' ? 1 : 0;
    onHold += record.status === 'on-hold' ? 1 : 0;
  }

  return { completed, total, cancelled, onHold };
}

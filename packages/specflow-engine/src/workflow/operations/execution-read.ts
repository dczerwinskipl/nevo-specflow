import type { RunPosition } from '@nevo/workflow';

import type { AttentionItem } from '../attention/model';
import { taskPosition, type TaskStatus } from '../state/model';
import type { ExecutionSnapshot } from '../state/store';
import type { ActionDependencies, ActionProjection } from './actions';
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

/** The facts of a broken Task (`ExecutionInspection.brokenTasks`): what is readable of it. */
export interface BrokenTaskFacts {
  readonly taskId: string;
  /** Its manifest's title, when the manifest is readable. */
  readonly title?: string;
  readonly reason: Extract<StartBlocker, { kind: 'broken' }>['reason'];
}

/** Whether the Specification's Tasks are prepared: none yet, a draft still open, or all decided. */
export type TaskPreparation = 'empty' | 'preparing' | 'prepared';

/**
 * Progress over the Tasks meant to be done: `total` counts every Task that is neither cancelled
 * nor ended without completing (a broken Task counts, it is not done; a Task on hold counts, it is
 * unfinished), `completed` those whose run completed. `cancelled` (also those an abandon
 * cancelled), `ended` (abandoned by its own workflow, not cancelled) and `onHold` count those Tasks
 * apart, so a surface names them without guessing.
 */
export interface TaskProgress {
  readonly completed: number;
  readonly total: number;
  readonly cancelled: number;
  readonly ended: number;
  readonly onHold: number;
}

export interface ExecutionReading {
  /** Its `attention` is every attention item of the read (start blockers included). */
  readonly inspection: ExecutionInspection;
  /** The action projection of each requested Task, from the same snapshot as `inspection`. */
  readonly actions: ReadonlyMap<string, ActionProjection>;
  /** The neutral facts of each requested readable Task. */
  readonly facts: ReadonlyMap<string, TaskFacts>;
  /** Every broken Task, in id order. */
  readonly broken: readonly BrokenTaskFacts[];
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
 * One read of a Specification's execution for presentation: the inspection (with every attention
 * item), the action projection of the requested Tasks, and the facts, progress and preparation
 * derived from them, all from ONE snapshot read under `serialize`, so no part reflects another
 * moment. Read-only, like its parts.
 */
export function readExecution(
  dependencies: ActionDependencies,
  specId: string,
  options: ReadExecutionOptions,
): Promise<ExecutionReading> {
  return dependencies.serialize(async () => {
    const snapshot = await dependencies.store.read(specId);
    const listed = snapshot.manifests.map((entry) => entry.value.id);
    const wanted =
      options.tasks === 'all' ? listed : options.tasks.filter((taskId) => listed.includes(taskId));
    const { inspection, projections } = await inspectSnapshot(dependencies, snapshot, wanted);
    const actions = new Map<string, ActionProjection>();
    const facts = new Map<string, TaskFacts>();
    for (const entry of inspection.tasks) {
      const taskId = entry.record.taskId;
      const projection = projections.get(taskId);
      if (projection && wanted.includes(taskId)) {
        actions.set(taskId, projection);
        facts.set(taskId, taskFactsOf(entry, projection));
      }
    }

    return {
      inspection,
      actions,
      facts,
      broken: brokenFactsOf(snapshot, inspection),
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

/** What is readable of each broken Task: its manifest's title and why it is broken. */
function brokenFactsOf(
  snapshot: ExecutionSnapshot,
  inspection: ExecutionInspection,
): BrokenTaskFacts[] {
  return inspection.brokenTasks.map((taskId) => {
    const issue = inspection.issues.find(
      (candidate) =>
        (candidate.kind === 'broken' || candidate.kind === 'dangling') &&
        candidate.taskId === taskId,
    );
    const title = snapshot.manifests.find((entry) => entry.value.id === taskId)?.value.title;

    return {
      taskId,
      ...(title !== undefined ? { title } : {}),
      // A Task with consistent files whose position its history does not justify.
      reason:
        issue && (issue.kind === 'broken' || issue.kind === 'dangling') ? issue.reason : 'position',
    };
  });
}

/** {@link TaskProgress} of an inspection: it needs no action projection. */
function progressOf(inspection: ExecutionInspection): TaskProgress {
  let completed = 0;
  let cancelled = 0;
  let ended = 0;
  let onHold = 0;
  let total = inspection.brokenTasks.length;
  for (const { record } of inspection.tasks) {
    const outcome =
      record.run?.position.state === 'terminal' ? record.run.position.outcome : undefined;
    if (record.status === 'cancelled') {
      cancelled += 1;
      continue;
    }

    if (outcome === 'abandoned') {
      ended += 1;
      continue;
    }

    total += 1;
    completed += outcome === 'completed' ? 1 : 0;
    onHold += record.status === 'on-hold' ? 1 : 0;
  }

  return { completed, total, cancelled, ended, onHold };
}

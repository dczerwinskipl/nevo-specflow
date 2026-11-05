import { ANY_TASK_TYPE, type WorkflowEffect } from '@nevo/specflow-contracts/documents';

import type { TaskType, WorkflowDefinition } from '../definitions/model';
import { WorkflowError } from '../errors';
import {
  TASKS_PER_FINISH_MAX,
  TASKS_PER_SPECIFICATION_MAX,
  TASK_DEPENDENCIES_MAX,
  TASK_SUMMARY_MAX,
  TASK_TITLE_MAX,
  isValidTaskId,
} from '../limits';
import { newRun } from '../progression/progression';
import type { TaskRecord, TaskTypes } from '../state/model';

/**
 * Tasks of a Specification: created from the structured finish input of a step that `produces: tasks`
 * (the planner names each Task's own type), blocked and unblocked by Specification effects, and gated
 * by their dependencies. Pure.
 */

export interface TaskProposal {
  readonly id: string;
  readonly title: string;
  readonly summary?: string;
  readonly type: string;
  readonly dependsOn?: readonly string[];
}

export interface MaterializeTasksInput {
  readonly specId: string;
  readonly proposals: readonly TaskProposal[];
  readonly existing: readonly TaskRecord[];
  readonly allowedTypes: TaskTypes;
  readonly taskType: (id: string) => TaskType | undefined;
  readonly workflow: (id: string) => WorkflowDefinition | undefined;
  readonly origin: { readonly step: string; readonly attempt: number };
}

function invalid(message: string): never {
  throw new WorkflowError('WORKFLOW_INPUT_INVALID', message);
}

export function isTaskTypeAllowed(allowed: TaskTypes, type: string): boolean {
  return allowed[0] === ANY_TASK_TYPE || (allowed as readonly string[]).includes(type);
}

/** New Task records for the proposals; existing Tasks are never redefined by a later breakdown. */
export function materializeTasks(input: MaterializeTasksInput): TaskRecord[] {
  if (input.proposals.length > TASKS_PER_FINISH_MAX) {
    invalid(`At most ${TASKS_PER_FINISH_MAX} Tasks can be created by one step.`);
  }

  if (input.existing.length + input.proposals.length > TASKS_PER_SPECIFICATION_MAX) {
    invalid(`A Specification has at most ${TASKS_PER_SPECIFICATION_MAX} Tasks.`);
  }

  const known = new Map(input.existing.map((task) => [task.taskId, task.dependsOn] as const));
  for (const proposal of input.proposals) {
    if (!isValidTaskId(proposal.id)) {
      invalid(`The Task id "${proposal.id.slice(0, 80)}" is not a valid id.`);
    }

    if (known.has(proposal.id)) {
      invalid(`The Task "${proposal.id}" already exists.`);
    }

    const title = proposal.title.trim();
    if (!title || title.length > TASK_TITLE_MAX) {
      invalid(`The Task "${proposal.id}" needs a title of at most ${TASK_TITLE_MAX} characters.`);
    }

    if ((proposal.summary?.trim().length ?? 0) > TASK_SUMMARY_MAX) {
      invalid(`The summary of the Task "${proposal.id}" is longer than ${TASK_SUMMARY_MAX}.`);
    }

    if (new Set(proposal.dependsOn ?? []).size > TASK_DEPENDENCIES_MAX) {
      invalid(`The Task "${proposal.id}" has more than ${TASK_DEPENDENCIES_MAX} dependencies.`);
    }

    known.set(proposal.id, proposal.dependsOn ?? []);
  }

  const created = input.proposals.map((proposal): TaskRecord => {
    if (!isTaskTypeAllowed(input.allowedTypes, proposal.type)) {
      invalid(`The Specification does not allow Tasks of type "${proposal.type}".`);
    }

    const type = input.taskType(proposal.type);
    const workflow = type ? input.workflow(type.workflow) : undefined;
    if (!type || workflow?.subject !== 'task') {
      throw new WorkflowError(
        'WORKFLOW_NOT_CONFIGURED',
        `The task type "${proposal.type}" or its workflow is not defined.`,
      );
    }

    for (const dependency of proposal.dependsOn ?? []) {
      if (dependency === proposal.id || !known.has(dependency)) {
        invalid(`The Task "${proposal.id}" depends on an unknown Task "${dependency}".`);
      }
    }

    return {
      specId: input.specId,
      taskId: proposal.id,
      title: proposal.title.trim(),
      ...(proposal.summary?.trim() ? { summary: proposal.summary.trim() } : {}),
      type: type.id,
      dependsOn: [...new Set(proposal.dependsOn ?? [])],
      origin: input.origin,
      run: newRun(workflow),
    };
  });
  assertAcyclic(known);

  return created;
}

function assertAcyclic(graph: ReadonlyMap<string, readonly string[]>): void {
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (id: string): void => {
    const seen = state.get(id);
    if (seen === 'done') {
      return;
    }

    if (seen === 'visiting') {
      invalid(`The Task dependencies form a cycle at "${id}".`);
    }

    state.set(id, 'visiting');
    for (const dependency of graph.get(id) ?? []) {
      visit(dependency);
    }

    state.set(id, 'done');
  };

  for (const id of graph.keys()) {
    visit(id);
  }
}

/**
 * Apply Specification effects to the Tasks; returns only the Tasks that changed. Blocking touches
 * only Tasks that have never had an attempt (`not-started`, or `ready` after a return of the Task
 * itself): work in progress is never interrupted by the Engine.
 */
export function applyTaskEffects(
  tasks: readonly TaskRecord[],
  effects: readonly WorkflowEffect[],
  at: string,
): TaskRecord[] {
  const changed = new Map<string, TaskRecord>();
  const current = (task: TaskRecord) => changed.get(task.taskId) ?? task;
  for (const effect of effects) {
    for (const original of tasks) {
      const task = current(original);
      if (
        effect === 'block-pending-tasks' &&
        !task.blocked &&
        task.run.position.state !== 'terminal' &&
        task.run.attempts.length === 0
      ) {
        changed.set(task.taskId, { ...task, blocked: { reason: 'specification-returned', at } });
      }

      if (effect === 'unblock-tasks' && task.blocked) {
        const { blocked: _blocked, ...rest } = task;
        changed.set(task.taskId, rest);
      }
    }
  }

  return [...changed.values()];
}

export type TaskReadiness =
  | { readonly kind: 'ready' }
  | { readonly kind: 'blocked' }
  | { readonly kind: 'dependencies'; readonly waitingFor: readonly string[] };

/** A Task may start when it is not blocked and every direct dependency completed. */
export function taskReadiness(task: TaskRecord, tasks: readonly TaskRecord[]): TaskReadiness {
  if (task.blocked) {
    return { kind: 'blocked' };
  }

  const byId = new Map(tasks.map((candidate) => [candidate.taskId, candidate] as const));
  const waitingFor = task.dependsOn.filter((id) => {
    const position = byId.get(id)?.run.position;

    return position?.state !== 'terminal' || position.outcome !== 'completed';
  });

  return waitingFor.length > 0 ? { kind: 'dependencies', waitingFor } : { kind: 'ready' };
}

/** The Specification's wait step is satisfied when every Task is terminal (also when there is none). */
export function allTasksTerminal(tasks: readonly TaskRecord[]): boolean {
  return tasks.every((task) => task.run.position.state === 'terminal');
}

/**
 * True when Tasks are still open but none of them is ready, so the Specification's wait step would
 * wait forever without anyone being told. The dependency graph is acyclic by construction, so a
 * chain of open Tasks always ends in one that is ready unless it is blocked or depends on an
 * abandoned Task.
 */
export function tasksStuck(tasks: readonly TaskRecord[]): boolean {
  const open = tasks.filter((task) => task.run.position.state !== 'terminal');

  return open.length > 0 && open.every((task) => taskReadiness(task, tasks).kind !== 'ready');
}

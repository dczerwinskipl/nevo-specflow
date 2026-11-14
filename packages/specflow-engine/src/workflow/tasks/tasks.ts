import {
  ANY_TASK_TYPE,
  type SpecificationExecution,
  type WorkflowEffect,
} from '@nevo/specflow-contracts/documents';

import type { TaskType, TaskTypes, WorkflowDefinition } from '../definitions/model';
import { WorkflowError } from '../errors';
import {
  FEEDBACK_MAX,
  TASKS_PER_FINISH_MAX,
  TASKS_PER_SPECIFICATION_MAX,
  TASK_DEPENDENCIES_MAX,
  TASK_SUMMARY_MAX,
  TASK_TITLE_MAX,
  isValidTaskId,
} from '../limits';
import { TASK_MAIN_DOCUMENT, type TaskOrigin } from '../../tasks/resource/model';
import { dependencyCycle } from '../state/dependency-cycle';
import {
  taskPosition,
  type ExecutionTask,
  type SpecificationExecutionRecord,
  type TaskStatus,
} from '../state/model';

/**
 * Tasks of a Specification: drafted from the structured finish input of a step that `produces: tasks`
 * (the planner names each Task's own type), approved by the declared effect `approve-draft-tasks`,
 * held, resumed and cancelled only by explicit decisions or the Task's own escalation, and gated by
 * their dependencies. Pure.
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
  readonly existing: readonly ExecutionTask[];
  readonly allowedTypes: TaskTypes;
  readonly taskType: (id: string) => TaskType | undefined;
  readonly workflow: (id: string) => WorkflowDefinition | undefined;
  /** The producing attempt: the origin of every draft it creates or revises. */
  readonly origin: Extract<TaskOrigin, { readonly kind: 'produced' }>;
  readonly at: string;
}

export interface MaterializedTasks {
  /** Every Task record the finish writes: new and revised drafts, and the drafts it cancels. */
  readonly changed: readonly ExecutionTask[];
  /** Ids of the Tasks that did not exist before. */
  readonly created: readonly string[];
}

/** The reason recorded on a draft that a later finish of a producing step no longer lists. */
export const LEFT_OUT_OF_BREAKDOWN = 'Left out of the breakdown.';

/** A kept draft that depends on a draft the same finish cancels. */
export interface DraftConflict {
  readonly kept: string;
  readonly dependsOnCancelled: string;
}

/**
 * `WORKFLOW_INPUT_INVALID` of a producing finish that keeps a draft but leaves out (cancels) a draft
 * it depends on (`draftConflicts`): keep both, or cancel both.
 */
export class DraftConflictError extends WorkflowError {
  readonly draftConflicts: readonly DraftConflict[];

  constructor(conflicts: readonly DraftConflict[]) {
    super(
      'WORKFLOW_INPUT_INVALID',
      `Kept drafts depend on drafts this finish cancels: ${conflicts
        .map((conflict) => `${conflict.kept} on ${conflict.dependsOnCancelled}`)
        .join(', ')}.`,
    );
    this.draftConflicts = conflicts;
  }
}

function invalid(message: string): never {
  throw new WorkflowError('WORKFLOW_INPUT_INVALID', message);
}

export function isTaskTypeAllowed(allowed: TaskTypes, type: string): boolean {
  return allowed[0] === ANY_TASK_TYPE || (allowed as readonly string[]).includes(type);
}

/**
 * The task types a Specification allows now (D04): the snapshot its run took when it started, else
 * the live execution binding of its archetype. An archetype without a binding, or a binding without
 * `taskTypes`, allows every type.
 */
export function effectiveTaskTypes(input: {
  readonly specification?: Pick<SpecificationExecutionRecord, 'taskTypes'>;
  readonly binding?: SpecificationExecution;
}): TaskTypes {
  return input.specification?.taskTypes ?? input.binding?.taskTypes ?? [ANY_TASK_TYPE];
}

/**
 * The live task type of a Task and the workflow it runs, for its creation and its first start:
 * `WORKFLOW_DEFINITION_MISSING` when the type or its Task workflow is not defined,
 * `WORKFLOW_TASK_TYPE_NOT_ALLOWED` when the effective policy does not allow the type.
 */
export function resolveTaskType(input: {
  readonly type: string;
  readonly allowed: TaskTypes;
  readonly taskType: (id: string) => TaskType | undefined;
  readonly workflow: (id: string) => WorkflowDefinition | undefined;
}): { readonly type: TaskType; readonly workflow: WorkflowDefinition } {
  const type = input.taskType(input.type);
  if (!type) {
    throw new WorkflowError(
      'WORKFLOW_DEFINITION_MISSING',
      `The task type "${input.type.slice(0, 80)}" is not defined.`,
    );
  }

  if (!isTaskTypeAllowed(input.allowed, type.id)) {
    throw new WorkflowError(
      'WORKFLOW_TASK_TYPE_NOT_ALLOWED',
      `The Specification does not allow Tasks of type "${type.id}".`,
    );
  }

  const workflow = input.workflow(type.workflow);
  if (workflow?.annotations.subject !== 'task') {
    throw new WorkflowError(
      'WORKFLOW_DEFINITION_MISSING',
      `The workflow "${type.workflow}" of the task type "${type.id}" is not a defined Task workflow.`,
    );
  }

  return { type, workflow };
}

/**
 * The draft Tasks after a finish of a step that produces Tasks (D06). The proposals are the complete
 * list of the drafts this producing step owns: the drafts whose origin is `produced` by the same
 * step, from any earlier attempt. Drafts created by hand, or by another step, are never touched:
 *
 * - a proposal with a new id creates a `draft`, without a run (its first start pins its workflow);
 * - a proposal with the id of a draft the step owns replaces its definition (a draft never ran);
 * - a proposal with the id of any other Task rejects the whole finish: a Task that is no longer a
 *   draft (its status is changed by a decision, never by redefining it), a manual draft or another
 *   step's draft;
 * - a draft the step owns that is not listed is `cancelled`.
 *
 * A dependency of a proposal names a Task that is not cancelled. A Task outside the list that depends
 * on a draft the finish cancels is not refused: it can no longer start, which the Specification's
 * wait reports as `tasks-stuck`.
 */
export function materializeTasks(input: MaterializeTasksInput): MaterializedTasks {
  if (input.proposals.length > TASKS_PER_FINISH_MAX) {
    invalid(`At most ${TASKS_PER_FINISH_MAX} Tasks can be drafted by one step.`);
  }

  const existing = new Map(input.existing.map((task) => [task.taskId, task] as const));
  const listed = new Set<string>();
  for (const proposal of input.proposals) {
    if (!isValidTaskId(proposal.id)) {
      invalid(`The Task id "${proposal.id.slice(0, 80)}" is not a valid id.`);
    }

    if (listed.has(proposal.id)) {
      invalid(`The Task "${proposal.id}" is listed twice.`);
    }

    const known = existing.get(proposal.id);
    if (known !== undefined && known.status !== 'draft') {
      invalid(
        `The Task "${proposal.id}" is ${known.status}, not a draft; decide its status instead.`,
      );
    }

    if (known !== undefined && !ownsDraft(input.origin, known)) {
      invalid(
        known.origin.kind === 'manual'
          ? `The Task "${proposal.id}" was created by hand; a breakdown cannot revise it.`
          : `The Task "${proposal.id}" was drafted by the step "${known.origin.step}"; this step cannot revise it.`,
      );
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

    listed.add(proposal.id);
  }

  const created = input.proposals.filter((proposal) => !existing.has(proposal.id));
  if (input.existing.length + created.length > TASKS_PER_SPECIFICATION_MAX) {
    invalid(`A Specification has at most ${TASKS_PER_SPECIFICATION_MAX} Tasks.`);
  }

  const leftOut = input.existing.filter(
    (task) => ownsDraft(input.origin, task) && !listed.has(task.taskId),
  );
  const cancelled = new Set([
    ...input.existing.filter((task) => task.status === 'cancelled').map((task) => task.taskId),
    ...leftOut.map((task) => task.taskId),
  ]);
  const graph = new Map<string, readonly string[]>();
  for (const task of input.existing) {
    if (listed.has(task.taskId)) {
      continue;
    }

    graph.set(task.taskId, task.dependsOn);
  }

  for (const proposal of input.proposals) {
    graph.set(proposal.id, proposal.dependsOn ?? []);
  }

  const leftOutIds = new Set(leftOut.map((task) => task.taskId));
  const conflicts = input.proposals.flatMap((proposal) =>
    (proposal.dependsOn ?? [])
      .filter((dependency) => leftOutIds.has(dependency))
      .map((dependency) => ({ kept: proposal.id, dependsOnCancelled: dependency })),
  );
  if (conflicts.length > 0) {
    throw new DraftConflictError(conflicts);
  }

  const drafts = input.proposals.map((proposal): ExecutionTask => {
    if (!isTaskTypeAllowed(input.allowedTypes, proposal.type)) {
      invalid(`The Specification does not allow Tasks of type "${proposal.type}".`);
    }

    const type = input.taskType(proposal.type);
    if (!type || input.workflow(type.workflow)?.annotations.subject !== 'task') {
      throw new WorkflowError(
        'WORKFLOW_NOT_CONFIGURED',
        `The task type "${proposal.type}" or its workflow is not defined.`,
      );
    }

    for (const dependency of proposal.dependsOn ?? []) {
      if (dependency === proposal.id || !graph.has(dependency) || cancelled.has(dependency)) {
        invalid(
          `The Task "${proposal.id}" depends on an unknown or cancelled Task "${dependency}".`,
        );
      }
    }

    // A revised draft keeps its documents and context; only its definition is replaced.
    const revised = existing.get(proposal.id);

    return {
      specId: input.specId,
      taskId: proposal.id,
      title: proposal.title.trim(),
      ...(proposal.summary?.trim() ? { summary: proposal.summary.trim() } : {}),
      type: type.id,
      dependsOn: [...new Set(proposal.dependsOn ?? [])],
      origin: input.origin,
      status: 'draft',
      documents: revised?.documents ?? [{ ...TASK_MAIN_DOCUMENT }],
      ...(revised?.context !== undefined ? { context: revised.context } : {}),
    };
  });
  const cycle = dependencyCycle(graph);
  if (cycle !== undefined) {
    invalid(`The Task dependencies form a cycle at "${cycle}".`);
  }

  return {
    changed: [
      ...drafts,
      ...leftOut.map((task): ExecutionTask => ({
        ...task,
        status: 'cancelled',
        statusChange: { source: 'decision', at: input.at, reason: LEFT_OUT_OF_BREAKDOWN },
      })),
    ],
    created: created.map((proposal) => proposal.id),
  };
}

/** A draft the producing step (by its id, any attempt) drafted, so its later finishes revise it. */
function ownsDraft(origin: MaterializeTasksInput['origin'], task: ExecutionTask): boolean {
  return (
    task.status === 'draft' && task.origin.kind === 'produced' && task.origin.step === origin.step
  );
}

/** A status a decision may set; `draft` is only ever the status of a new Task. */
export type TaskDecisionStatus = Exclude<TaskStatus, 'draft'>;

/** An explicit status decision of the spec writer (finish input) or the owner (`setTaskStatus`). */
export interface TaskDecision {
  readonly taskId: string;
  readonly status: TaskDecisionStatus;
  readonly reason?: string;
}

/** The status changes a decision may make; `cancelled` is final. */
const ALLOWED_DECISIONS: Readonly<Record<TaskStatus, readonly string[]>> = {
  draft: ['ready', 'cancelled'],
  ready: ['on-hold', 'cancelled'],
  'on-hold': ['ready', 'cancelled'],
  cancelled: [],
};

/** Why a status decision is not allowed (`decideTaskStatus`), or `undefined` when it is. */
export type TaskDecisionRefusal = 'ended' | 'status' | 'active-attempt';

/**
 * The rule of {@link decideTaskStatus} without the input checks: a Task whose run ended keeps its
 * status (`ended`), the status must allow the change (`status`), and a Task with an active attempt
 * is neither put on hold nor cancelled (`active-attempt`, owner decision: finish or return the
 * current step first). Pure; the action projection asks the same rule.
 */
export function taskDecisionRefusal(
  task: ExecutionTask,
  status: TaskStatus,
): TaskDecisionRefusal | undefined {
  const state = taskPosition(task).state;
  if (state === 'terminal') {
    return 'ended';
  }

  if (!ALLOWED_DECISIONS[task.status].includes(status)) {
    return 'status';
  }

  return (status === 'cancelled' || status === 'on-hold') && state === 'active'
    ? 'active-attempt'
    : undefined;
}

/**
 * The Task after a decision, or a refusal when the change is not allowed (`taskDecisionRefusal`):
 * `WORKFLOW_INPUT_INVALID` when its run ended or its status does not allow it, `WORKFLOW_TASK_BLOCKED`
 * while it has an active attempt (no hold, no cancel until the current step is finished or returned).
 */
export function decideTaskStatus(
  task: ExecutionTask,
  decision: TaskDecision,
  at: string,
): ExecutionTask {
  const reason = decision.reason?.trim();
  if ((reason?.length ?? 0) > FEEDBACK_MAX) {
    invalid(`The reason for the Task "${task.taskId}" is longer than ${FEEDBACK_MAX}.`);
  }

  const refusal = taskDecisionRefusal(task, decision.status);
  if (refusal === 'ended') {
    invalid(`The Task "${task.taskId}" has ended; its status can no longer change.`);
  }

  if (refusal === 'status') {
    invalid(
      `The Task "${task.taskId}" cannot go from ${task.status} to ${String(decision.status).slice(0, 40)}.`,
    );
  }

  if (refusal === 'active-attempt') {
    throw new WorkflowError(
      'WORKFLOW_TASK_BLOCKED',
      `The Task "${task.taskId}" has an active attempt (active-attempt); finish or return the current step before it goes ${decision.status}.`,
    );
  }

  return {
    ...task,
    status: decision.status,
    statusChange: { source: 'decision', at, ...(reason ? { reason } : {}) },
  };
}

/** Apply a list of decisions as a whole; one decision that is not allowed rejects all of them. */
export function applyTaskDecisions(
  tasks: readonly ExecutionTask[],
  decisions: readonly TaskDecision[],
  at: string,
): ExecutionTask[] {
  if (decisions.length > TASKS_PER_SPECIFICATION_MAX) {
    invalid(`At most ${TASKS_PER_SPECIFICATION_MAX} Task decisions can be made at once.`);
  }

  const byId = new Map(tasks.map((task) => [task.taskId, task] as const));
  const changed = new Map<string, ExecutionTask>();
  for (const decision of decisions) {
    const task = byId.get(decision.taskId);
    if (!task) {
      invalid(`Unknown Task "${String(decision.taskId).slice(0, 80)}".`);
    }

    if (changed.has(task.taskId)) {
      invalid(`The Task "${task.taskId}" has two decisions.`);
    }

    changed.set(task.taskId, decideTaskStatus(task, decision, at));
  }

  return [...changed.values()];
}

/**
 * Apply Specification effects to the Tasks; returns only the Tasks that changed.
 * `approve-draft-tasks` makes every `draft` Task `ready`.
 */
export function applyTaskEffects(
  tasks: readonly ExecutionTask[],
  effects: readonly WorkflowEffect[],
): ExecutionTask[] {
  if (!effects.includes('approve-draft-tasks')) {
    return [];
  }

  return tasks
    .filter((task) => task.status === 'draft')
    .map((task): ExecutionTask => ({ ...task, status: 'ready' }));
}

/** The Task is on hold because one of its steps escalated to the Specification. */
export function isTaskEscalated(task: ExecutionTask): boolean {
  return task.status === 'on-hold' && task.statusChange?.source === 'escalation';
}

/** A closed Task no longer keeps the Specification waiting: its run ended, or it was cancelled. */
export function isTaskClosed(task: ExecutionTask): boolean {
  return taskPosition(task).state === 'terminal' || task.status === 'cancelled';
}

export type TaskReadiness =
  | { readonly kind: 'ready' }
  /** The status does not allow a start: `draft`, `on-hold` or `cancelled`. */
  | { readonly kind: 'status'; readonly status: Exclude<TaskStatus, 'ready'> }
  | { readonly kind: 'dependencies'; readonly waitingFor: readonly string[] };

/**
 * A Task may start when it is `ready` and every direct dependency completed. `tasks` holds no broken
 * Task (`executionTasks`), so a broken dependency never completes.
 */
export function taskReadiness(task: ExecutionTask, tasks: readonly ExecutionTask[]): TaskReadiness {
  if (task.status !== 'ready') {
    return { kind: 'status', status: task.status };
  }

  const byId = new Map(tasks.map((candidate) => [candidate.taskId, candidate] as const));
  const waitingFor = task.dependsOn.filter((id) => {
    const dependency = byId.get(id);
    const position = dependency ? taskPosition(dependency) : undefined;

    return position?.state !== 'terminal' || position.outcome !== 'completed';
  });

  return waitingFor.length > 0 ? { kind: 'dependencies', waitingFor } : { kind: 'ready' };
}

/**
 * The Specification's wait step is satisfied when every Task is closed (also when there is none). A
 * broken Task (`executionTasks`) is never closed.
 */
export function allTasksClosed(
  tasks: readonly ExecutionTask[],
  broken: readonly string[],
): boolean {
  return broken.length === 0 && tasks.every(isTaskClosed);
}

/**
 * The dependencies of `waitingFor` that can no longer complete: they ended without completing, were
 * cancelled, or are not among `tasks` (broken, `executionTasks`).
 */
export function unsatisfiableDependencies(
  waitingFor: readonly string[],
  tasks: readonly ExecutionTask[],
): string[] {
  return waitingFor.filter((id) => {
    const dependency = tasks.find((task) => task.taskId === id);

    return !dependency || isTaskClosed(dependency);
  });
}

/** Why an open Task keeps a stuck Specification from finishing (`tasks-stuck`). */
export const BLOCKING_TASK_CAUSES = [
  'draft',
  'on-hold',
  'broken',
  /** A direct dependency was cancelled or ended without completing. */
  'dependency-unsatisfiable',
] as const;
export type BlockingTaskCause = (typeof BLOCKING_TASK_CAUSES)[number];

export interface BlockingTask {
  readonly taskId: string;
  readonly cause: BlockingTaskCause;
}

/**
 * The Tasks a person resolves so a stuck wait can progress, in id order: each draft, each Task on
 * hold, each broken Task, and each `ready` Task with a direct dependency that was cancelled or ended
 * without completing. A Task that only waits for other open Tasks is not listed (resolving those
 * moves it), nor is one whose only unsatisfiable dependencies are broken (the broken Task is listed).
 */
export function blockingTasks(
  tasks: readonly ExecutionTask[],
  broken: readonly string[],
): BlockingTask[] {
  const found: BlockingTask[] = broken.map((taskId) => ({ taskId, cause: 'broken' as const }));
  for (const task of tasks) {
    if (isTaskClosed(task)) {
      continue;
    }

    if (task.status === 'draft' || task.status === 'on-hold') {
      found.push({ taskId: task.taskId, cause: task.status });
      continue;
    }

    const readiness = taskReadiness(task, tasks);
    const closed =
      readiness.kind === 'dependencies'
        ? unsatisfiableDependencies(readiness.waitingFor, tasks).filter(
            (id) => !broken.includes(id),
          )
        : [];
    if (closed.length > 0) {
      found.push({ taskId: task.taskId, cause: 'dependency-unsatisfiable' });
    }
  }

  return found.sort((left, right) =>
    left.taskId < right.taskId ? -1 : left.taskId > right.taskId ? 1 : 0,
  );
}

/**
 * True when Tasks are still open but none of them can progress: none is running and none can start
 * (`ready` with its dependencies completed), so the Specification's wait step would wait forever
 * without anyone being told. Every open Task is then a draft, on hold, or waits (directly or through
 * other open Tasks) for one of them, for a broken Task or for an abandoned or cancelled Task; a
 * broken Task never progresses.
 */
export function tasksStuck(tasks: readonly ExecutionTask[], broken: readonly string[]): boolean {
  const open = tasks.filter((task) => !isTaskClosed(task));

  return (
    open.length + broken.length > 0 &&
    open.every(
      (task) =>
        taskPosition(task).state !== 'active' && taskReadiness(task, tasks).kind !== 'ready',
    )
  );
}

import type * as core from '@nevo/workflow';

import type { TaskManifest } from '../../tasks/resource/model';
import type { TaskTypes } from '../definitions/model';
import { WorkflowError } from '../errors';

/**
 * Canonical execution state of one Specification: the run of its own workflow, the Task resources
 * (`tasks/index.yaml`, `tasks/<id>/task.yaml`) and one run record per Task that has a run. Only the position and the history are stored; readiness,
 * lanes and statuses are derived (architecture `architecture.workflow.deterministic-workflow`). The
 * run format is the core's (`../core`); SpecFlow keys each run by its subject.
 */

export type WorkflowSubject =
  | { readonly kind: 'specification'; readonly specId: string }
  | { readonly kind: 'task'; readonly specId: string; readonly taskId: string };

/** Stable text key of a subject, for error messages. */
export function subjectKey(subject: WorkflowSubject): string {
  return subject.kind === 'specification'
    ? `specification:${subject.specId}`
    : `task:${subject.specId}:${subject.taskId}`;
}

/**
 * An agent working on an attempt, from trusted Runtime context (never from the agent's own input):
 * the archetype it works as, its provider and model, and the Session it runs in. An active agent
 * attempt started in a Session is resumed and finished only by that Session.
 */
export interface AgentActor {
  readonly class: 'agent';
  readonly details: {
    readonly archetype?: string;
    readonly provider: string;
    readonly model?: string;
    readonly sessionId?: string;
  };
}

/**
 * The owner acting in person: built only by the Runtime (from the authenticated subject) or the CLI
 * (from the local OS user), never from a request payload. `trust` says how the person was
 * identified; `local` is not proof of a human (an agent running as the same OS user looks alike).
 */
export interface OwnerActor {
  readonly class: 'human';
  readonly details: {
    readonly actorId: string;
    readonly trust: 'local' | 'authenticated';
  };
}

/** Who works on, finishes or decides something in a SpecFlow run. */
export type WorkflowActor = AgentActor | OwnerActor;

export type WorkflowRun = core.WorkflowRun<WorkflowActor>;
export type AttemptRecord = core.AttemptRecord<WorkflowActor>;

export interface SpecificationExecutionRecord {
  readonly specId: string;
  /** The Specification archetype whose execution binding started this run. */
  readonly archetype: string;
  /** The task types allowed when the run started. */
  readonly taskTypes: TaskTypes;
  readonly run: WorkflowRun;
}

export { TASK_STATUSES, type TaskStatus, type TaskStatusChange } from '../../tasks/resource/model';

/**
 * The run record of one Task (`.execution/tasks/<id>.yaml`): only its run. What the Task is (title,
 * type, status, dependencies, origin, documents, context) is its resource, `tasks/<id>/task.yaml`
 * (`tasks/resource`). A run record whose Task is not registered is broken.
 */
export interface TaskRunRecord {
  readonly specId: string;
  readonly taskId: string;
  readonly run: WorkflowRun;
}

/**
 * A Task as the operations see it: its manifest joined with its run record (`executionTasks`). A
 * Task without a run record has not started: its first start validates the live task type and
 * workflow and creates the record pinned to that workflow (`startTaskExecution`).
 *
 * The preparation status (`status`, `TASK_STATUSES`) says whether the Task may be worked on,
 * separately from its run position:
 * - `draft`: created by a step that produces Tasks and not approved yet; it never ran;
 * - `ready`: approved; it can start once its dependencies completed;
 * - `on-hold`: kept, but no step of it starts until a decision makes it `ready` again;
 * - `cancelled`: will not be done; final.
 *
 * Only explicit decisions (the spec writer's finish input, the owner's `setTaskStatus`), the declared
 * effect `approve-draft-tasks` and the Task's own escalation change it; a Specification return never
 * does. There is no `completed`: completion is the run reaching `terminal`.
 */
export interface ExecutionTask extends Omit<TaskManifest, 'id'> {
  readonly specId: string;
  readonly taskId: string;
  /** Absent until the first start of the Task. */
  readonly run?: WorkflowRun;
}

const NOT_STARTED: core.RunPosition = { state: 'not-started' };

/** The position of a Task's run; a Task without a run has not started. */
export function taskPosition(task: Pick<ExecutionTask, 'run'>): core.RunPosition {
  return task.run?.position ?? NOT_STARTED;
}

/** The manifest part of a Task, in the field order of `task.yaml`. */
export function manifestOf(task: ExecutionTask): TaskManifest {
  return {
    id: task.taskId,
    title: task.title,
    ...(task.summary !== undefined ? { summary: task.summary } : {}),
    type: task.type,
    status: task.status,
    ...(task.statusChange !== undefined ? { statusChange: task.statusChange } : {}),
    dependsOn: task.dependsOn,
    origin: task.origin,
    documents: task.documents,
    ...(task.context !== undefined ? { context: task.context } : {}),
  };
}

/** The Task of a manifest and its run. */
export function executionTaskOf(
  specId: string,
  manifest: TaskManifest,
  run: WorkflowRun | undefined,
): ExecutionTask {
  const { id, ...rest } = manifest;

  return { specId, taskId: id, ...rest, ...(run ? { run } : {}) };
}

/** A broken Task (`executionTasks`) is refused by every operation on it. */
export function brokenTask(taskId: string): never {
  throw new WorkflowError(
    'WORKFLOW_STATE_CORRUPT',
    `The Task "${taskId}" is broken: its resource or its run record is missing, or its run does not follow from its history or its status; restore it from Git.`,
  );
}

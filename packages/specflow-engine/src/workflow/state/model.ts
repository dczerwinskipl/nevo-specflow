import type * as core from '@nevo/workflow';
import type { TaskTypes } from '../definitions/model';
import { WorkflowError } from '../errors';

/**
 * Canonical execution state of one Specification: the run of its own workflow and one record per Task,
 * each with its own type and workflow run. Only the position and the history are stored; readiness,
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
  /**
   * Every Task of the Specification, in creation order: the authoritative Task set. A Task is added
   * in the same change that creates its record and never removed (a left-out draft is cancelled, not
   * deleted). A listed Task without a record is broken; a record that is not listed is corrupt state.
   */
  readonly taskIds: readonly string[];
  readonly run: WorkflowRun;
}

/**
 * Preparation status of a Task: whether it may be worked on, separate from its run position.
 * - `draft`: created by a step that produces Tasks and not approved yet; it never ran;
 * - `ready`: approved; it can start once its dependencies completed;
 * - `on-hold`: kept, but no step of it starts until a decision makes it `ready` again;
 * - `cancelled`: will not be done; final.
 *
 * Only explicit decisions (the spec writer's finish input, the owner's `setTaskStatus`), the declared
 * effect `approve-draft-tasks` and the Task's own escalation change it; a Specification return never
 * does. There is no `completed`: completion is the run reaching `terminal`.
 */
export const TASK_STATUSES = ['draft', 'ready', 'on-hold', 'cancelled'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

/** The last explicit status change of a Task: a decision or the Task's own escalation. */
export interface TaskStatusChange {
  readonly source: 'decision' | 'escalation';
  readonly at: string;
  /** The decision's reason, or the escalation feedback. */
  readonly reason?: string;
}

export interface TaskRecord {
  readonly specId: string;
  readonly taskId: string;
  readonly title: string;
  readonly summary?: string;
  readonly type: string;
  readonly dependsOn: readonly string[];
  /** The Specification attempt that created (or last revised) the Task. */
  readonly origin: { readonly step: string; readonly attempt: number };
  readonly status: TaskStatus;
  readonly statusChange?: TaskStatusChange;
  readonly run: WorkflowRun;
}

/** A broken Task (`executionTasks`) is refused by every operation on it. */
export function brokenTask(taskId: string): never {
  throw new WorkflowError(
    'WORKFLOW_STATE_CORRUPT',
    `The Task "${taskId}" is broken: its record is missing or its position does not follow from its history; restore it from Git.`,
  );
}

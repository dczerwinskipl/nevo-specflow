import type { TerminalOutcome } from '../definitions/model';
import { WorkflowError } from '../errors';

/**
 * Canonical execution state of one Specification: the run of its own workflow and one record per Task,
 * each with its own type and workflow run. Only the position and the history are stored; readiness,
 * lanes and statuses are derived (architecture `architecture.workflow.deterministic-workflow`).
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
 * - `not-started`: the next start activates the entry step;
 * - `active`: one attempt of one step is in progress;
 * - `ready`: the previous step finished (or the owner returned) and `step` is the next to start;
 *   finish never starts it, so this checkpoint is observable;
 * - `terminal`: the run ended.
 */
export type RunPosition =
  | { readonly state: 'not-started' }
  | { readonly state: 'active'; readonly step: string; readonly attempt: number }
  | { readonly state: 'ready'; readonly step: string }
  | { readonly state: 'terminal'; readonly outcome: TerminalOutcome };

/**
 * The definition an attempt is interpreted with. A changed definition never silently reinterprets a
 * running workflow: the run keeps its pin until it is re-pinned explicitly.
 */
export interface WorkflowPin {
  readonly id: string;
  readonly version: number;
  /** sha256 of the canonical JSON of the resolved definition. */
  readonly revision: string;
}

/** Who did the work of an attempt. Always taken from trusted Runtime/CLI context, never from an agent. */
export type ExecutorRecord =
  | {
      readonly kind: 'agent';
      readonly archetype?: string;
      readonly provider: string;
      readonly model?: string;
      readonly sessionId?: string;
    }
  | { readonly kind: 'human'; readonly actorId?: string };

export type AttemptOutcome =
  | {
      readonly kind: 'transition';
      readonly transition: string;
      readonly result?: string;
      readonly feedback?: string;
      readonly artifacts: readonly string[];
    }
  /** The owner returned the run to an earlier step while this attempt was active. */
  | { readonly kind: 'returned'; readonly to: string; readonly feedback?: string };

export interface AttemptRecord {
  readonly step: string;
  readonly attempt: number;
  /**
   * Order of the record among the run's attempts and returns (1, 2, ...). It decides which event came
   * last; timestamps do not, because clocks can repeat or go back.
   */
  readonly sequence: number;
  readonly startedAt: string;
  readonly executor?: ExecutorRecord;
  /** Absent while the attempt is active. */
  readonly endedAt?: string;
  /** Who finished the attempt; the Session a `reuse` continuation continues. */
  readonly finishedBy?: ExecutorRecord;
  readonly outcome?: AttemptOutcome;
}

/** An owner return from a non-active position (no attempt was running). */
export interface ReturnRecord {
  /** See {@link AttemptRecord.sequence}. */
  readonly sequence: number;
  readonly at: string;
  readonly from: RunPosition;
  readonly to: string;
  readonly feedback?: string;
}

export interface WorkflowRun {
  readonly workflow: WorkflowPin;
  readonly position: RunPosition;
  readonly attempts: readonly AttemptRecord[];
  readonly returns: readonly ReturnRecord[];
}

export type TaskTypes = readonly ['*'] | readonly string[];

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

export function nextAttemptNumber(run: WorkflowRun, step: string): number {
  return (
    run.attempts.reduce(
      (highest, record) => (record.step === step ? Math.max(highest, record.attempt) : highest),
      0,
    ) + 1
  );
}

/** The sequence of the next attempt or return record of a run. */
export function nextSequence(run: WorkflowRun): number {
  return (
    [...run.attempts, ...run.returns].reduce(
      (highest, record) => Math.max(highest, record.sequence),
      0,
    ) + 1
  );
}

export function activeAttempt(run: WorkflowRun): AttemptRecord | undefined {
  const position = run.position;
  if (position.state !== 'active') {
    return undefined;
  }

  return run.attempts.find(
    (record) => record.step === position.step && record.attempt === position.attempt,
  );
}

export function isTerminal(run: WorkflowRun): boolean {
  return run.position.state === 'terminal';
}

/**
 * The listed Tasks whose record is missing, in list order. Only such a Task is broken: it never
 * starts or finishes, keeps the Specification's wait open and blocks its dependents.
 */
export function brokenTaskIds(
  specification: SpecificationExecutionRecord | undefined,
  tasks: readonly TaskRecord[],
): string[] {
  const present = new Set(tasks.map((task) => task.taskId));

  return (specification?.taskIds ?? []).filter((taskId) => !present.has(taskId));
}

export function brokenTask(taskId: string): never {
  throw new WorkflowError(
    'WORKFLOW_STATE_CORRUPT',
    `The Task "${taskId}" is listed by the Specification but its record is missing; restore it from Git.`,
  );
}

import type { ExecutionCatalogue } from '../definitions/catalogue';
import type { TaskType, TaskTypes, WorkflowStep } from '../definitions/model';
import {
  handoffOf,
  type ExecutorClass,
  type Handoff,
  type RunPosition,
  type WorkflowPin,
} from '@nevo/workflow';
import { isTaskTypeAllowed, taskReadiness, type TaskReadiness } from '../tasks/tasks';
import type {
  ExecutionTask,
  TaskStatus,
  TaskStatusChange,
  WorkflowRun,
  WorkflowSubject,
} from '../state/model';

/**
 * What the executor of an active attempt works with: the step contract, the results it may finish
 * with, what the previous step handed over and the bound agent archetype. Compiling it is read-only;
 * it never runs a gate or changes state.
 */
export interface StepContext {
  readonly subject: WorkflowSubject;
  readonly workflow: WorkflowPin;
  readonly step: {
    readonly id: string;
    readonly title: string;
    readonly kind: WorkflowStep['kind'];
    readonly purpose: string;
    readonly instructions?: string;
    /** Who may do the step (a work step); who does this attempt is its recorded actor. */
    readonly executors?: readonly ExecutorClass[];
    readonly interaction?: 'interactive' | 'autonomous';
    readonly produces?: 'tasks';
  };
  readonly attempt: number;
  readonly finish: {
    readonly transitions: readonly {
      readonly id: string;
      readonly result?: string;
      readonly label?: string;
      readonly feedback: 'required' | 'optional';
    }[];
  };
  readonly handoff?: Handoff;
  readonly archetype?: {
    readonly id: string;
    readonly title: string;
    readonly profile?: string;
    readonly instructions?: string;
  };
  readonly task?: {
    readonly id: string;
    readonly title: string;
    readonly summary?: string;
    readonly type: string;
    readonly typeInstructions?: string;
  };
  /** For a step that produces Tasks: the task types the planner may use. */
  readonly taskTypes?: readonly Pick<TaskType, 'id' | 'title' | 'description' | 'useWhen'>[];
  /**
   * For a Specification work step: the Tasks that already exist, with their status and its last
   * change (for example an escalation and its feedback). A step that produces Tasks lists the
   * complete set of draft Tasks in its finish (a listed draft is revised, an unlisted one cancelled);
   * any Specification step may decide the status of these Tasks with `taskDecisions`.
   */
  readonly existingTasks?: readonly {
    readonly id: string;
    readonly title: string;
    readonly summary?: string;
    readonly type: string;
    readonly dependsOn: readonly string[];
    readonly status: TaskStatus;
    readonly statusChange?: TaskStatusChange;
    readonly state: RunPosition['state'];
    readonly readiness: TaskReadiness['kind'];
  }[];
  /**
   * For a Specification work step: the broken Tasks by id (`executionTasks`), which are not in
   * `existingTasks`. Nothing can be decided on them until their record is restored from Git.
   */
  readonly broken?: readonly string[];
}

export interface StepContextInput {
  readonly subject: WorkflowSubject;
  readonly run: WorkflowRun;
  readonly step: WorkflowStep;
  readonly attempt: number;
  readonly catalogue: ExecutionCatalogue;
  readonly task?: ExecutionTask;
  readonly allowedTaskTypes: TaskTypes;
  /** The Tasks of the Specification that are not broken (`executionTasks`). */
  readonly tasks: readonly ExecutionTask[];
  /** The broken Tasks, in list order. */
  readonly broken: readonly string[];
}

export function compileStepContext(input: StepContextInput): StepContext {
  const { step, catalogue } = input;
  const archetype =
    step.kind === 'work' && step.annotations.archetype !== undefined
      ? catalogue.archetype(step.annotations.archetype)
      : undefined;
  const handoff = handoffOf({
    ...input.run,
    attempts: input.run.attempts.filter(
      (record) => !(record.step === step.id && record.attempt === input.attempt),
    ),
  });
  const task = input.task;
  const type = task ? catalogue.taskType(task.type) : undefined;

  return {
    subject: input.subject,
    workflow: input.run.workflow,
    step: {
      id: step.id,
      title: step.title,
      kind: step.kind,
      purpose: step.purpose,
      ...(step.instructions !== undefined ? { instructions: step.instructions } : {}),
      ...(step.kind === 'work'
        ? {
            executors: step.executors,
            interaction: step.annotations.interaction,
            ...(step.annotations.produces !== undefined
              ? { produces: step.annotations.produces }
              : {}),
          }
        : {}),
    },
    attempt: input.attempt,
    finish: {
      transitions: step.transitions.map((transition) => ({
        id: transition.id,
        ...(transition.result !== undefined ? { result: transition.result } : {}),
        ...(transition.label !== undefined ? { label: transition.label } : {}),
        feedback: transition.feedback,
      })),
    },
    ...(handoff ? { handoff } : {}),
    ...(archetype
      ? {
          archetype: {
            id: archetype.id,
            title: archetype.title,
            ...(archetype.profile !== undefined ? { profile: archetype.profile } : {}),
            ...(archetype.instructions !== undefined
              ? { instructions: archetype.instructions }
              : {}),
          },
        }
      : {}),
    ...(task
      ? {
          task: {
            id: task.taskId,
            title: task.title,
            ...(task.summary !== undefined ? { summary: task.summary } : {}),
            type: task.type,
            ...(type?.instructions !== undefined ? { typeInstructions: type.instructions } : {}),
          },
        }
      : {}),
    ...(step.kind === 'work' && step.annotations.produces === 'tasks'
      ? {
          taskTypes: catalogue
            .taskTypes()
            .filter((candidate) => isTaskTypeAllowed(input.allowedTaskTypes, candidate.id))
            .map(({ id, title, description, useWhen }) => ({ id, title, description, useWhen })),
        }
      : {}),
    ...(step.kind === 'work' && input.subject.kind === 'specification'
      ? {
          existingTasks: input.tasks.map((existing) => ({
            id: existing.taskId,
            title: existing.title,
            ...(existing.summary !== undefined ? { summary: existing.summary } : {}),
            type: existing.type,
            dependsOn: existing.dependsOn,
            status: existing.status,
            ...(existing.statusChange ? { statusChange: existing.statusChange } : {}),
            state: existing.run.position.state,
            readiness: taskReadiness(existing, input.tasks).kind,
          })),
          broken: input.broken,
        }
      : {}),
  };
}

import type { ExecutionCatalogue } from '../definitions/catalogue';
import type { TaskType, WorkflowStep } from '../definitions/model';
import { handoffOf, type Handoff } from '../progression/progression';
import { isTaskTypeAllowed, taskReadiness, type TaskReadiness } from '../tasks/tasks';
import type {
  RunPosition,
  TaskRecord,
  TaskTypes,
  WorkflowPin,
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
    readonly executor?: 'agent' | 'human';
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
   * For a step that produces Tasks: the Tasks that already exist. The finish lists only new Tasks
   * (an existing id rejects the whole finish); a new Task may depend on these.
   */
  readonly existingTasks?: readonly {
    readonly id: string;
    readonly title: string;
    readonly type: string;
    readonly state: RunPosition['state'];
    readonly blocked: boolean;
    readonly readiness: TaskReadiness['kind'];
  }[];
}

export interface StepContextInput {
  readonly subject: WorkflowSubject;
  readonly run: WorkflowRun;
  readonly step: WorkflowStep;
  readonly attempt: number;
  readonly catalogue: ExecutionCatalogue;
  readonly task?: TaskRecord;
  readonly allowedTaskTypes: TaskTypes;
  /** Every Task of the Specification. */
  readonly tasks: readonly TaskRecord[];
}

export function compileStepContext(input: StepContextInput): StepContext {
  const { step, catalogue } = input;
  const archetype =
    step.kind === 'work' && step.archetype !== undefined
      ? catalogue.archetype(step.archetype)
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
            executor: step.executor,
            interaction: step.interaction,
            ...(step.produces !== undefined ? { produces: step.produces } : {}),
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
    ...(step.kind === 'work' && step.produces === 'tasks'
      ? {
          taskTypes: catalogue
            .taskTypes()
            .filter((candidate) => isTaskTypeAllowed(input.allowedTaskTypes, candidate.id))
            .map(({ id, title, description, useWhen }) => ({ id, title, description, useWhen })),
          existingTasks: input.tasks.map((existing) => ({
            id: existing.taskId,
            title: existing.title,
            type: existing.type,
            state: existing.run.position.state,
            blocked: existing.blocked !== undefined,
            readiness: taskReadiness(existing, input.tasks).kind,
          })),
        }
      : {}),
  };
}

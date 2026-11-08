import { ANY_TASK_TYPE } from '@nevo/specflow-contracts/documents';

import { resolveSpecificationExecution } from '../definitions/catalogue';
import { WorkflowError } from '../errors';
import { assertExecutorAllowed } from '../progression/executor';
import { applyStart, newRun, planStart } from '../progression/progression';
import { isTaskClosed, taskReadiness } from '../tasks/tasks';
import {
  activeAttempt,
  type ExecutorRecord,
  type SpecificationExecutionRecord,
  type WorkflowSubject,
} from '../state/model';
import type { ExecutionChange, ExecutionSnapshot } from '../state/store';
import {
  isoNow,
  loadSubject,
  type LoadedSubject,
  type WorkflowDependencies,
} from './loaded-execution';
import { compileStepContext, type StepContext } from './step-context';

export type StartResult =
  | {
      readonly kind: 'started' | 'resumed';
      readonly subject: WorkflowSubject;
      readonly context: StepContext;
    }
  | { readonly kind: 'terminal'; readonly subject: WorkflowSubject };

export interface StartOptions {
  /**
   * Who works on the attempt, from trusted Runtime/CLI context. Its kind must be the step's; the
   * Session of an agent attempt is the only one that can resume or finish it.
   */
  readonly executor: ExecutorRecord;
}

/**
 * Start (or resume) the next step of a subject. The single start path: a quick start from an
 * attention item, a manual start and an automatic continuation all end here. A started subject is
 * active, so no attention is derived for it any more.
 */
async function startSubject(
  dependencies: WorkflowDependencies,
  snapshot: ExecutionSnapshot,
  subject: WorkflowSubject,
  options: StartOptions,
  seed?: ExecutionChange['specification'],
): Promise<StartResult> {
  const loaded = loadSubject(dependencies.catalogue, snapshot, subject);
  const plan = planStart(loaded.run, loaded.definition);
  if (plan.kind === 'terminal') {
    return { kind: 'terminal', subject };
  }

  // The Engine enters and settles a wait step itself; nobody starts or resumes one.
  if (plan.step.kind === 'wait-for-tasks') {
    throw new WorkflowError('WORKFLOW_POSITION_INVALID', 'A wait step is entered by the Engine.');
  }

  // A resume continues the active attempt: only its own Session may resume an agent attempt.
  assertExecutorAllowed(plan.step, options.executor, activeAttempt(loaded.run));
  if (plan.kind === 'activate') {
    assertTaskReady(snapshot, loaded);
  }

  const at = isoNow(dependencies);
  const run = applyStart(loaded.run, plan, { at, executor: options.executor });
  if (run !== loaded.run || seed) {
    await dependencies.store.apply(subject.specId, changeFor(snapshot, loaded, run, seed));
  }

  return {
    kind: plan.kind === 'resume' ? 'resumed' : 'started',
    subject,
    context: compileStepContext({
      subject,
      run,
      step: plan.step,
      attempt: plan.attempt,
      catalogue: dependencies.catalogue,
      ...(loaded.task ? { task: loaded.task } : {}),
      allowedTaskTypes: snapshot.specification?.value.taskTypes ?? [ANY_TASK_TYPE],
      tasks: snapshot.tasks.map((entry) => entry.value),
    }),
  };
}

function changeFor(
  snapshot: ExecutionSnapshot,
  loaded: LoadedSubject,
  run: LoadedSubject['run'],
  seed: ExecutionChange['specification'] | undefined,
): ExecutionChange {
  if (loaded.subject.kind === 'task' && loaded.task) {
    return {
      tasks: [
        {
          taskId: loaded.task.taskId,
          expected: loaded.revision,
          next: { ...loaded.task, run },
        },
      ],
    };
  }

  const record = seed?.next ?? snapshot.specification?.value;
  if (!record) {
    throw new WorkflowError('WORKFLOW_SPECIFICATION_NOT_STARTED', 'No Specification run to start.');
  }

  return {
    specification: {
      expected: seed ? seed.expected : loaded.revision,
      next: { ...record, run },
    },
    tasks: [],
  };
}

function assertTaskReady(snapshot: ExecutionSnapshot, loaded: LoadedSubject): void {
  if (!loaded.task) {
    return;
  }

  const tasks = snapshot.tasks.map((entry) => entry.value);
  const readiness = taskReadiness(loaded.task, tasks);
  if (readiness.kind === 'status') {
    throw new WorkflowError(
      'WORKFLOW_TASK_BLOCKED',
      `The Task "${loaded.task.taskId}" is ${readiness.status}; only a ready Task can start.`,
    );
  }

  if (readiness.kind === 'dependencies') {
    // A dependency that ended without completing, was cancelled or is broken (no record).
    const abandoned = readiness.waitingFor.filter((id) => {
      const dependency = tasks.find((task) => task.taskId === id);

      return !dependency || isTaskClosed(dependency);
    });

    throw new WorkflowError(
      'WORKFLOW_DEPENDENCY_UNSATISFIED',
      abandoned.length > 0
        ? `The Task "${loaded.task.taskId}" depends on ${abandoned.join(', ')}, which can no longer complete.`
        : `The Task "${loaded.task.taskId}" waits for ${readiness.waitingFor.join(', ')}.`,
    );
  }
}

export interface StartSpecificationInput extends StartOptions {
  readonly specId: string;
  /** The archetype of the Specification (its manifest), whose execution binding is used. */
  readonly archetype: string;
}

/**
 * Entry point "start Specification execution": creates the Specification run from the archetype's
 * execution binding on first use (pinning the workflow), then starts its next step.
 */
export function startSpecificationExecution(
  dependencies: WorkflowDependencies,
  input: StartSpecificationInput,
): Promise<StartResult> {
  return dependencies.serialize(async () => {
    const snapshot = await dependencies.store.read(input.specId);
    const subject: WorkflowSubject = { kind: 'specification', specId: input.specId };
    if (snapshot.specification) {
      return startSubject(dependencies, snapshot, subject, input);
    }

    const record = newSpecificationRecord(dependencies, input);
    const seeded: ExecutionSnapshot = {
      ...snapshot,
      specification: { value: record, revision: '' },
    };

    return startSubject(dependencies, seeded, subject, input, { expected: null, next: record });
  });
}

function newSpecificationRecord(
  dependencies: WorkflowDependencies,
  input: StartSpecificationInput,
): SpecificationExecutionRecord {
  const resolved = resolveSpecificationExecution(dependencies.catalogue, input.archetype);
  if (resolved.kind === 'problem') {
    throw new WorkflowError('WORKFLOW_NOT_CONFIGURED', resolved.message);
  }

  return {
    specId: input.specId,
    archetype: input.archetype,
    taskTypes: resolved.taskTypes,
    taskIds: [],
    run: newRun(resolved.workflow),
  };
}

export interface StartTaskInput extends StartOptions {
  readonly specId: string;
  readonly taskId: string;
}

/** Entry point "start Task execution": starts the next step of the Task's own workflow. */
export function startTaskExecution(
  dependencies: WorkflowDependencies,
  input: StartTaskInput,
): Promise<StartResult> {
  return dependencies.serialize(async () => {
    const snapshot = await dependencies.store.read(input.specId);

    return startSubject(
      dependencies,
      snapshot,
      { kind: 'task', specId: input.specId, taskId: input.taskId },
      input,
    );
  });
}

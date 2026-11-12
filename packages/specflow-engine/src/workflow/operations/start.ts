import { ANY_TASK_TYPE } from '@nevo/specflow-contracts/documents';

import { decide, findStep, newRun } from '@nevo/workflow';
import { resolveSpecificationExecution } from '../definitions/catalogue';
import { WorkflowError } from '../errors';
import { isTaskClosed, taskReadiness } from '../tasks/tasks';
import type { SpecificationExecutionRecord, WorkflowActor, WorkflowSubject } from '../state/model';
import { assertSameSession } from './actors';
import type { ExecutionChange, ExecutionSnapshot } from '../state/store';
import {
  executionTasks,
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
   * Who works on the attempt, from trusted Runtime/CLI context (never a request payload). Its class
   * must be one the step allows; the Session of an agent attempt is the only one that resumes it.
   */
  readonly actor: WorkflowActor;
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
  if (loaded.run.position.state === 'terminal') {
    return { kind: 'terminal', subject };
  }

  // A resume continues the active attempt: only its own Session may resume an agent attempt. The
  // core refuses a wait step (the Engine enters and settles it) and an actor of the wrong class.
  assertSameSession(loaded.run, options.actor);
  const decision = decide(loaded.definition, loaded.run, {
    kind: 'start',
    at: isoNow(dependencies),
    actor: options.actor,
  });
  const intent = decision.intent;
  const step = findStep(loaded.definition, intent.kind === 'execute' ? intent.step : '');
  if (intent.kind !== 'execute' || step?.kind !== 'work') {
    throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'A start activated no work step.');
  }

  if (!intent.resumed) {
    assertTaskReady(dependencies, snapshot, loaded);
  }

  const run = decision.nextRun;
  if (run !== loaded.run || seed) {
    await dependencies.store.apply(subject.specId, changeFor(snapshot, loaded, run, seed));
  }

  return {
    kind: intent.resumed ? 'resumed' : 'started',
    subject,
    context: compileStepContext({
      subject,
      run,
      step,
      attempt: intent.attempt,
      catalogue: dependencies.catalogue,
      ...(loaded.task ? { task: loaded.task } : {}),
      allowedTaskTypes: snapshot.specification?.value.taskTypes ?? [ANY_TASK_TYPE],
      ...executionTasks(dependencies.catalogue, snapshot),
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
      runs: [
        {
          taskId: loaded.task.taskId,
          expected: loaded.revision,
          next: { specId: loaded.task.specId, taskId: loaded.task.taskId, run },
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
  };
}

function assertTaskReady(
  dependencies: WorkflowDependencies,
  snapshot: ExecutionSnapshot,
  loaded: LoadedSubject,
): void {
  if (!loaded.task) {
    return;
  }

  const { tasks } = executionTasks(dependencies.catalogue, snapshot);
  const readiness = taskReadiness(loaded.task, tasks);
  if (readiness.kind === 'status') {
    throw new WorkflowError(
      'WORKFLOW_TASK_BLOCKED',
      `The Task "${loaded.task.taskId}" is ${readiness.status}; only a ready Task can start.`,
    );
  }

  if (readiness.kind === 'dependencies') {
    // A dependency that ended without completing, was cancelled or is broken (`executionTasks`).
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
    run: newRun<WorkflowActor>(resolved.workflow),
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

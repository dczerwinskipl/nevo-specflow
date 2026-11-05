import { ANY_TASK_TYPE } from '@nevo/specflow-contracts/documents';

import { resolveSpecificationExecution } from '../definitions/catalogue';
import { WorkflowError } from '../errors';
import { applyStart, newRun, planStart } from '../progression/progression';
import { taskReadiness } from '../tasks/tasks';
import {
  isTerminal,
  subjectKey,
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
  /** Who works on the attempt, from trusted Runtime/CLI context. */
  readonly executor?: ExecutorRecord;
}

/**
 * Start (or resume) the next step of a subject. The single start path: a quick start from an
 * attention item, a manual start and an automatic continuation all end here, and every start removes
 * the subject's attention item.
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

  if (plan.kind === 'activate') {
    assertExecutorAllowed(plan.step, options.executor);
    assertTaskReady(snapshot, loaded);
  }

  const at = isoNow(dependencies);
  const run = applyStart(loaded.run, plan, {
    at,
    ...(options.executor ? { executor: options.executor } : {}),
  });
  const key = subjectKey(subject);
  const clearsAttention = snapshot.attention.some((item) => subjectKey(item.subject) === key);
  const change = changeFor(snapshot, loaded, run, seed, clearsAttention ? [key] : []);
  if (run !== loaded.run || seed || clearsAttention) {
    await dependencies.store.apply(subject.specId, change);
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
  clear: readonly string[],
): ExecutionChange {
  const attention = { set: [], clear };
  if (loaded.subject.kind === 'task' && loaded.task) {
    return {
      tasks: [
        {
          taskId: loaded.task.taskId,
          expected: loaded.revision,
          next: { ...loaded.task, run },
        },
      ],
      attention,
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
    attention,
  };
}

function assertExecutorAllowed(
  step: { readonly kind: string; readonly executor?: 'agent' | 'human' },
  executor: ExecutorRecord | undefined,
): void {
  if (step.executor === 'human' && executor?.kind === 'agent') {
    throw new WorkflowError('WORKFLOW_EXECUTOR_NOT_ALLOWED', 'An agent cannot do a human step.');
  }
}

function assertTaskReady(snapshot: ExecutionSnapshot, loaded: LoadedSubject): void {
  if (!loaded.task) {
    return;
  }

  const tasks = snapshot.tasks.map((entry) => entry.value);
  const readiness = taskReadiness(loaded.task, tasks);
  if (readiness.kind === 'blocked') {
    throw new WorkflowError(
      'WORKFLOW_TASK_BLOCKED',
      `The Task "${loaded.task.taskId}" is blocked until the Specification is ready again.`,
    );
  }

  if (readiness.kind === 'dependencies') {
    const abandoned = tasks
      .filter((task) => readiness.waitingFor.includes(task.taskId) && isTerminal(task.run))
      .map((task) => task.taskId);

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

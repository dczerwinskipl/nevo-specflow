import { ANY_TASK_TYPE } from '@nevo/specflow-contracts/documents';

import { decide, findStep, newRun } from '@nevo/workflow';
import { resolveSpecificationExecution } from '../definitions/catalogue';
import { WorkflowError } from '../errors';
import { entryGatesOf } from '../gates/evaluate';
import { assertGatesSatisfied } from '../gates/read';
import { resolveTaskType, taskReadiness, unsatisfiableDependencies } from '../tasks/tasks';
import type {
  AgentAttemptBinding,
  ExecutionTask,
  SpecificationExecutionRecord,
  TaskRunRecord,
  WorkflowActor,
  WorkflowSubject,
} from '../state/model';
import { assertSameSession } from './actors';
import type { ExecutionChange, ExecutionSnapshot } from '../state/store';
import {
  executionTasks,
  isoNow,
  loadSubject,
  loadTask,
  ofSubject,
  type LoadedSubject,
  type WorkflowDependencies,
} from './loaded-execution';
import { compileStepContext, type StepContext } from './step-context';
import { assertContextResolved, effectiveTaskTypesOf, unresolvedContext } from './task-policy';

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
  /**
   * The position the caller showed and asks to start (Ask agent): checked before anything is written,
   * so a stale request never starts or resumes another attempt (`WORKFLOW_ATTEMPT_MISMATCH`).
   */
  readonly expected?: ExpectedPosition;
  /** Recorded with the attempt the start activates; a resume keeps the active attempt's own. */
  readonly attemptData?: AgentAttemptBinding;
  /**
   * Called once every check of the start passed (expected position, actor, Task readiness, entry
   * gates) and before anything is written: Ask agent's baseline admission. A throw refuses the start.
   */
  readonly admit?: () => Promise<void>;
}

/**
 * The step a start works on and, for a resume, its active attempt. Without `attempt` the start must
 * activate a new attempt of `step`; with it, `step#attempt` must be the active attempt.
 */
export interface ExpectedPosition {
  readonly step: string;
  readonly attempt?: number;
}

function assertExpectedPosition(loaded: LoadedSubject, expected: ExpectedPosition): void {
  const position = loaded.run.position;
  const current =
    position.state === 'not-started'
      ? { step: loaded.definition.entryStep }
      : position.state === 'ready'
        ? { step: position.step }
        : position.state === 'active'
          ? { step: position.step, attempt: position.attempt }
          : undefined;
  if (current?.step !== expected.step || current.attempt !== expected.attempt) {
    const shown = `${expected.step}${expected.attempt !== undefined ? `#${String(expected.attempt)}` : ''}`;

    throw new WorkflowError(
      'WORKFLOW_ATTEMPT_MISMATCH',
      current === undefined
        ? `The run has ended; ${shown} cannot start.`
        : position.state === 'active' && expected.attempt === undefined
          ? `The step "${current.step}" has an active attempt already; continue it instead of starting ${shown}.`
          : `The run moved since it was shown: it is at ${current.step}${current.attempt !== undefined ? `#${String(current.attempt)}` : ''}, not ${shown}.`,
    );
  }
}

/**
 * Start (or resume) the next step of a subject. The single start path: a quick start from an
 * attention item, a manual start and an automatic continuation all end here. A started subject is
 * active, so no attention is derived for it any more. `created`: the subject's run record is new
 * (seeded into `snapshot`), so the change creates it.
 */
async function startSubject(
  dependencies: WorkflowDependencies,
  snapshot: ExecutionSnapshot,
  subject: WorkflowSubject,
  options: StartOptions,
  created = false,
  /** The caller checked the Task's readiness on this snapshot already (a first start). */
  readinessChecked = false,
): Promise<StartResult> {
  const loaded = loadSubject(dependencies.catalogue, snapshot, subject);
  if (options.expected) {
    assertExpectedPosition(loaded, options.expected);
  }

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
    ...(options.attemptData !== undefined ? { hostData: options.attemptData } : {}),
  });
  const intent = decision.intent;
  const step = findStep(loaded.definition, intent.kind === 'execute' ? intent.step : '');
  if (intent.kind !== 'execute' || step?.kind !== 'work') {
    throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'A start activated no work step.');
  }

  if (!intent.resumed && loaded.task) {
    if (!readinessChecked) {
      assertTaskReady(dependencies, snapshot, loaded.task);
    }

    // A required context entry that does not resolve blocks every start of a step (not a resume);
    // an awaited process artifact is listed apart from the stale references.
    assertContextResolved(
      loaded.task.taskId,
      (await unresolvedContext(dependencies, subject.specId, loaded.task)).filter(
        (issue) => issue.entry.required,
      ),
      'The next step cannot start until they exist, or are replaced or removed.',
    );
  }

  // The declared entry gates of the step, after the Task's own checks (a resume is not a start).
  if (!intent.resumed) {
    await assertGatesSatisfied(dependencies.references, subject, 'entry', step, entryGatesOf(step));
  }

  await options.admit?.();
  const run = decision.nextRun;
  if (run !== loaded.run || created) {
    await dependencies.store.apply(subject.specId, {
      ...changeFor(snapshot, loaded, run, created ? null : loaded.revision),
      summary: `${intent.resumed ? 'resume' : 'start'} step ${step.id}${ofSubject(subject)} (attempt ${intent.attempt})`,
    });
  }

  return {
    kind: intent.resumed ? 'resumed' : 'started',
    subject,
    context: compileStepContext({
      subject,
      run,
      definition: loaded.definition,
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
  expected: string | null,
): ExecutionChange {
  if (loaded.subject.kind === 'task' && loaded.task) {
    return {
      runs: [
        {
          taskId: loaded.task.taskId,
          expected,
          next: { specId: loaded.task.specId, taskId: loaded.task.taskId, run },
        },
      ],
    };
  }

  const record = snapshot.specification?.value;
  if (!record) {
    throw new WorkflowError('WORKFLOW_SPECIFICATION_NOT_STARTED', 'No Specification run to start.');
  }

  return { specification: { expected, next: { ...record, run } } };
}

function assertTaskReady(
  dependencies: WorkflowDependencies,
  snapshot: ExecutionSnapshot,
  task: ExecutionTask,
): void {
  const { tasks } = executionTasks(dependencies.catalogue, snapshot);
  const readiness = taskReadiness(task, tasks);
  if (readiness.kind === 'status') {
    throw new WorkflowError(
      'WORKFLOW_TASK_BLOCKED',
      `The Task "${task.taskId}" is ${readiness.status}; only a ready Task can start.`,
    );
  }

  if (readiness.kind === 'dependencies') {
    const abandoned = unsatisfiableDependencies(readiness.waitingFor, tasks);

    throw new WorkflowError(
      'WORKFLOW_DEPENDENCY_UNSATISFIED',
      abandoned.length > 0
        ? `The Task "${task.taskId}" depends on ${abandoned.join(', ')}, which can no longer complete.`
        : `The Task "${task.taskId}" waits for ${readiness.waitingFor.join(', ')}.`,
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
  return dependencies.serialize(() => startSpecificationInSection(dependencies, input));
}

/**
 * {@link startSpecificationExecution} for a caller that holds the `serialize` section already and
 * writes more in it (the start of an agent attempt records its journal there).
 */
export async function startSpecificationInSection(
  dependencies: WorkflowDependencies,
  input: StartSpecificationInput,
): Promise<StartResult> {
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

  return startSubject(dependencies, seeded, subject, input, true);
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
  /**
   * The workflow revision the caller showed for the start (the pin preview). When the workflow the
   * start would use is another revision, the start is refused with `WORKFLOW_DEFINITION_CHANGED`.
   */
  readonly expectedWorkflowRevision?: string;
}

/**
 * Entry point "start Task execution": starts the next step of the Task's own workflow. A Task needs
 * no Specification run. Its first start checks, before anything is written, that the Task is ready,
 * that its live task type exists and the effective policy allows it (`WORKFLOW_DEFINITION_MISSING`,
 * `WORKFLOW_TASK_TYPE_NOT_ALLOWED`), that its workflow exists, and that the live workflow is the
 * previewed revision; then it creates the Task's run record pinned to that workflow in the same
 * change as the step's start. Every start of a step needs the required context entries to resolve
 * (`WORKFLOW_TASK_CONTEXT_UNRESOLVED`).
 */
export function startTaskExecution(
  dependencies: WorkflowDependencies,
  input: StartTaskInput,
): Promise<StartResult> {
  return dependencies.serialize(() => startTaskInSection(dependencies, input));
}

/** {@link startTaskExecution} for a caller that holds the `serialize` section already. */
export async function startTaskInSection(
  dependencies: WorkflowDependencies,
  input: StartTaskInput,
): Promise<StartResult> {
  const snapshot = await dependencies.store.read(input.specId);
  const subject: WorkflowSubject = {
    kind: 'task',
    specId: input.specId,
    taskId: input.taskId,
  };
  const { task, run } = loadTask(dependencies.catalogue, snapshot, input.taskId);
  if (run) {
    assertExpectedRevision(input, run.value.run.workflow.revision);

    return startSubject(dependencies, snapshot, subject, input);
  }

  // Readiness first, so a draft is refused as blocked; `startSubject` does not check it again.
  assertTaskReady(dependencies, snapshot, task);
  const { workflow } = resolveTaskType({
    type: task.type,
    allowed: await effectiveTaskTypesOf(dependencies, snapshot),
    taskType: (id) => dependencies.catalogue.taskType(id),
    workflow: (id) => dependencies.catalogue.workflow(id),
  });
  const record: TaskRunRecord = {
    specId: input.specId,
    taskId: input.taskId,
    run: newRun<WorkflowActor>(workflow),
  };
  assertExpectedRevision(input, record.run.workflow.revision);
  const seeded: ExecutionSnapshot = {
    ...snapshot,
    runs: [...snapshot.runs, { value: record, revision: '' }],
  };

  return startSubject(dependencies, seeded, subject, input, true, true);
}

function assertExpectedRevision(input: StartTaskInput, revision: string): void {
  if (input.expectedWorkflowRevision !== undefined && input.expectedWorkflowRevision !== revision) {
    throw new WorkflowError(
      'WORKFLOW_DEFINITION_CHANGED',
      `The workflow of the Task "${input.taskId}" changed since it was shown; review it and start again.`,
    );
  }
}

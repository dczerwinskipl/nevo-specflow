import {
  assertPinned,
  assertPositionJustified,
  isPinnedTo,
  isPositionJustified,
} from '@nevo/workflow';
import type { ExecutionCatalogue } from '../definitions/catalogue';
import type { WorkflowDefinition } from '../definitions/model';
import { WorkflowError } from '../errors';
import {
  brokenTask,
  subjectKey,
  type TaskRecord,
  type WorkflowRun,
  type WorkflowSubject,
} from '../state/model';
import type { ExecutionSnapshot, Versioned, WorkflowStore } from '../state/store';

/**
 * Dependencies of the workflow operations. Every mutation runs inside `serialize` (the project control
 * lock in production) and reads, plans and applies one change there, so the plan is never computed
 * against state another writer is changing.
 */
export interface WorkflowDependencies {
  readonly store: WorkflowStore;
  readonly catalogue: ExecutionCatalogue;
  readonly now: () => Date;
  readonly serialize: <T>(operation: () => Promise<T>) => Promise<T>;
}

/** One subject of a snapshot with the definition its run is pinned to. */
export interface LoadedSubject {
  readonly subject: WorkflowSubject;
  readonly run: WorkflowRun;
  readonly revision: string;
  readonly definition: WorkflowDefinition;
  readonly task?: TaskRecord;
}

/**
 * The definition the run is pinned to. The run's position is checked against its history with it
 * (`assertPositionJustified`), so no operation or inspection interprets an unjustified position.
 */
export function pinnedDefinition(
  catalogue: ExecutionCatalogue,
  run: WorkflowRun,
): WorkflowDefinition {
  const definition = catalogue.workflow(run.workflow.id);
  if (!definition) {
    throw new WorkflowError(
      'WORKFLOW_DEFINITION_CHANGED',
      `The workflow "${run.workflow.id}" the run is pinned to is not defined any more.`,
    );
  }

  assertPinned(run.workflow, definition);
  assertPositionJustified(run, definition);

  return definition;
}

/** The definition the run is pinned to, or `undefined` when it is missing or changed. */
function unchangedDefinition(
  catalogue: ExecutionCatalogue,
  run: WorkflowRun,
): WorkflowDefinition | undefined {
  const definition = catalogue.workflow(run.workflow.id);

  return definition && isPinnedTo(run.workflow, definition) ? definition : undefined;
}

/**
 * The pinned definition, or `undefined` when it is missing or changed. Throws only when the run's
 * position does not follow from its history (`WORKFLOW_STATE_CORRUPT`).
 */
export function pinnedDefinitionIfUnchanged(
  catalogue: ExecutionCatalogue,
  run: WorkflowRun,
): WorkflowDefinition | undefined {
  const definition = unchangedDefinition(catalogue, run);
  if (definition) {
    assertPositionJustified(run, definition);
  }

  return definition;
}

/** The Tasks of a snapshot: the usable ones and the broken ones. */
export interface ExecutionTasks {
  /** The Task records that are not broken, in Task id order. */
  readonly tasks: readonly TaskRecord[];
  /** The broken Tasks, in list order. */
  readonly broken: readonly string[];
}

/**
 * Split the listed Tasks. A Task is broken when its record is missing or its stored position does
 * not follow from its history under its pinned definition (`isPositionJustified`); a Task whose
 * pinned workflow is missing or changed is not broken (its next operation fails with
 * `WORKFLOW_DEFINITION_CHANGED`). A broken Task is left out of `tasks`, so every decision treats it
 * alike: it never starts, finishes or changes status, is never closed, keeps the Specification's
 * wait open and blocks its dependents.
 */
export function executionTasks(
  catalogue: ExecutionCatalogue,
  snapshot: ExecutionSnapshot,
): ExecutionTasks {
  const records = new Map(
    snapshot.tasks.map((entry) => [entry.value.taskId, entry.value] as const),
  );
  const justified = (task: TaskRecord) => {
    const definition = unchangedDefinition(catalogue, task.run);

    return !definition || isPositionJustified(task.run, definition);
  };

  const broken = (snapshot.specification?.value.taskIds ?? []).filter((taskId) => {
    const task = records.get(taskId);

    return !task || !justified(task);
  });

  return {
    tasks: [...records.values()].filter((task) => !broken.includes(task.taskId)),
    broken,
  };
}

export function findTask(
  snapshot: ExecutionSnapshot,
  taskId: string,
): Versioned<TaskRecord> | undefined {
  return snapshot.tasks.find((entry) => entry.value.taskId === taskId);
}

export function loadSubject(
  catalogue: ExecutionCatalogue,
  snapshot: ExecutionSnapshot,
  subject: WorkflowSubject,
): LoadedSubject {
  const specification = snapshot.specification;
  if (!specification) {
    throw new WorkflowError(
      'WORKFLOW_SPECIFICATION_NOT_STARTED',
      `The Specification "${subject.specId}" has no execution yet.`,
    );
  }

  if (subject.kind === 'specification') {
    return {
      subject,
      run: specification.value.run,
      revision: specification.revision,
      definition: pinnedDefinition(catalogue, specification.value.run),
    };
  }

  if (executionTasks(catalogue, snapshot).broken.includes(subject.taskId)) {
    brokenTask(subject.taskId);
  }

  const task = findTask(snapshot, subject.taskId);

  if (!task) {
    throw new WorkflowError('WORKFLOW_SUBJECT_NOT_FOUND', `Unknown ${subjectKey(subject)}.`);
  }

  return {
    subject,
    run: task.value.run,
    revision: task.revision,
    definition: pinnedDefinition(catalogue, task.value.run),
    task: task.value,
  };
}

export function isoNow(dependencies: WorkflowDependencies): string {
  return dependencies.now().toISOString();
}

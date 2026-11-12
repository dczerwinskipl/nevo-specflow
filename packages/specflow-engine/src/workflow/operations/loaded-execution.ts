import { assertPinned, assertPositionJustified, isPinnedTo, isPositionJustified } from '../core';
import type { ExecutionCatalogue } from '../definitions/catalogue';
import type { WorkflowDefinition } from '../definitions/model';
import { WorkflowError } from '../errors';
import {
  brokenTask,
  executionTaskOf,
  subjectKey,
  type ExecutionTask,
  type WorkflowRun,
  type WorkflowSubject,
} from '../state/model';
import type { TaskManifest } from '../../tasks/resource/model';
import type { TaskRunRecord } from '../state/model';
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
  readonly task?: ExecutionTask;
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
  /** The registered Tasks with their run that are not broken, in Task id order. */
  readonly tasks: readonly ExecutionTask[];
  /** The broken Tasks, in id order. */
  readonly broken: readonly string[];
}

/**
 * Join the Task manifests with their run records. A Task is broken when the store reports it so (a
 * run record whose Task is not registered, a run that contradicts the Task's status), when its
 * stored position does not follow from its history under its pinned definition
 * (`isPositionJustified`), or when a registered Task has no run record yet.
 *
 * TODO(T4): a registered Task without a run record is not broken but not started: its first start
 * validates the live Task Type and Workflow and creates the record. Until then every Task gets its
 * record when it is created, so only a Task added by hand has none.
 *
 * A Task whose pinned workflow is missing or changed is not broken (its next operation fails with
 * `WORKFLOW_DEFINITION_CHANGED`). A dangling index entry (no manifest) without a run is no Task at
 * all: it never starts, and its dependents wait for it. A broken Task is left out of `tasks`, so
 * every decision treats it alike: it never starts, finishes or changes status, is never closed, keeps
 * the Specification's wait open and blocks its dependents.
 */
export function executionTasks(
  catalogue: ExecutionCatalogue,
  snapshot: ExecutionSnapshot,
): ExecutionTasks {
  const runs = new Map(snapshot.runs.map((entry) => [entry.value.taskId, entry.value] as const));
  const reported = new Set(
    snapshot.issues.filter((issue) => issue.kind === 'broken').map((issue) => issue.taskId),
  );
  const justified = (run: WorkflowRun) => {
    const definition = unchangedDefinition(catalogue, run);

    return !definition || isPositionJustified(run, definition);
  };

  const tasks: ExecutionTask[] = [];
  const broken = new Set(reported);
  for (const { value: manifest } of snapshot.manifests) {
    const record = runs.get(manifest.id);
    if (!record || reported.has(manifest.id) || !justified(record.run)) {
      broken.add(manifest.id);
    } else {
      tasks.push(executionTaskOf(record.specId, manifest, record.run));
    }
  }

  return {
    tasks: tasks.sort((left, right) => (left.taskId < right.taskId ? -1 : 1)),
    broken: [...broken].sort(),
  };
}

/** The stored parts of a Task: its manifest and its run record, each with its revision. */
export function findTask(
  snapshot: ExecutionSnapshot,
  taskId: string,
): { readonly manifest?: Versioned<TaskManifest>; readonly run?: Versioned<TaskRunRecord> } {
  const manifest = snapshot.manifests.find((entry) => entry.value.id === taskId);
  const run = snapshot.runs.find((entry) => entry.value.taskId === taskId);

  return { ...(manifest ? { manifest } : {}), ...(run ? { run } : {}) };
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

  const { manifest, run } = findTask(snapshot, subject.taskId);
  if (!manifest || !run) {
    throw new WorkflowError('WORKFLOW_SUBJECT_NOT_FOUND', `Unknown ${subjectKey(subject)}.`);
  }

  return {
    subject,
    run: run.value.run,
    revision: run.revision,
    definition: pinnedDefinition(catalogue, run.value.run),
    task: executionTaskOf(subject.specId, manifest.value, run.value.run),
  };
}

export function isoNow(dependencies: WorkflowDependencies): string {
  return dependencies.now().toISOString();
}

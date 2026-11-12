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
  executionTaskOf,
  subjectKey,
  type ExecutionTask,
  type WorkflowRun,
  type WorkflowSubject,
} from '../state/model';
import type { TaskManifest } from '../../tasks/resource/model';
import type { TaskRunRecord } from '../state/model';
import type { ExecutionSnapshot, Versioned, WorkflowStore } from '../state/store';
import type { TaskReferences } from './task-references';

/**
 * Dependencies of the workflow operations. Every mutation runs inside `serialize` (the project control
 * lock in production) and reads, plans and applies one change there, so the plan is never computed
 * against state another writer is changing.
 */
export interface WorkflowDependencies {
  readonly store: WorkflowStore;
  readonly catalogue: ExecutionCatalogue;
  /** Lookups outside the execution store: the archetype's live policy, context references. */
  readonly references: TaskReferences;
  /** What holds the Specification outside its execution records (`readSpecificationExitState`). */
  readonly holds: ExecutionHolds;
  readonly now: () => Date;
  readonly serialize: <T>(operation: () => Promise<T>) => Promise<T>;
}

/**
 * Unfinished writes that hold a Specification, read without a lock (the caller holds the project
 * control lock or accepts a snapshot). The Task document changes are `TaskReferences.pendingDocumentChange`.
 */
export interface ExecutionHolds {
  /** A change of the Specification execution store did not finish publishing (its local journal). */
  pendingExecutionChange(specId: string): Promise<boolean>;
  /**
   * Another durable operation holds the Specification: a Create, Close, document change or manual
   * commit that claims it, or an unsettled external execution of the project.
   */
  operationInProgress(specId: string): Promise<boolean>;
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
 * Join the Task manifests with their run records. A registered Task without a run record has not
 * started (its first start creates the record). A Task is broken when the store reports it so (an
 * index entry without its folder or manifest, a run record whose Task is not registered, a run that
 * contradicts the Task's status), or when its
 * stored position does not follow from its history under its pinned definition
 * (`isPositionJustified`).
 *
 * A Task whose pinned workflow is missing or changed is not broken (its next operation fails with
 * `WORKFLOW_DEFINITION_CHANGED`). A broken Task is left out of `tasks`, so
 * every decision treats it alike: it never starts, finishes or changes status, is never closed, keeps
 * the Specification's wait open and blocks its dependents.
 */
export function executionTasks(
  catalogue: ExecutionCatalogue,
  snapshot: ExecutionSnapshot,
): ExecutionTasks {
  const runs = new Map(snapshot.runs.map((entry) => [entry.value.taskId, entry.value] as const));
  const reported = new Set(
    snapshot.issues
      .filter((issue) => issue.kind === 'broken' || issue.kind === 'dangling')
      .map((issue) => issue.taskId),
  );
  const justified = (run: WorkflowRun) => {
    const definition = unchangedDefinition(catalogue, run);

    return !definition || isPositionJustified(run, definition);
  };

  const tasks: ExecutionTask[] = [];
  const broken = new Set(reported);
  for (const { value: manifest } of snapshot.manifests) {
    const record = runs.get(manifest.id);
    if (reported.has(manifest.id) || (record && !justified(record.run))) {
      broken.add(manifest.id);
    } else {
      tasks.push(executionTaskOf(snapshot.specId, manifest, record?.run));
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

/** A registered Task that is not broken, with its run record when it has started. */
export interface LoadedTask {
  readonly task: ExecutionTask;
  readonly manifest: Versioned<TaskManifest>;
  readonly run?: Versioned<TaskRunRecord>;
}

/**
 * A Task of the snapshot; needs no Specification run. Refused when it is broken
 * (`WORKFLOW_STATE_CORRUPT`) or not registered with a manifest (`WORKFLOW_SUBJECT_NOT_FOUND`).
 */
export function loadTask(
  catalogue: ExecutionCatalogue,
  snapshot: ExecutionSnapshot,
  taskId: string,
): LoadedTask {
  if (executionTasks(catalogue, snapshot).broken.includes(taskId)) {
    brokenTask(taskId);
  }

  const { manifest, run } = findTask(snapshot, taskId);
  if (!manifest) {
    throw new WorkflowError(
      'WORKFLOW_SUBJECT_NOT_FOUND',
      `Unknown ${subjectKey({ kind: 'task', specId: snapshot.specId, taskId })}.`,
    );
  }

  return {
    task: executionTaskOf(snapshot.specId, manifest.value, run?.value.run),
    manifest,
    ...(run ? { run } : {}),
  };
}

/**
 * A subject that has a run: the Specification once it started, a Task once it started (a Task needs
 * no Specification run). A Task that has not started has nothing to finish or return
 * (`WORKFLOW_POSITION_INVALID`); its first start is `startTaskExecution`.
 */
export function loadSubject(
  catalogue: ExecutionCatalogue,
  snapshot: ExecutionSnapshot,
  subject: WorkflowSubject,
): LoadedSubject {
  if (subject.kind === 'specification') {
    const specification = snapshot.specification;
    if (!specification) {
      throw new WorkflowError(
        'WORKFLOW_SPECIFICATION_NOT_STARTED',
        `The Specification "${subject.specId}" has no execution yet.`,
      );
    }

    return {
      subject,
      run: specification.value.run,
      revision: specification.revision,
      definition: pinnedDefinition(catalogue, specification.value.run),
    };
  }

  const { task, run } = loadTask(catalogue, snapshot, subject.taskId);
  if (!run) {
    throw new WorkflowError(
      'WORKFLOW_POSITION_INVALID',
      `The Task "${subject.taskId}" has not started.`,
    );
  }

  return {
    subject,
    run: run.value.run,
    revision: run.revision,
    definition: pinnedDefinition(catalogue, run.value.run),
    task,
  };
}

export function isoNow(dependencies: WorkflowDependencies): string {
  return dependencies.now().toISOString();
}

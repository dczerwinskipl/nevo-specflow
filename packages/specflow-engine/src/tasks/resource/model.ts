import type {
  TaskContextEntry,
  TaskDocumentEntry,
  TaskOrigin,
  TaskStatus,
  TaskStatusChange,
} from '@nevo/specflow-contracts/documents';

export {
  TASK_CONTEXT_KINDS,
  TASK_MAIN_DOCUMENT,
  TASK_STATUSES,
  type TaskContextEntry,
  type TaskContextKind,
  type TaskDocumentEntry,
  type TaskOrigin,
  type TaskStatus,
  type TaskStatusChange,
} from '@nevo/specflow-contracts/documents';

/**
 * A Task as a resource of its Specification (draft F20): a folder `tasks/<id>/` with the manifest
 * `task.yaml`, the main document `task.md` and optional extra documents, listed in `tasks/index.yaml`.
 * The file formats are `@nevo/specflow-contracts/documents` (`task-resource-files.ts`); these are the
 * values the Engine works with (the files without their `$schema` and `schemaVersion`).
 *
 * The preparation status lives here, never the workflow position: the run of a Task is its own record
 * (`.execution/tasks/<id>.yaml`, `workflow/state`).
 */

/** `tasks/index.yaml`: the only authority for which Tasks exist and in which order. */
export interface TaskIndex {
  readonly tasks: readonly { readonly id: string }[];
}

/** `tasks/<id>/task.yaml`. */
export interface TaskManifest {
  /** Equals the folder name. */
  readonly id: string;
  readonly title: string;
  readonly summary?: string;
  /** Immutable after creation. */
  readonly type: string;
  readonly status: TaskStatus;
  readonly statusChange?: TaskStatusChange;
  readonly dependsOn: readonly string[];
  readonly origin: TaskOrigin;
  /** The registry; the `task` document (`task.md`) is required and cannot be removed. */
  readonly documents: readonly TaskDocumentEntry[];
  /** Absent: the default context. An explicit list replaces it. */
  readonly context?: readonly TaskContextEntry[];
}

/** The name of the Task folder below the Specification directory; reserved for Tasks. */
export const TASKS_FOLDER = 'tasks';
export const TASK_INDEX_FILE = 'index.yaml';
export const TASK_MANIFEST_FILE = 'task.yaml';

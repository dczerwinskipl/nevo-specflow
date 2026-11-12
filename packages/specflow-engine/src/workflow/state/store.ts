import type { TaskIndex, TaskManifest } from '../../tasks/resource/model';
import type { TaskResourceIssue } from '../../tasks/resource/validate';
import type { SpecificationExecutionRecord, TaskRunRecord } from './model';

/**
 * Persistence port of the "Specification execution store", one Specification at a time: the
 * Specification run, the Task resources (`tasks/index.yaml`, `tasks/<id>/task.yaml`, the initial
 * `tasks/<id>/task.md`) and the Task run records, Git-tracked next to the Specification. Attention is
 * not stored; it is derived (`inspectExecution`). A store applies one change as a unit: a later read
 * sees all of it or none of it, also after a crash in the middle.
 */

export interface Versioned<T> {
  readonly value: T;
  /** Opaque content revision; a change states the revision it was planned against. */
  readonly revision: string;
}

export interface ExecutionSnapshot {
  /** The Specification the snapshot is of. */
  readonly specId: string;
  readonly specification?: Versioned<SpecificationExecutionRecord>;
  /** `tasks/index.yaml`; absent when the Specification has no index (no Task yet). */
  readonly index?: Versioned<TaskIndex>;
  /** The manifests of the registered Tasks that have one, in index order. */
  readonly manifests: readonly Versioned<TaskManifest>[];
  /** The Task run records that exist, in Task id order. */
  readonly runs: readonly Versioned<TaskRunRecord>[];
  /** The Task folders below `tasks/`, in name order (registered or not). */
  readonly folders: readonly string[];
  /** The consistency issues of the Task resources (`validateTaskResources`), never a failed read. */
  readonly issues: readonly TaskResourceIssue[];
}

export interface RecordWrite<T> {
  /** `null`: the record must not exist yet. */
  readonly expected: string | null;
  readonly next: T;
}

/**
 * A file of a Task folder other than its manifest: created (`text`; it must not exist yet, else the
 * change is refused with `WORKFLOW_STATE_CORRUPT`, since the snapshot does not show the file) or
 * removed (`null`; the store records the revision it removes). Only the initial `task.md` is created
 * here; later edits of Task documents belong to the Task's documents.
 */
export interface TaskDocumentWrite {
  readonly taskId: string;
  /** A registered document path of the Task, relative to its folder. */
  readonly path: string;
  readonly text: string | null;
}

export interface ExecutionChange {
  readonly specification?: RecordWrite<SpecificationExecutionRecord>;
  readonly index?: RecordWrite<TaskIndex>;
  /** `next: null` removes the manifest; the Task folder goes with it once it is empty. */
  readonly manifests?: readonly (RecordWrite<TaskManifest | null> & { readonly taskId: string })[];
  readonly runs?: readonly (RecordWrite<TaskRunRecord> & { readonly taskId: string })[];
  readonly documents?: readonly TaskDocumentWrite[];
  /**
   * What the change does, in words (`create task api`, `finish step review (attempt 1)`): the
   * subject of its commit (`ExecutionStateCommits`). Not stored in the records.
   */
  readonly summary?: string;
}

/** The content of a file: its sha256 and size, or `null` when it does not exist. */
export type ExecutionFileState = { readonly sha256: string; readonly bytes: number } | null;

/** One file a change published, relative to the Specification directory (`tasks/api/task.yaml`). */
export interface ExecutionFileWrite {
  readonly path: string;
  readonly pre: ExecutionFileState;
  readonly post: ExecutionFileState;
}

/**
 * The commit policy of the store's writes (owner decision 2026-11-12: workflow state is committed like
 * the Specification's documents; production: `specs/documents/write/execution-state.ts`). Called under
 * the project control lock: `admit` with the paths before anything is written (it may refuse, and
 * then nothing is written), `record` once the files are published and BEFORE the store's journal is
 * removed. `operationId` is fixed in the store's journal before any file is written, and `record` is
 * idempotent by it: a change finished after a crash (before or after its record) is recorded once.
 */
export interface ExecutionStateCommits {
  admit(
    specId: string,
    paths: readonly string[],
    operationId: string,
  ): Promise<AdmittedExecutionStateChange>;
}

export interface AdmittedExecutionStateChange {
  record(summary: string, writes: readonly ExecutionFileWrite[]): Promise<void>;
}

/** No commits: a store outside a Project (tests, tools). */
export const NO_EXECUTION_STATE_COMMITS: ExecutionStateCommits = {
  admit: () => Promise.resolve({ record: () => Promise.resolve() }),
};

export interface WorkflowStore {
  read(specId: string): Promise<ExecutionSnapshot>;
  /**
   * Apply all writes or none. Throws `WORKFLOW_STATE_CONFLICT` when a record's revision is not the
   * expected one, or a created document exists already; callers serialize mutations (the project
   * control lock), so a conflict means the state changed outside the Engine. A change with an invalid
   * record, or one that would add a Task resource issue, is refused with `WORKFLOW_STATE_CORRUPT`
   * before anything is written. An empty change only finishes a pending change.
   */
  apply(specId: string, change: ExecutionChange): Promise<void>;
  /**
   * The files of one Task folder (its manifest included), as POSIX paths relative to the folder in
   * name order, with a pending change laid over; stage files of an interrupted write are left out.
   * Lists at most `TASK_FOLDER_FILES_LISTED` entries. A removal checks with it that the folder holds
   * nothing the Task does not register, so removing the Task removes the folder.
   */
  taskFiles(specId: string, taskId: string): Promise<readonly string[]>;
  /**
   * Whether `tasks/` holds a folder whose name is the Task id ignoring case (a hand-made `API` is the
   * folder of `api` on a case-insensitive filesystem), also one the snapshot does not list.
   */
  taskFolderExists(specId: string, taskId: string): Promise<boolean>;
}

/** Enough to name what is in a Task folder besides its registered documents. */
export const TASK_FOLDER_FILES_LISTED = 200;

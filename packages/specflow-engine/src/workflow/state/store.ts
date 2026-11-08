import type { SpecificationExecutionRecord, TaskRecord } from './model';

/**
 * Persistence port of execution state, one Specification at a time: the canonical records (the
 * Specification run and its Tasks), Git-tracked next to the Specification. Attention is not stored;
 * it is derived from these records (`inspectExecution`). A store applies one change as a unit: a
 * later read sees all of it or none of it, also after a crash in the middle.
 */

export interface Versioned<T> {
  readonly value: T;
  /** Opaque content revision; a change states the revision it was planned against. */
  readonly revision: string;
}

export interface ExecutionSnapshot {
  readonly specification?: Versioned<SpecificationExecutionRecord>;
  /** The Task records that exist, in Task id order (a listed Task without a record is broken). */
  readonly tasks: readonly Versioned<TaskRecord>[];
}

export interface RecordWrite<T> {
  /** `null`: the record must not exist yet. */
  readonly expected: string | null;
  readonly next: T;
}

export interface ExecutionChange {
  readonly specification?: RecordWrite<SpecificationExecutionRecord>;
  readonly tasks: readonly (RecordWrite<TaskRecord> & { readonly taskId: string })[];
}

export interface WorkflowStore {
  read(specId: string): Promise<ExecutionSnapshot>;
  /**
   * Apply all writes or none. Throws `WORKFLOW_STATE_CONFLICT` when a record's revision is not the
   * expected one; callers serialize mutations (the project control lock), so a conflict means the
   * state changed outside the Engine.
   */
  apply(specId: string, change: ExecutionChange): Promise<void>;
}

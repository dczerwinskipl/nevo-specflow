import type { AttentionItem } from '../attention/model';
import type { SpecificationExecutionRecord, TaskRecord } from './model';

/**
 * Persistence port of execution state, one Specification at a time. The canonical records (the
 * Specification run and its Tasks) are Git-tracked next to the Specification; attention items and
 * operation journals are local. A store applies one change as a unit: a later read sees all of it or
 * none of it, also after a crash in the middle.
 */

export interface Versioned<T> {
  readonly value: T;
  /** Opaque content revision; a change states the revision it was planned against. */
  readonly revision: string;
}

export interface ExecutionSnapshot {
  readonly specification?: Versioned<SpecificationExecutionRecord>;
  /** In Task id order. */
  readonly tasks: readonly Versioned<TaskRecord>[];
  readonly attention: readonly AttentionItem[];
}

export interface RecordWrite<T> {
  /** `null`: the record must not exist yet. */
  readonly expected: string | null;
  readonly next: T;
}

export interface ExecutionChange {
  readonly specification?: RecordWrite<SpecificationExecutionRecord>;
  readonly tasks: readonly (RecordWrite<TaskRecord> & { readonly taskId: string })[];
  /** Attention items to set (replacing the subject's item) and subject keys to clear. */
  readonly attention: {
    readonly set: readonly AttentionItem[];
    readonly clear: readonly string[];
  };
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

export function isEmptyChange(change: ExecutionChange): boolean {
  return (
    change.specification === undefined &&
    change.tasks.length === 0 &&
    change.attention.set.length === 0 &&
    change.attention.clear.length === 0
  );
}

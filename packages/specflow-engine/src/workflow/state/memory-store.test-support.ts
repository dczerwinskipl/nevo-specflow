import { isDeepStrictEqual } from 'node:util';

import { sha256Hex } from '../../hash';
import { canonicalJson } from '../../specs/definitions/resolved-catalogue';
import type { AttentionItem } from '../attention/model';
import { WorkflowError } from '../errors';
import { serializeAttention, serializeSpecificationRecord, serializeTaskRecord } from './codec';
import { subjectKey, type SpecificationExecutionRecord, type TaskRecord } from './model';
import type { ExecutionChange, ExecutionSnapshot, Versioned, WorkflowStore } from './store';

interface SpecState {
  specification?: Versioned<SpecificationExecutionRecord>;
  tasks: Map<string, Versioned<TaskRecord>>;
  attention: Map<string, AttentionItem>;
}

const versioned = <T>(value: T): Versioned<T> => ({
  value: structuredClone(value),
  revision: sha256Hex(canonicalJson(value)),
});

/**
 * An in-memory {@link WorkflowStore} with the same revision checks and the same codec validation
 * before any write as the filesystem store.
 */
export function createMemoryWorkflowStore(): WorkflowStore & {
  readonly applied: ExecutionChange[];
} {
  const specs = new Map<string, SpecState>();
  const applied: ExecutionChange[] = [];
  const stateOf = (specId: string): SpecState => {
    const existing = specs.get(specId);
    if (existing) {
      return existing;
    }

    const created: SpecState = { tasks: new Map(), attention: new Map() };
    specs.set(specId, created);

    return created;
  };

  const check = (current: Versioned<unknown> | undefined, expected: string | null) => {
    if ((current?.revision ?? null) !== expected) {
      throw new WorkflowError('WORKFLOW_STATE_CONFLICT', 'The record changed meanwhile.');
    }
  };

  return {
    applied,
    read(specId): Promise<ExecutionSnapshot> {
      const state = stateOf(specId);

      return Promise.resolve(
        structuredClone({
          ...(state.specification ? { specification: state.specification } : {}),
          tasks: [...state.tasks.values()].sort((left, right) =>
            left.value.taskId < right.value.taskId ? -1 : 1,
          ),
          attention: [...state.attention.values()],
        }),
      );
    },
    apply(specId, change): Promise<void> {
      const state = stateOf(specId);
      if (change.specification) {
        check(state.specification, change.specification.expected);
      }

      for (const write of change.tasks) {
        check(state.tasks.get(write.taskId), write.expected);
      }

      if (change.specification) {
        serializeSpecificationRecord(change.specification.next);
      }

      for (const write of change.tasks) {
        serializeTaskRecord(write.next);
      }

      const replaced = new Set([
        ...change.attention.clear,
        ...change.attention.set.map((item) => subjectKey(item.subject)),
      ]);
      serializeAttention([
        ...[...state.attention.values()].filter((item) => !replaced.has(subjectKey(item.subject))),
        ...change.attention.set,
      ]);

      if (change.specification) {
        state.specification = versioned(change.specification.next);
      }

      for (const write of change.tasks) {
        state.tasks.set(write.taskId, versioned(write.next));
      }

      for (const key of change.attention.clear) {
        state.attention.delete(key);
      }

      for (const item of change.attention.set) {
        state.attention.set(subjectKey(item.subject), structuredClone(item));
      }

      if (!isDeepStrictEqual(change, { tasks: [], attention: { set: [], clear: [] } })) {
        applied.push(structuredClone(change));
      }

      return Promise.resolve();
    },
  };
}

import { isDeepStrictEqual } from 'node:util';

import { sha256Hex } from '../../hash';
import { canonicalJson } from '../../specs/definitions/resolved-catalogue';
import { WorkflowError } from '../errors';
import { serializeSpecificationRecord, serializeTaskRecord } from './codec';
import type { SpecificationExecutionRecord, TaskRecord } from './model';
import type { ExecutionChange, ExecutionSnapshot, Versioned, WorkflowStore } from './store';
import { stateOfSnapshot, validateExecutionSnapshot } from './validate';

interface SpecState {
  specification?: Versioned<SpecificationExecutionRecord>;
  tasks: Map<string, Versioned<TaskRecord>>;
}

const versioned = <T>(value: T): Versioned<T> => ({
  value: structuredClone(value),
  revision: sha256Hex(canonicalJson(value)),
});

/** Run `operation` so that a failure rejects, as the filesystem store's do. */
const settled = <T>(operation: () => T): Promise<T> => Promise.resolve().then(operation);

/**
 * An in-memory {@link WorkflowStore} with the same revision, identity, coherence
 * ({@link validateExecutionSnapshot}) and codec checks before any write as the filesystem store; the
 * shared contract is `./store-contract.test-support.ts`.
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

    const created: SpecState = { tasks: new Map() };
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
    read: (specId) =>
      settled(() => {
        const state = stateOf(specId);
        const snapshot: ExecutionSnapshot = structuredClone({
          ...(state.specification ? { specification: state.specification } : {}),
          tasks: [...state.tasks.values()].sort((left, right) =>
            left.value.taskId < right.value.taskId ? -1 : 1,
          ),
        });
        validateExecutionSnapshot(specId, stateOfSnapshot(snapshot));

        return snapshot;
      }),
    apply: (specId, change) =>
      settled(() => {
        const state = stateOf(specId);
        if (change.specification) {
          check(state.specification, change.specification.expected);
        }

        for (const write of change.tasks) {
          check(state.tasks.get(write.taskId), write.expected);
          if (write.next.taskId !== write.taskId) {
            throw new WorkflowError('WORKFLOW_STATE_CORRUPT', 'A Task write names another Task.');
          }
        }

        const tasks = new Map([...state.tasks].map(([taskId, entry]) => [taskId, entry.value]));
        for (const write of change.tasks) {
          tasks.set(write.taskId, write.next);
        }

        const specification = change.specification?.next ?? state.specification?.value;
        validateExecutionSnapshot(specId, {
          ...(specification ? { specification } : {}),
          tasks: [...tasks.values()],
        });
        if (change.specification) {
          serializeSpecificationRecord(change.specification.next);
        }

        for (const write of change.tasks) {
          serializeTaskRecord(write.next);
        }

        if (change.specification) {
          state.specification = versioned(change.specification.next);
        }

        for (const write of change.tasks) {
          state.tasks.set(write.taskId, versioned(write.next));
        }

        if (!isDeepStrictEqual(change, { tasks: [] })) {
          applied.push(structuredClone(change));
        }
      }),
  };
}

import { isDeepStrictEqual } from 'node:util';

import { sha256Hex } from '../../hash';
import { foldPathKey } from '../../specs/document-rules/document-paths';
import { canonicalJson } from '../../specs/definitions/resolved-catalogue';
import { serializeTaskIndex, serializeTaskManifest } from '../../tasks/resource/codec';
import type { TaskIndex, TaskManifest } from '../../tasks/resource/model';
import { WorkflowError } from '../errors';
import { serializeSpecificationRecord, serializeTaskRunRecord } from './codec';
import type { SpecificationExecutionRecord, TaskRunRecord } from './model';
import type { ExecutionChange, ExecutionSnapshot, Versioned, WorkflowStore } from './store';
import {
  assertChangeIdentity,
  assertNoNewIssues,
  nextExecutionState,
  stateOfSnapshot,
  validateExecutionState,
} from './validate';

interface SpecState {
  specification?: Versioned<SpecificationExecutionRecord>;
  index?: Versioned<TaskIndex>;
  /** Every manifest, also of a folder the index does not list. */
  manifests: Map<string, Versioned<TaskManifest>>;
  runs: Map<string, Versioned<TaskRunRecord>>;
  /** The other files of the Task folders: Task id → folded path → text. */
  documents: Map<string, Map<string, string>>;
}

const versioned = <T>(value: T): Versioned<T> => ({
  value: structuredClone(value),
  revision: sha256Hex(canonicalJson(value)),
});

/** Run `operation` so that a failure rejects, as the filesystem store's do. */
const settled = <T>(operation: () => T): Promise<T> => Promise.resolve().then(operation);

/**
 * An in-memory {@link WorkflowStore} with the same revision, identity, coherence
 * ({@link validateExecutionState}), issue and codec checks before any write as the filesystem store;
 * the shared contract is `./store-contract.test-support.ts`. A Task folder exists while it holds its
 * manifest or a document.
 */
export function createMemoryWorkflowStore(): WorkflowStore & {
  readonly applied: ExecutionChange[];
  /** The text of a Task document, for tests. */
  readonly document: (specId: string, taskId: string, path: string) => string | undefined;
} {
  const specs = new Map<string, SpecState>();
  const applied: ExecutionChange[] = [];
  const stateOf = (specId: string): SpecState => {
    const existing = specs.get(specId);
    if (existing) {
      return existing;
    }

    const created: SpecState = { manifests: new Map(), runs: new Map(), documents: new Map() };
    specs.set(specId, created);

    return created;
  };

  const check = (current: Versioned<unknown> | undefined, expected: string | null) => {
    if ((current?.revision ?? null) !== expected) {
      throw new WorkflowError('WORKFLOW_STATE_CONFLICT', 'The record changed meanwhile.');
    }
  };

  const folderIds = (state: SpecState) =>
    [
      ...new Set([
        ...state.manifests.keys(),
        ...[...state.documents].filter(([, files]) => files.size > 0).map(([taskId]) => taskId),
      ]),
    ].sort();

  const snapshotOf = (specId: string, state: SpecState): ExecutionSnapshot => {
    const snapshot: ExecutionSnapshot = structuredClone({
      ...(state.specification ? { specification: state.specification } : {}),
      ...(state.index ? { index: state.index } : {}),
      manifests: (state.index?.value.tasks ?? []).flatMap(({ id }) => {
        const manifest = state.manifests.get(id);

        return manifest ? [manifest] : [];
      }),
      runs: [...state.runs.values()].sort((left, right) =>
        left.value.taskId < right.value.taskId ? -1 : 1,
      ),
      folders: folderIds(state),
      issues: [],
    });

    return { ...snapshot, issues: validateExecutionState(specId, stateOfSnapshot(snapshot)) };
  };

  return {
    applied,
    document: (specId, taskId, path) =>
      specs.get(specId)?.documents.get(taskId)?.get(foldPathKey(path)),
    read: (specId) => settled(() => snapshotOf(specId, stateOf(specId))),
    apply: (specId, change) =>
      settled(() => {
        assertChangeIdentity(change);
        const state = stateOf(specId);
        const snapshot = snapshotOf(specId, state);
        if (change.specification) {
          check(state.specification, change.specification.expected);
        }

        if (change.index) {
          check(state.index, change.index.expected);
        }

        for (const write of change.manifests ?? []) {
          check(state.manifests.get(write.taskId), write.expected);
        }

        for (const write of change.runs ?? []) {
          check(state.runs.get(write.taskId), write.expected);
        }

        for (const write of change.documents ?? []) {
          const existing = state.documents.get(write.taskId)?.get(foldPathKey(write.path));
          if (write.text !== null && existing !== undefined) {
            throw new WorkflowError('WORKFLOW_STATE_CONFLICT', 'The Task document exists already.');
          }
        }

        if (change.specification) {
          serializeSpecificationRecord(change.specification.next);
        }

        if (change.index) {
          serializeTaskIndex(change.index.next);
        }

        for (const write of change.manifests ?? []) {
          if (write.next !== null) {
            serializeTaskManifest(write.next);
          }
        }

        for (const write of change.runs ?? []) {
          serializeTaskRunRecord(write.next);
        }

        assertNoNewIssues(
          snapshot.issues,
          validateExecutionState(specId, nextExecutionState(stateOfSnapshot(snapshot), change)),
        );

        if (change.specification) {
          state.specification = versioned(change.specification.next);
        }

        if (change.index) {
          state.index = versioned(change.index.next);
        }

        for (const write of change.manifests ?? []) {
          if (write.next === null) {
            state.manifests.delete(write.taskId);
          } else {
            state.manifests.set(write.taskId, versioned(write.next));
          }
        }

        for (const write of change.documents ?? []) {
          const files = state.documents.get(write.taskId) ?? new Map<string, string>();
          if (write.text === null) {
            files.delete(foldPathKey(write.path));
          } else {
            files.set(foldPathKey(write.path), write.text);
          }

          state.documents.set(write.taskId, files);
        }

        for (const write of change.runs ?? []) {
          state.runs.set(write.taskId, versioned(write.next));
        }

        if (!isDeepStrictEqual(change, {})) {
          applied.push(structuredClone(change));
        }
      }),
  };
}

import { sha256Hex } from '../../hash';
import { foldPathKey } from '../../specs/document-rules/document-paths';
import { canonicalJson } from '../../specs/definitions/resolved-catalogue';
import { serializeTaskIndex, serializeTaskManifest } from '../../tasks/resource/codec';
import { TASK_MANIFEST_FILE, type TaskIndex, type TaskManifest } from '../../tasks/resource/model';

import { WorkflowError } from '../errors';
import { serializeSpecificationRecord, serializeTaskRunRecord } from './codec';
import type { SpecificationExecutionRecord, TaskRunRecord } from './model';
import type { ExecutionSnapshot, Versioned, WorkflowStore } from './store';
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
 * manifest or a document. Production store of the demo Runtime (`openInMemoryWorkflow`); it keeps
 * only the current state, and a read never adds a Specification to it.
 */
export function createMemoryWorkflowStore(): WorkflowStore & {
  /** The text of a file of a Task folder (`task.md` as created, or as last saved). */
  readonly document: (specId: string, taskId: string, path: string) => string | undefined;
  /**
   * Replace the text of an existing file of a Task folder: the Documents capability's save of a
   * Task document, as a project writes the file in the folder. The file goes with the Task.
   */
  readonly saveDocument: (specId: string, taskId: string, path: string, text: string) => void;
} {
  const specs = new Map<string, SpecState>();
  const emptyState = (): SpecState => ({
    manifests: new Map(),
    runs: new Map(),
    documents: new Map(),
  });
  /** The state to read: the stored one, or an empty one that is not stored. */
  const readState = (specId: string): SpecState => specs.get(specId) ?? emptyState();
  /** The state to write: stored on first use. */
  const stateOf = (specId: string): SpecState => {
    const existing = specs.get(specId);
    if (existing) {
      return existing;
    }

    const created = emptyState();
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
      specId,
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
    document: (specId, taskId, path) =>
      specs.get(specId)?.documents.get(taskId)?.get(foldPathKey(path)),
    saveDocument(specId, taskId, path, text) {
      const files = specs.get(specId)?.documents.get(taskId);
      if (files?.get(foldPathKey(path)) === undefined) {
        throw new WorkflowError(
          'WORKFLOW_SUBJECT_NOT_FOUND',
          `The Task folder holds no "tasks/${taskId}/${path}".`,
        );
      }

      files.set(foldPathKey(path), text);
    },
    read: (specId) => settled(() => snapshotOf(specId, readState(specId))),
    taskFolderExists: (specId, taskId) =>
      settled(() =>
        folderIds(readState(specId)).some((id) => foldPathKey(id) === foldPathKey(taskId)),
      ),
    taskFiles: (specId, taskId) =>
      settled(() => {
        const state = readState(specId);

        // Paths are kept folded (lower case), as the store compares them.
        return [
          ...(state.manifests.has(taskId) ? [TASK_MANIFEST_FILE] : []),
          ...(state.documents.get(taskId)?.keys() ?? []),
        ].sort();
      }),
    apply: (specId, change) =>
      settled(() => {
        assertChangeIdentity(change);
        const state = stateOf(specId);
        const snapshot = snapshotOf(specId, state);
        change.verifySnapshot?.(snapshot);
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
            throw new WorkflowError(
              'WORKFLOW_STATE_CORRUPT',
              `The Task folder holds "tasks/${write.taskId}/${write.path}" already.`,
            );
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
      }),
  };
}

import { WorkflowError } from '../errors';
import type { ExecutionChange, WorkflowStore } from './store';

/**
 * Whether a change of one of the Task's documents is pending (Task-scoped Documents, D03): its
 * files, and possibly its `task.yaml`, are not settled until that change is final.
 */
export type PendingTaskDocumentChange = (specId: string, taskId: string) => Promise<boolean>;

/** The Tasks whose folder a change writes: their `task.yaml` or one of their documents. */
export function tasksWrittenBy(change: ExecutionChange): string[] {
  return [
    ...new Set([
      ...(change.manifests ?? []).map((write) => write.taskId),
      ...(change.documents ?? []).map((write) => write.taskId),
    ]),
  ].sort();
}

/**
 * The store with the Specification execution store's half of D03: a change that writes a Task's
 * folder (a Task edit, removal, status decision, a Breakdown revising a draft, a finish effect) is
 * refused with `WORKFLOW_TASK_BUSY` while that Task has a pending document change, so the document
 * commit never meets a file the store rewrote. The check runs at `apply`, which every mutation
 * calls inside `serialize` (the project control lock), right before anything is written; a change
 * that writes no Task folder is not checked.
 */
export function guardTaskDocumentChanges(
  store: WorkflowStore,
  pending: PendingTaskDocumentChange,
): WorkflowStore {
  return {
    read: (specId) => store.read(specId),
    taskFiles: (specId, taskId) => store.taskFiles(specId, taskId),
    taskFolderExists: (specId, taskId) => store.taskFolderExists(specId, taskId),
    async apply(specId, change) {
      for (const taskId of tasksWrittenBy(change)) {
        if (await pending(specId, taskId)) {
          throw new WorkflowError(
            'WORKFLOW_TASK_BUSY',
            `A change of a document of the Task "${taskId}" is not committed yet (task-document-change); retry once it is.`,
          );
        }
      }

      await store.apply(specId, change);
    },
  };
}

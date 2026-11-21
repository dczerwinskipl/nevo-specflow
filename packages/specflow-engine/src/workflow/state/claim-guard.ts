import type { WorkflowWriteAdmission } from '../write-admission';
import type { WorkflowStore } from './store';

/**
 * The store admitting every change against the writer claims before anything is written. Every
 * kernel writer (start, finish, return, wait re-evaluation, abandon, Task create, edit, removal and
 * status) and every roll-forward of a pending change goes through `apply`, so none of them can write
 * while an agent Turn holds the project; reads stay available.
 */
export function guardExecutionClaims(
  store: WorkflowStore,
  admission: WorkflowWriteAdmission,
): WorkflowStore {
  return {
    read: (specId) => store.read(specId),
    taskFiles: (specId, taskId) => store.taskFiles(specId, taskId),
    taskFolderExists: (specId, taskId) => store.taskFolderExists(specId, taskId),
    async apply(specId, change) {
      await admission.admitWrite();
      await store.apply(specId, change);
    },
  };
}

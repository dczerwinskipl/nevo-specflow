import { SpecificationBusyError } from '../errors';
import type { WorkflowStore } from './store';

/**
 * Whether an unsettled Close (Specification, Worktree or Workspace Close) names the Specification.
 * Only Close holds count here; the agent execution claims are `claim-guard.ts`.
 */
export type CloseInProgress = (specId: string) => Promise<boolean>;

/**
 * The store refusing every change of a Specification while a Close of it is unsettled: Close pinned
 * the clean checkout and the Specification exit gate in its reservation, so a later workflow write
 * would leave the tree dirty and the reserved Close could not archive. The check runs at `apply`,
 * inside `serialize` (the project control lock Close reserves under), before anything is written.
 */
export function guardCloseReservations(
  store: WorkflowStore,
  closing: CloseInProgress,
): WorkflowStore {
  return {
    read: (specId) => store.read(specId),
    taskFiles: (specId, taskId) => store.taskFiles(specId, taskId),
    taskFolderExists: (specId, taskId) => store.taskFolderExists(specId, taskId),
    async apply(specId, change) {
      if (await closing(specId)) {
        throw new SpecificationBusyError(
          `A Close of the Specification "${specId}" is in progress; its workflow cannot change now.`,
          { cause: 'close' },
        );
      }

      await store.apply(specId, change);
    },
  };
}

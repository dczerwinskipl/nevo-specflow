import type { WorkspaceRegistration } from '../../../project/workspace/registry/registry';
import { isWorkspaceBranchName } from '../../../project/workspace/registry/validation';
import { CreateOperationError } from '../error';
import type { CreateJournal } from '../journal/model';

/** Translate durable create intent into the canonical linked-workspace registration. */
export function registrationOf(
  record: CreateJournal,
): Extract<WorkspaceRegistration, { kind: 'linked' }> {
  const target = record.target;
  if (target.kind !== 'new-worktree' || !target.instanceId) {
    throw new CreateOperationError(
      'CREATE_RECOVERY_REQUIRED',
      'Linked worktree has no durable identity evidence.',
    );
  }

  return {
    kind: 'linked',
    managed: true,
    workspaceId: target.workspaceId,
    root: target.workspaceRoot,
    instanceId: target.instanceId,
    ...(target.integrationDestination
      ? { integrationDestination: target.integrationDestination }
      : {}),
    ...(target.startedFrom !== undefined ? { startedFrom: target.startedFrom } : {}),
    // Only a name the registry can record (Git accepts longer ones); otherwise it stays unknown.
    ...(isWorkspaceBranchName(target.branch) ? { branch: target.branch } : {}),
  };
}

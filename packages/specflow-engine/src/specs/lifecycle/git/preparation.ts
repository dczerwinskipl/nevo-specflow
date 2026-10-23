import type { SpecFlowEngine } from '../../../application';
import { publishCloseCheckpoint } from '../close/checkpoint';
import { readWorkspaceRegistry } from '../../../project/workspace-registry';
import { readProjectGitPolicy } from '../../../version-control/worktrees/config';
import { inspectCloseGitIntegration } from './integration';
import { readCloseJournal } from '../journal/store';
import { CloseOperationError, type CloseJournal } from '../model';

/**
 * T11 checkpoint before any mutating Git subprocess is permitted.
 *
 * The first admitter records exact HEAD/tree/ancestry evidence under Project
 * Home control lock, using the exclusive Git claims from T10. No branch,
 * worktree, index or repository object is written by this operation.
 *
 * Only Worktree Close can use pre-archive source HEAD. Specification Close
 * must first persist an Engine-owned archive commit in T14/T15.
 */
export async function prepareCloseGitIntegration(
  engine: SpecFlowEngine,
  operationId: string,
): Promise<CloseJournal> {
  const previous = await readCloseJournal(engine.context, operationId);
  if (!previous) {
    throw new CloseOperationError('CLOSE_CONFLICT', 'Close operation is not reserved.');
  }
  if (previous.stage === 'integration-preparation-initiated') return previous;
  if (!(
    (previous.stage === 'reserved' &&
      (previous.plan.kind === 'worktree-close' || previous.plan.kind === 'workspace-close')) ||
    (previous.stage === 'archive-committed' &&
      previous.plan.kind === 'specification-close' &&
      !!previous.archive?.committedHead &&
      !!previous.plan.target)
  )) {
    throw new CloseOperationError(
      'CLOSE_CONFLICT',
      'Integration preparation requires an unmodified Worktree Close reservation.',
    );
  }

  const proof = await inspectCloseGitIntegration(engine, operationId);
  const next: CloseJournal = {
    ...previous,
    stage: 'integration-preparation-initiated',
    integration: {
      sourceCommit: proof.sourceCommit,
      targetCommit: proof.targetCommit,
      mergeBaseCommit: proof.mergeBaseCommit,
      sourceTree: proof.sourceTree,
      targetTree: proof.targetTree,
      relationship: proof.relationship,
    },
  };
  return publishCloseCheckpoint(engine, previous, next, {
    onConflict: 'Close reservation changed during Git integration preparation.',
    onReadbackFailure: 'Git integration preparation journal was not durably verified.',
    verifyCurrent: async (current) => {
      const registry = await readWorkspaceRegistry(engine.context);
      if (registry.revision !== current.plan.registryRevision)
        throw new CloseOperationError('CLOSE_CONFLICT', 'Workspace registry changed.');
      if (current.plan.configRevision) {
        const policy = await readProjectGitPolicy(engine.context);
        if (
          policy.revision !== current.plan.configRevision ||
          policy.policy.integrationTargetBranch !== current.plan.targetBranch
        )
          throw new CloseOperationError('CLOSE_CONFLICT', 'Project Git target policy changed.');
      } else {
        const source = registry.workspaces.find(
          (item) => item.workspaceId === current.plan.source.workspaceId,
        );
        const pinned = source?.kind === 'linked' ? source.integrationDestination : undefined;
        if (
          !pinned ||
          pinned.workspaceId !== current.plan.target?.workspaceId ||
          pinned.instanceId !== current.plan.target.instanceId ||
          pinned.branch !== current.plan.targetBranch
        ) {
          throw new CloseOperationError(
            'CLOSE_CONFLICT',
            'Workspace integration destination changed after reservation.',
          );
        }
      }
    },
  });
}

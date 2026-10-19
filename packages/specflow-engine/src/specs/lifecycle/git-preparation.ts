import { isDeepStrictEqual } from 'node:util';

import type { SpecFlowEngine } from '../../application';
import { withProjectControlLock } from '../../project/control-lock';
import { readWorkspaceRegistry } from '../../project/workspace-registry';
import { readProjectGitPolicy } from '../../version-control/worktrees/config';
import { inspectCloseGitIntegration } from './git-integration';
import { publishCloseJournal, readCloseJournal } from './journal-store';
import { CloseOperationError, type CloseJournal } from './model';

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
    (previous.stage === 'reserved' && previous.plan.kind === 'worktree-close') ||
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
  return withProjectControlLock(engine.context, async () => {
    const current = await readCloseJournal(engine.context, operationId);
    if (!current || !isDeepStrictEqual(current, previous)) {
      throw new CloseOperationError(
        'CLOSE_CONFLICT',
        'Close reservation changed during Git integration preparation.',
      );
    }
    const registry = await readWorkspaceRegistry(engine.context);
    if (registry.revision !== current.plan.registryRevision) {
      throw new CloseOperationError('CLOSE_CONFLICT', 'Workspace registry changed.');
    }
    const policy = await readProjectGitPolicy(engine.context);
    if (
      policy.revision !== current.plan.configRevision ||
      policy.policy.integrationTargetBranch !== current.plan.targetBranch
    ) {
      throw new CloseOperationError('CLOSE_CONFLICT', 'Project Git target policy changed.');
    }
    const next: CloseJournal = {
      ...current,
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
    await publishCloseJournal(engine.context, next);
    const stored = await readCloseJournal(engine.context, operationId);
    if (!stored || !isDeepStrictEqual(stored, next)) {
      throw new CloseOperationError(
        'CLOSE_RECOVERY_REQUIRED',
        'Git integration preparation journal was not durably verified.',
      );
    }
    return stored;
  });
}

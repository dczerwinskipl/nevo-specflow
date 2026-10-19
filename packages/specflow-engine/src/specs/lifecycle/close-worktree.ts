import type { SpecFlowEngine } from '../../application';
import { readWorkspaceSpecification } from '../repository';
import { prepareCloseGitIntegration } from './git-preparation';
import {
  proveAlreadyIntegratedClose,
  publishCloseGitFastForward,
  publishDivergentCloseCandidate,
  requireVerifiedCloseIntegration,
} from './git-publication';
import {
  inspectDivergentCloseResolution,
  prepareDivergentCloseCandidate,
  type DivergentCloseNeedsResolution,
} from './git-scratch';
import { readCloseJournal } from './journal-store';
import { CloseOperationError, type CloseJournal } from './model';
import { reserveCloseOperation } from './reservation';
import { disposeReboundWorktree, rebindVerifiedClose } from './worktree-disposal';

export type CloseWorktreeResult =
  { readonly status: 'completed'; readonly journal: CloseJournal } | DivergentCloseNeedsResolution;

/**
 * T13 Engine application operation; owns the whole single-identity lifecycle.
 * It does not archive, alter status or inspect any workflow exit gate.
 *
 * Incompletely observed Git mutations remain owned and fail closed; they need
 * explicit operator reconciliation, not automatic retry after restart.
 */
export async function closeWorktree(
  engine: SpecFlowEngine,
  request: { readonly operationId: string; readonly specId: string },
): Promise<CloseWorktreeResult> {
  const admitted = await reserveCloseOperation(engine, { ...request, kind: 'worktree-close' });
  let journal = admitted.journal;
  if (journal.stage === 'reserved') {
    journal = await prepareCloseGitIntegration(engine, request.operationId);
  }
  if (journal.stage === 'integration-preparation-initiated') {
    const relationship = journal.integration?.relationship;
    if (relationship === 'already-integrated') {
      journal = await proveAlreadyIntegratedClose(engine, request.operationId);
    } else if (relationship === 'fast-forward') {
      journal = await publishCloseGitFastForward(engine, request.operationId);
    } else if (relationship === 'divergent') {
      journal = await prepareDivergentCloseCandidate(engine, request.operationId);
    } else {
      throw new CloseOperationError('CLOSE_RECOVERY_REQUIRED', 'Missing Git relationship proof.');
    }
  }
  if (journal.stage === 'integration-scratch-candidate') {
    journal = await publishDivergentCloseCandidate(engine, request.operationId);
  }
  if (journal.stage === 'integration-scratch-conflict') {
    return inspectDivergentCloseResolution(engine, request.operationId);
  }
  if (journal.stage === 'integration-verified') {
    await requireVerifiedCloseIntegration(engine, request.operationId);
    journal = await rebindVerifiedClose(engine, request.operationId);
  }
  if (journal.stage === 'binding-rebound') {
    journal = await disposeReboundWorktree(engine, request.operationId);
  }
  if (journal.stage !== 'completed') {
    throw new CloseOperationError(
      'CLOSE_RECOVERY_REQUIRED',
      'Close is nonterminal; reconcile its exact Git/registry effect before continuing.',
    );
  }
  const target = journal.plan.target;
  if (!target || !journal.integration?.publishedCommit) {
    throw new CloseOperationError(
      'CLOSE_RECOVERY_REQUIRED',
      'Terminal Close has no destination evidence.',
    );
  }
  const final = await readCloseJournal(engine.context, request.operationId);
  const registry = await engine.readRegistry();
  const binding = registry.specBindings.find((x) => x.specId === request.specId);
  if (
    final?.stage !== 'completed' ||
    registry.workspaces.some((x) => x.workspaceId === journal.plan.source.workspaceId) ||
    binding?.workspaceId !== target.workspaceId ||
    (await readWorkspaceSpecification(target.root, request.specId)).location !==
      journal.plan.location
  ) {
    throw new CloseOperationError(
      'CLOSE_RECOVERY_REQUIRED',
      'Final destination/binding was not verified.',
    );
  }
  return { status: 'completed', journal: final };
}

import type { SpecFlowEngine } from '../../application';
import { readWorkspaceSpecification } from '../repository';
import { inspectDivergentCloseResolution, type DivergentCloseNeedsResolution } from './git-scratch';
import { readCloseJournal } from './journal-store';
import { CloseOperationError, type CloseJournal } from './model';
import { reserveCloseOperation } from './reservation';
import { advanceCloseIntegration } from './close-integration';

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
  journal = await advanceCloseIntegration(engine, journal);
  if (journal.stage === 'integration-scratch-conflict') {
    return inspectDivergentCloseResolution(engine, request.operationId);
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

import type { SpecFlowEngine } from '../../application';
import { prepareCloseGitIntegration } from './git-preparation';
import {
  proveAlreadyIntegratedClose,
  publishCloseGitFastForward,
  publishDivergentCloseCandidate,
  requireVerifiedCloseIntegration,
} from './git-publication';
import { prepareDivergentCloseCandidate } from './git-scratch';
import { CloseOperationError, type CloseJournal } from './model';
import { disposeReboundWorktree, rebindVerifiedClose } from './worktree-disposal';

/**
 * Shared Close integration progression. The caller owns archive admission,
 * conflict disposition and terminal business verification; this function
 * owns only integration preparation/publication and verified rebind/disposal.
 *
 * An uncertain published Git effect is intentionally NOT replayed here.
 */
export async function advanceCloseIntegration(
  engine: SpecFlowEngine,
  initial: CloseJournal,
): Promise<CloseJournal> {
  let journal = initial;
  const operationId = journal.plan.operationId;

  if (journal.stage === 'reserved' && journal.plan.kind === 'worktree-close')
    journal = await prepareCloseGitIntegration(engine, operationId);

  if (journal.stage === 'integration-preparation-initiated') {
    switch (journal.integration?.relationship) {
      case 'already-integrated':
        journal = await proveAlreadyIntegratedClose(engine, operationId);
        break;
      case 'fast-forward':
        journal = await publishCloseGitFastForward(engine, operationId);
        break;
      case 'divergent':
        journal = await prepareDivergentCloseCandidate(engine, operationId);
        break;
      default:
        throw new CloseOperationError(
          'CLOSE_RECOVERY_REQUIRED',
          'Integration relationship is missing or unverified.',
        );
    }
  }
  if (journal.stage === 'integration-scratch-candidate')
    journal = await publishDivergentCloseCandidate(engine, operationId);

  // On scratch conflict, Worktree Close offers resolution; Specification
  // Close persists retained archived conflict separately in its own use case.
  if (journal.stage === 'integration-scratch-conflict') return journal;

  if (journal.stage === 'integration-verified') {
    await requireVerifiedCloseIntegration(engine, operationId);
    journal = await rebindVerifiedClose(engine, operationId);
  }
  if (journal.stage === 'binding-rebound')
    journal = await disposeReboundWorktree(engine, operationId);

  return journal;
}

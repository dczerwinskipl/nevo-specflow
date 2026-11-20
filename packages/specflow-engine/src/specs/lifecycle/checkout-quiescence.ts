import type { SpecFlowEngine } from '../../application';
import { CloseOperationError, type CloseJournal, type ClosePlan } from './model';
import type {
  CheckoutQuiescence,
  CheckoutQuiescenceVerdict,
  CloseCheckout,
} from './checkout-quiescence-port';

/** The Engine with the host's checkout quiescence; Close refuses to remove a checkout without it. */
export function withCheckoutQuiescence(
  engine: SpecFlowEngine,
  checkoutQuiescence: CheckoutQuiescence,
): SpecFlowEngine {
  // A plain own-property copy: callers derive Engines with object spread, which drops prototypes.
  return { ...engine, checkoutQuiescence };
}

/** `CLOSE_BLOCKED` (resumable) unless the host attests that no agent works in the checkout. */
export async function requireQuietCheckout(
  engine: SpecFlowEngine,
  checkout: CloseCheckout,
): Promise<void> {
  const verdict: CheckoutQuiescenceVerdict = engine.checkoutQuiescence
    ? await engine.checkoutQuiescence(checkout)
    : {
        quiet: false,
        sessionIds: [],
        message:
          'This process cannot tell whether an agent Session works in the worktree. Close it from the SpecFlow UI, or with the specflow CLI.',
      };
  if (verdict.quiet) {
    return;
  }

  throw new CloseOperationError('CLOSE_BLOCKED', verdict.message, {
    blockers: [
      { kind: 'session-turn-running', subjectIds: verdict.sessionIds, message: verdict.message },
    ],
  });
}

/**
 * The linked checkout a Close of `plan` still has to remove and so asks quiescence for: a Worktree or
 * Workspace Close, or a Specification Close with integration, of a managed linked source with an
 * integration target, while its journal (when it has one) is not yet disposing or done. One rule for
 * Close and for every preview of it.
 */
export function checkoutRemovedByClose(
  plan: Pick<ClosePlan, 'kind' | 'integrateToTargetBranch' | 'source' | 'target'>,
  stage?: CloseJournal['stage'],
): CloseCheckout | undefined {
  const removesCheckout =
    plan.kind === 'worktree-close' ||
    plan.kind === 'workspace-close' ||
    plan.integrateToTargetBranch === true;
  if (
    !removesCheckout ||
    !plan.source.instanceId ||
    !plan.target ||
    stage === 'disposal-initiated' ||
    stage === 'completed'
  ) {
    return undefined;
  }

  return { workspaceId: plan.source.workspaceId, root: plan.source.root };
}

/**
 * The same check when a Close starts, so a refusal comes before its archive commit or integration
 * rather than after them. Only a Close that removes a linked checkout asks; the check right before
 * the removal still decides.
 */
export async function requireQuietCheckoutBeforeClose(
  engine: SpecFlowEngine,
  journal: CloseJournal,
): Promise<void> {
  const checkout = checkoutRemovedByClose(journal.plan, journal.stage);
  if (checkout) {
    await requireQuietCheckout(engine, checkout);
  }
}

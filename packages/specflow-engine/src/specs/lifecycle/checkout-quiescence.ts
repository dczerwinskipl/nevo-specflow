import type { SpecFlowEngine } from '../../application';
import { CloseOperationError, type CloseJournal } from './model';

/** The linked checkout a Close is about to remove. */
export interface CloseCheckout {
  readonly workspaceId: string;
  readonly root: string;
}

/**
 * Whether no agent Session Turn can be working in the checkout. `sessionIds` names the Sessions
 * when the host knows them; `message` says what to do.
 */
export type CheckoutQuiescenceVerdict =
  | { readonly quiet: true }
  | { readonly quiet: false; readonly message: string; readonly sessionIds: readonly string[] };

/**
 * The host's answer to "can an agent be working in this checkout?" (a port: the Engine does not
 * know agent Sessions). Agent Sessions run only inside a Runtime: the Runtime that owns the
 * Project's Session store answers from its own Turns, any other process from that store's durable
 * owner record. Close asks it before it starts and again right before it removes the checkout.
 */
export type CheckoutQuiescence = (checkout: CloseCheckout) => Promise<CheckoutQuiescenceVerdict>;

/** The Engine with the host's checkout quiescence; Close refuses to remove a checkout without it. */
export function withCheckoutQuiescence(
  engine: SpecFlowEngine,
  checkoutQuiescence: CheckoutQuiescence,
): SpecFlowEngine {
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
 * The same check when a Close starts, so a refusal comes before its archive commit or integration
 * rather than after them. Only a Close that removes a linked checkout asks; the check right before
 * the removal still decides.
 */
export async function requireQuietCheckoutBeforeClose(
  engine: SpecFlowEngine,
  journal: CloseJournal,
): Promise<void> {
  const plan = journal.plan;
  const removesCheckout =
    plan.kind === 'worktree-close' ||
    plan.kind === 'workspace-close' ||
    plan.integrateToTargetBranch === true;
  if (
    !removesCheckout ||
    !plan.source.instanceId ||
    !plan.target ||
    journal.stage === 'disposal-initiated' ||
    journal.stage === 'completed'
  ) {
    return;
  }

  await requireQuietCheckout(engine, {
    workspaceId: plan.source.workspaceId,
    root: plan.source.root,
  });
}

import type { SpecFlowEngine } from '../../application';
import { checkoutRemovedByClose, requireQuietCheckout } from './checkout-quiescence';
import type { SpecificationExitBlocker } from './exit-guard';
import { CloseOperationError } from './model';
import { previewCloseOperation, type CloseRequest } from './preflight';

/**
 * The `session-turn-running` blocker a preview of `request` reports: Close's own rule
 * (`checkoutRemovedByClose`) on the plan, then the host's checkout quiescence. The plan is made
 * without the workflow exit gate, which the preview reports itself, so both blockers can be listed
 * together. A Close that cannot be planned has no checkout to ask about; its preview reports why.
 */
export async function closePreviewCheckoutBlocker(
  engine: SpecFlowEngine,
  request: CloseRequest,
): Promise<SpecificationExitBlocker | undefined> {
  let checkout;
  try {
    const plan = await previewCloseOperation(
      { ...engine, specificationExit: () => Promise.resolve([]) },
      request,
    );
    checkout = checkoutRemovedByClose(plan);
  } catch {
    return undefined;
  }

  if (!checkout) {
    return undefined;
  }

  try {
    await requireQuietCheckout(engine, checkout);

    return undefined;
  } catch (error) {
    if (error instanceof CloseOperationError && error.code === 'CLOSE_BLOCKED') {
      return error.blockers[0];
    }

    throw error;
  }
}

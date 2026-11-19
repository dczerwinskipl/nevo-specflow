/** The linked checkout a Close is about to remove. */
export interface CloseCheckout {
  readonly workspaceId: string;
  readonly root: string;
}

/**
 * Whether no agent Session Turn can be working in the checkout. `sessionIds` names the Sessions
 * when the host knows them. `message` says what to do.
 */
export type CheckoutQuiescenceVerdict =
  | { readonly quiet: true }
  | { readonly quiet: false; readonly message: string; readonly sessionIds: readonly string[] };

/**
 * The host's answer to "can an agent be working in this checkout?" Agent Sessions run only inside
 * a Runtime. The Runtime that owns the Project's Session store answers from its own Turns.
 * Other processes answer from that store's durable owner record. Close asks before it starts
 * and again right before it removes the checkout.
 */
export type CheckoutQuiescence = (checkout: CloseCheckout) => Promise<CheckoutQuiescenceVerdict>;

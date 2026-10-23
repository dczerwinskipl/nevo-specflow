import type { RequestAttempt } from '../../../../shared/operations/retainedRequest';

/**
 * Synchronous bookkeeping of one Create operation that must be readable inside async continuations
 * and router callbacks, where a rendered value could be stale: the retained request (one
 * idempotency key per distinct body), when the operation started, the in-flight guard against a
 * double submit and the "navigation was caused by completing" flag.
 *
 * Both Create flows (the demo and the project Runtime) own exactly one of these per form and extend
 * it with the bookkeeping only they need. Nothing here is displayed: everything the user sees lives
 * in `createOperationReducer`. It is created once per form (`useState` initialiser) and never read
 * while rendering.
 */
export interface CreateOperationLedger<TInput> {
  readonly attempt: { current: RequestAttempt<TInput> | null };
  /** Epoch ms of the first attempt of the retained request. */
  startedAt: number | undefined;
  /** Claims the single in-flight slot; false when an operation is already running. */
  begin(): boolean;
  end(): void;
  /** True once completing the operation navigates away: the leave guard must let it pass. */
  navigationAllowed: boolean;
}

export function createOperationLedger<TInput>(
  attempt: RequestAttempt<TInput> | null = null,
  startedAt?: number,
): CreateOperationLedger<TInput> {
  let inFlight = false;
  return {
    attempt: { current: attempt },
    startedAt,
    navigationAllowed: false,
    begin() {
      if (inFlight) return false;
      inFlight = true;
      return true;
    },
    end() {
      inFlight = false;
    },
  };
}

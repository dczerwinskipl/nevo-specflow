import type { DemoCreateRequest, DemoSessionInput } from '@nevo/specflow-contracts/demo';
import type { RequestAttempt } from '../../../shared/operations/retainedRequest';
import type { CreationProgress } from './creationPipeline';

/**
 * Synchronous bookkeeping of one Create operation that must be readable inside async continuations
 * and router callbacks, where a rendered value could be stale: the retained requests (one
 * idempotency key per distinct body), the authoritative result already committed, the in-flight
 * guard against a double submit and the "navigation was caused by completing" flag.
 *
 * Nothing here is displayed: everything the user sees lives in `createOperationReducer`. The ledger
 * is created once per form (`useState` initialiser) and never read while rendering.
 */
export interface CreateOperationLedger {
  readonly createAttempt: { current: RequestAttempt<DemoCreateRequest> | null };
  readonly sessionAttempt: { current: RequestAttempt<DemoSessionInput> | null };
  readonly progress: CreationProgress;
  /** Claims the single in-flight slot; false when an operation is already running. */
  begin(): boolean;
  end(): void;
  /** True once completing the operation navigates away: the leave guard must let it pass. */
  navigationAllowed: boolean;
}

export function createOperationLedger(): CreateOperationLedger {
  let inFlight = false;
  return {
    createAttempt: { current: null },
    sessionAttempt: { current: null },
    progress: {},
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

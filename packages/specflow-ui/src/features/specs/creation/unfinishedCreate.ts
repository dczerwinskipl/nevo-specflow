import type { AuthStore } from '../../../auth/store';
import { createOperationStorageFor } from './createOperationStorage';

/** A Create that was sent from this browser tab and has not concluded yet. */
export interface UnfinishedCreate {
  readonly operationId: string;
  /** The specification name the owner typed; absent for a request sent without one. */
  readonly title?: string;
}

/**
 * The unfinished Create operation of this tab, for places outside its progress page (the
 * specification list shows a way back to it). It reads the same client-side ledger the page uses
 * (the stored request in `sessionStorage`; no endpoint): the entry exists from the moment the
 * request is sent until the operation completes, is refused or is released, so a notice built on
 * it disappears with the operation.
 */
export function readUnfinishedCreate(authStore: AuthStore): UnfinishedCreate | undefined {
  const stored = createOperationStorageFor(authStore).load();
  if (!stored) return undefined;
  const title = stored.request.title.trim();
  return { operationId: stored.request.operationId, ...(title ? { title } : {}) };
}

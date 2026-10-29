import type { ResolvedProjectHome } from '../../../project/home/home';
import {
  leasePath as checkoutLeasePath,
  readCheckoutLease,
  removeCheckoutLease,
  removeCheckoutLeaseOf,
  writeCheckoutLease,
  type LeaseErrors,
} from '../../durable/lease';
import { invalidLease, type DocumentQueueLease } from '../changes/journal';

// The lease record, the in-process mark and the judgement of an executor are the durable core's
// (ADR 0018 decision 8: the manual commit takes the same lease). This module binds them to the
// error vocabulary of the document queue and keeps the names the queue has always used.
export {
  judgeExecutor,
  markLeaseActive,
  markLeaseIdle,
  type LeaseVerdict,
} from '../../durable/lease';

const errors: LeaseErrors = { invalid: invalidLease };

export function leasePath(context: ResolvedProjectHome, workspaceId: string): string {
  return checkoutLeasePath(context, workspaceId);
}

/** The lease of a checkout, `undefined` when there is none. A corrupt or redirected file fails closed. */
export function readQueueLease(
  context: ResolvedProjectHome,
  workspaceId: string,
): Promise<DocumentQueueLease | undefined> {
  return readCheckoutLease(context, workspaceId, errors);
}

/** Creates or replaces the lease (atomic publish). */
export function writeQueueLease(
  context: ResolvedProjectHome,
  lease: Omit<DocumentQueueLease, 'version' | 'projectId'>,
): Promise<DocumentQueueLease> {
  return writeCheckoutLease(context, lease, errors);
}

/** Releases the lease; absent is fine. */
export function removeQueueLease(context: ResolvedProjectHome, workspaceId: string): Promise<void> {
  return removeCheckoutLease(context, workspaceId);
}

/** Releases the lease only while it still names `batchId`. */
export function removeQueueLeaseOf(
  context: ResolvedProjectHome,
  workspaceId: string,
  batchId: string,
): Promise<void> {
  return removeCheckoutLeaseOf(context, workspaceId, batchId, errors);
}

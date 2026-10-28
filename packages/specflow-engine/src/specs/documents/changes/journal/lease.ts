import { parseCheckoutLease, type CheckoutLease } from '../../../durable/lease';
import { documentChangeError } from '../errors';
import type { JournalContext } from './codec';

/**
 * The per-checkout lease (`engine/operations/documents/leases/<workspaceId>.json`): the one process
 * that executes a batch of this checkout (or a manual commit, which shares the file). Acquired and
 * released under the control lock. The record and its primitives live in the durable core.
 */
export type DocumentQueueLease = CheckoutLease;

export function invalidLease(): Error {
  return documentChangeError('journal-corrupt', 'The document queue lease is corrupt.');
}

export function parseDocumentQueueLease(
  context: JournalContext,
  value: unknown,
  workspaceId: string,
): DocumentQueueLease {
  return parseCheckoutLease(context, value, workspaceId, { invalid: invalidLease });
}

export function encodeDocumentQueueLease(
  context: JournalContext,
  lease: DocumentQueueLease,
): string {
  parseDocumentQueueLease(context, lease, lease.workspaceId);
  return JSON.stringify(lease);
}

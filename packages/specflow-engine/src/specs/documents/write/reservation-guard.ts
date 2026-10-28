import {
  DOCUMENT_BATCH_REFUSES_RESERVATION,
  type DocumentBatchState,
} from '../changes/journal/stages';
import { foldPathKey } from '../../document-rules/document-paths';
import { documentChangeError } from '../changes/errors';

/** How long a client is told to wait before it retries a save that overlaps a batch being committed. */
export const BUSY_RETRY_AFTER_MS = 1000;

/** A batch as the reservation sees it: its state and the checkout-relative paths it commits. */
export interface BatchPathView {
  readonly batchId: string;
  readonly workspaceId: string;
  readonly state: DocumentBatchState;
  readonly paths: ReadonlySet<string>;
}

/**
 * The reservation check against batches (under the control lock): a request whose paths overlap a
 * batch that is `committing` or `recovery-required` is refused as `SPEC_BUSY` (`commit-in-progress`
 * or `recovery-required`). A `formed` batch is not claimed yet (an operation joins it), a `failed`
 * one is dissolved by the new operation. Pure.
 */
export function assertNoClaimedBatchOverlap(
  workspaceId: string,
  paths: readonly string[],
  batches: readonly BatchPathView[],
): void {
  for (const batch of batches) {
    if (batch.workspaceId !== workspaceId) continue;
    if (!DOCUMENT_BATCH_REFUSES_RESERVATION[batch.state]) continue;
    // Paths compare case-insensitively, like the barrier check: a checkout may be on a folding filesystem.
    const held = new Set([...batch.paths].map(foldPathKey));
    if (!paths.some((path) => held.has(foldPathKey(path)))) continue;
    throw documentChangeError(
      batch.state === 'recovery-required' ? 'busy-recovery-required' : 'busy-commit-in-progress',
      batch.state === 'recovery-required'
        ? 'A pending commit of these documents needs recovery.'
        : 'These documents are being committed; retry shortly.',
      batch.state === 'recovery-required' ? {} : { retryAfterMs: BUSY_RETRY_AFTER_MS },
    );
  }
}

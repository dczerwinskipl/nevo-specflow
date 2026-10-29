import { apiErrorCode, writeOutcomeUnknown } from '../../shared/http/apiErrorCode';

/**
 * How a failed document write (save, create, import, tree operation) must be kept for an exact
 * replay with the same `operationId` and body, or `undefined` for a definite answer:
 * - `recovery`: `DOCUMENT_RECOVERY_REQUIRED`, written but not committed; Resume finishes it;
 * - `unknown`: no answer at all (the Runtime may have applied it), or `DOCUMENT_WRITE_FAILED`
 *   (503: the Engine keeps the operation claimed and expects a retry with the same id).
 * The document writes receive the raw client error (a status is present for a 503), so the code
 * decides, not the HTTP outcome alone. The one rule for every document write.
 */
export type WriteRetention = 'recovery' | 'unknown';

export function writeRetention(error: unknown): WriteRetention | undefined {
  const code = apiErrorCode(error);
  if (code === 'DOCUMENT_RECOVERY_REQUIRED') {
    return 'recovery';
  }

  if (code === 'DOCUMENT_WRITE_FAILED') {
    return 'unknown';
  }

  return writeOutcomeUnknown(error) ? 'unknown' : undefined;
}

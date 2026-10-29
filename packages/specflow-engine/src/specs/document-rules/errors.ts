import type { DocumentErrorCode, DocumentErrorDetails } from '@nevo/specflow-contracts/documents';

/**
 * Error of the Specification documents layer. `code` is one entry of the single exported
 * `DOCUMENT_ERROR_CODES` array of the contracts package; Runtime maps it to a status. Messages never
 * contain absolute paths.
 */
export class DocumentError extends Error {
  readonly code: DocumentErrorCode;
  readonly details?: DocumentErrorDetails;

  constructor(code: DocumentErrorCode, message: string, details?: DocumentErrorDetails) {
    super(message);
    this.name = 'DocumentError';
    this.code = code;
    if (details) {
      this.details = details;
    }
  }
}

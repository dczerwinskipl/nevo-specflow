import { Type, type Static } from 'typebox';

import { ActionReasonSchema, closedUnion } from './vocabulary';

/**
 * Every code of the "Errors" table of `docs/reference/api/specification-documents.md`.
 * The single source of the code list: the union type and the schema derive from this array.
 */
export const DOCUMENT_ERROR_CODES = [
  'DOCUMENT_NOT_FOUND',
  'DOCUMENT_FILE_MISSING',
  'SPEC_SOURCE_UNAVAILABLE',
  'DOCUMENT_REVISION_UNAVAILABLE',
  'DOCUMENT_REVISION_CONFLICT',
  'DOCUMENT_PATH_INVALID',
  'DOCUMENT_PATH_CONFLICT',
  'DOCUMENT_PROTECTED',
  'DOCUMENT_TYPE_INVALID',
  'DOCUMENT_ALREADY_CLASSIFIED',
  'DOCUMENT_NOT_EDITABLE',
  'DOCUMENT_TOO_LARGE',
  'DOCUMENT_OPERATION_INVALID',
  'DOCUMENT_OPERATION_CONFLICT',
  'DOCUMENT_RECOVERY_REQUIRED',
  'SPEC_MANIFEST_DIRTY',
  'SPEC_ARCHIVED',
  'SPEC_BUSY',
  'BRANCH_PROTECTED',
  'COMMIT_BLOCKED',
  'COMMIT_FAILED',
  'GIT_POLICY_INVALID',
  'CREATE_JOURNAL_UNSUPPORTED',
  'CATALOGUE_STALE',
  'ARCHETYPE_UNKNOWN',
] as const;

export type DocumentErrorCode = (typeof DOCUMENT_ERROR_CODES)[number];

export const DocumentErrorCodeSchema = closedUnion(DOCUMENT_ERROR_CODES);

export const DocumentErrorDetailsSchema = Type.Object(
  {
    reason: Type.Optional(ActionReasonSchema),
    /** The Engine commit port's own reason (`detached`, `index-locked`, ...). */
    blockedBy: Type.Optional(Type.String()),
    /** For recovery errors, the failure that caused it (for example `COMMIT_FAILED`). */
    cause: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);
export type DocumentErrorDetails = Static<typeof DocumentErrorDetailsSchema>;

/**
 * Error body of every document endpoint: a superset of `CreateSpecErrorSchema` (`error`, `code`)
 * with the optional `details`. `code` stays a plain string in the Create schema in this release.
 */
export const DocumentErrorSchema = Type.Object(
  {
    error: DocumentErrorCodeSchema,
    code: DocumentErrorCodeSchema,
    details: Type.Optional(DocumentErrorDetailsSchema),
  },
  { additionalProperties: false },
);
export type DocumentErrorBody = Static<typeof DocumentErrorSchema>;

/**
 * Route-level `bodyLimit` of the document write routes ("Limits" of
 * `docs/architecture/runtime/specification-documents.md`). The Runtime only caps the body; content
 * bytes, document counts and totals are the Engine's admission rules. The server has no global
 * override, so each route sets its own limit; a body above it is answered `DOCUMENT_TOO_LARGE` (413).
 */
const KIB = 1024;
const MIB = 1024 * KIB;

/** Save: above the 1 MiB content cap to leave room for JSON escaping. */
export const SAVE_BODY_LIMIT_BYTES = 2 * MIB;
/** Batch save: 25 documents and 4 MiB of content, with room for JSON escaping. */
export const BATCH_SAVE_BODY_LIMIT_BYTES = 8 * MIB;
/** Create documents: the Create caps (10 files, 1 MiB in all) with room for JSON escaping. */
export const CREATE_DOCUMENTS_BODY_LIMIT_BYTES = 2 * MIB;
/** Operations (rename, move, delete, classify), folders, flush, retry and abandon. */
export const OPERATION_BODY_LIMIT_BYTES = 256 * KIB;
/** Manual commit: the message (100 + 2000 characters) and at most 200 paths, with room for JSON escaping. */
export const MANUAL_COMMIT_BODY_LIMIT_BYTES = 256 * KIB;

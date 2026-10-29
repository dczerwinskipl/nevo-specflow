/**
 * Limits of document-change operations. The authoritative table is "Limits" in
 * `docs/architecture/runtime/specification-documents.md`; these constants are its only code copy for
 * the write path. All sizes are UTF-8 / raw BYTES unless a name says otherwise.
 */

const KIB = 1024;
const MIB = 1024 * KIB;

/** Operation journal file. Counts and hashes only: the plan lives in the payload store. */
export const DOCUMENT_JOURNAL_MAX_BYTES = 32 * KIB;
/** Batch record file. The path list lives in a hash-addressed plan file. */
export const DOCUMENT_BATCH_RECORD_MAX_BYTES = 64 * KIB;
/** A plan file (`DocumentChangePlan`, encoded). Its paths are bounded by {@link DOCUMENT_BATCH_MAX_PATHS}. */
export const DOCUMENT_PLAN_MAX_BYTES = 512 * KIB;
/** A tolerant listing reads at most this many names of a document journal directory. */
export const DOCUMENT_JOURNAL_LISTING_MAX_FILES = 5000;

/** Operations in one commit batch. */
export const DOCUMENT_BATCH_MAX_OPERATIONS = 50;
/** Paths in one commit batch; a single operation expanding to more is `DOCUMENT_OPERATION_INVALID`. */
export const DOCUMENT_BATCH_MAX_PATHS = 200;
/** Queued (non-terminal) operations per checkout; beyond: `SPEC_BUSY` (`queue-full`). */
export const DOCUMENT_QUEUE_MAX_OPERATIONS_PER_CHECKOUT = 200;
/**
 * All non-terminal operations per checkout, those that wait for a person included (a failed commit,
 * one that needs recovery). Only the first 200 count against the queue above: dead
 * operations must not stop new saves, but they are not unbounded either.
 */
export const DOCUMENT_QUEUE_MAX_JOURNALS_PER_CHECKOUT = 1000;

/** Batch save: total content of all documents. The document count cap is `BATCH_SAVE_MAX_DOCUMENTS`. */
export const BATCH_SAVE_MAX_TOTAL_BYTES = 4 * MIB;

/** Documents, folders and total content of one create-documents request (the Create caps). */
export const CREATE_DOCUMENTS_MAX_FILES = 10;
export const CREATE_DOCUMENTS_MAX_FOLDERS = 100;
export const CREATE_DOCUMENTS_MAX_TOTAL_BYTES = 1 * MIB;

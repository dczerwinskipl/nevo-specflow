/**
 * Limits of the Create operation. The documented table is "Limits" in
 * `docs/architecture/runtime/specification-documents.md`; these constants are its only code copy.
 * All sizes are UTF-8 BYTES unless a name says otherwise. Documents-owned limits live in
 * `../documents/limits`.
 */

const KIB = 1024;
const MIB = 1024 * KIB;

/**
 * Create journal file cap (the existing 64 KiB). The one constant read by the strict store, the
 * tolerant listing and the retention sweep; scaffold contents are not stored in the journal.
 */
export const CREATE_JOURNAL_MAX_BYTES = 64 * KIB;
/** Room kept free at reservation for the evidence later stages add (commit ids, a reason). */
export const CREATE_JOURNAL_GROWTH_HEADROOM_BYTES = 4 * KIB;
/** A directory this large is not a journal directory worth listing in full: the listing reads this many names. */
export const CREATE_JOURNAL_LISTING_MAX_FILES = 5000;
/** Files of one Create scaffold: the manifest, the overview, further templates and added documents. */
export const CREATE_SCAFFOLD_FILES_MAX = 64;

/** Added documents at Create. Each file is also bounded by the documents text content limit. */
export const ADDED_DOCUMENTS_MAX_FILES = 10;
export const ADDED_DOCUMENTS_MAX_FOLDERS = 100;
export const ADDED_DOCUMENTS_MAX_TOTAL_BYTES = 1 * MIB;

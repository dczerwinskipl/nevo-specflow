/**
 * Archive limits of Close. The single code copy: Close enforces them when it takes the inventory of
 * an archive move and validates its journal, and the documents reader reports the same limits as the
 * `archive-limit` issue so a Specification that Close would refuse is visible before it is closed.
 * Documented in "Limits" of `docs/architecture/runtime/specification-documents.md`.
 */

const MIB = 1024 * 1024;

/** Files Close archives per Specification; it fails above. */
export const ARCHIVE_FILES_MAX = 4096;
/** Per-file byte limit of the archive inventory. */
export const ARCHIVE_FILE_MAX_BYTES = 32 * MIB;
/** The archive count traversal stops at this many files (ARCHIVE_FILES_MAX + 1) or this many entries. */
export const ARCHIVE_COUNT_TRAVERSAL_FILES_STOP = ARCHIVE_FILES_MAX + 1;
export const ARCHIVE_COUNT_TRAVERSAL_ENTRIES_MAX = 20000;

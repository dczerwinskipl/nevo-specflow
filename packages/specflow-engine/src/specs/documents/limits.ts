/**
 * Limits of the Specification documents layer. The single authoritative table is "Limits" in
 * `docs/architecture/runtime/specification-documents.md`; these constants are its only code copy and are
 * exported once. All sizes are UTF-8 / raw BYTES, never characters, unless a name says otherwise.
 * Definition text limits (description, useWhen, instructions, template content) live next to the
 * definition schema in `@nevo/specflow-contracts/documents` and are not restated here.
 */

const KIB = 1024;
const MIB = 1024 * KIB;

/** Text JSON read and Save content. Above: `DOCUMENT_TOO_LARGE`; use `raw` to read. */
export const TEXT_CONTENT_MAX_BYTES = 1 * MIB;
/** Raw content. Below Close's per-file archive limit on purpose. */
export const RAW_CONTENT_MAX_BYTES = 25 * MIB;

/** Files up to this size get a sha256 revision; larger ones `stat:<size>-<mtimeNs>`. */
export const CONTENT_HASH_MAX_BYTES = 1 * MIB;
/** Revision memo (keyed by path+size+mtimeNs+ino): at most this many entries (LRU). */
export const REVISION_MEMO_MAX_ENTRIES = 5000;

/** Manifest size; larger is `SPEC_SOURCE_INVALID`. */
export const MANIFEST_MAX_BYTES = 256 * KIB;

/** Listed files per Specification; beyond: `truncated: true`. */
export const LISTED_FILES_MAX = 2000;
/** Folder depth: at most this many folder segments above a file (a folder path has at most this many segments). */
export const FOLDER_DEPTH_MAX = 8;

/** Close archive: file count it allows (it fails above) and its per-file byte limit. */
export const ARCHIVE_FILES_MAX = 4096;
export const ARCHIVE_FILE_MAX_BYTES = 32 * MIB;
/** Archive count traversal stops at this many files (ARCHIVE_FILES_MAX + 1) or this many entries. */
export const ARCHIVE_COUNT_TRAVERSAL_FILES_STOP = ARCHIVE_FILES_MAX + 1;
export const ARCHIVE_COUNT_TRAVERSAL_ENTRIES_MAX = 20000;

/** Added documents at Create. Each file is also bounded by {@link TEXT_CONTENT_MAX_BYTES}. */
export const ADDED_DOCUMENTS_MAX_FILES = 10;
export const ADDED_DOCUMENTS_MAX_FOLDERS = 100;
export const ADDED_DOCUMENTS_MAX_TOTAL_BYTES = 1 * MIB;

/** Rendered template text (64 KiB each). */
export const TEMPLATE_TEXT_MAX_BYTES = 64 * KIB;

/**
 * One path segment in UTF-8 BYTES. Far below the 255 bytes of a file name on common filesystems, so a
 * staged file name (`.<uuid>.tmp`) or any other sibling of a document always fits.
 */
export const DOCUMENT_SEGMENT_MAX_BYTES = 200;

/** Path length in CHARACTERS (a sanity bound; path rules still apply). */
export const DOCUMENT_PATH_MAX_CHARACTERS = 500;

/** Route-level `bodyLimit` values: Save and Create; other document writes. */
export const HTTP_BODY_SAVE_AND_CREATE_MAX_BYTES = 2 * MIB;
export const HTTP_BODY_DOCUMENT_OPERATION_MAX_BYTES = 256 * KIB;

/**
 * Create journal file cap (the existing 64 KiB). The one constant read by the strict store, the
 * tolerant listing and the retention sweep; scaffold contents are not stored in the journal.
 */
export const CREATE_JOURNAL_MAX_BYTES = 64 * KIB;
/** Room kept free at reservation for the evidence later stages add (commit ids, a reason). */
export const CREATE_JOURNAL_GROWTH_HEADROOM_BYTES = 4 * KIB;
/** Files of one Create scaffold: the manifest, the overview, further templates and added documents. */
export const CREATE_SCAFFOLD_FILES_MAX = 64;

/** Bytes of a file inspected to decide whether text content is really text. */
export const CONTENT_SNIFF_BYTES = 8 * KIB;

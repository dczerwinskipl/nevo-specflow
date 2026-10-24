/**
 * Limits of the Specification documents layer. The single authoritative table is "Limits" in
 * `docs/architecture/runtime/specification-documents.md`; these constants are its only code copy and are
 * exported once. All sizes are UTF-8 / raw BYTES, never characters, unless a name says otherwise.
 * The Close archive limits live in `../lifecycle/limits`, the Create limits in `../create/limits`. Definition text limits (description,
 * useWhen, instructions, template content) live next to the definition schema in
 * `@nevo/specflow-contracts/documents`; the rendered template limit below is that very constant.
 */

import {
  DEFINITION_TEMPLATE_MAX_BYTES,
  DOCUMENT_PATH_MAX_LENGTH,
} from '@nevo/specflow-contracts/documents';

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

/** Rendered template text (64 KiB each). */
export const TEMPLATE_TEXT_MAX_BYTES = DEFINITION_TEMPLATE_MAX_BYTES;

/**
 * One path segment in UTF-8 BYTES. Far below the 255 bytes of a file name on common filesystems, so a
 * staged file name (`.<uuid>.tmp`) or any other sibling of a document always fits.
 */
export const DOCUMENT_SEGMENT_MAX_BYTES = 200;

/** Path length in CHARACTERS (a sanity bound; path rules still apply). One value with the contracts. */
export const DOCUMENT_PATH_MAX_CHARACTERS = DOCUMENT_PATH_MAX_LENGTH;

/** Upper bound of the small git files (HEAD) the advisory Git policy reads. */
export const ADVISORY_FILE_MAX_BYTES = 4 * KIB;

/** Bytes of a file inspected to decide whether text content is really text. */
export const CONTENT_SNIFF_BYTES = 8 * KIB;

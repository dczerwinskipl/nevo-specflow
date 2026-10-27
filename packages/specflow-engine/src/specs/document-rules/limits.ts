/**
 * Limits of the portable document path rules: the part of the "Limits" table in
 * `docs/architecture/runtime/specification-documents.md` that the definitions loader needs as well as
 * the documents layer. `../documents/limits.ts` re-exports them, so the table still has one code copy.
 */
import { DOCUMENT_PATH_MAX_LENGTH } from '@nevo/specflow-contracts/documents';

/** Folder depth: at most this many folder segments above a file (a folder path has at most this many segments). */
export const FOLDER_DEPTH_MAX = 8;

/**
 * One path segment in UTF-8 BYTES. Far below the 255 bytes of a file name on common filesystems, so a
 * staged file name (`.<uuid>.tmp`) or any other sibling of a document always fits.
 */
export const DOCUMENT_SEGMENT_MAX_BYTES = 200;

/** Path length in CHARACTERS (a sanity bound; path rules still apply). One value with the contracts. */
export const DOCUMENT_PATH_MAX_CHARACTERS = DOCUMENT_PATH_MAX_LENGTH;

/**
 * Longest absolute path (`workspaceRoot` + `/` + relative path, in characters) the Engine accepts on
 * Windows. Below the 260 characters of MAX_PATH with room for Git's own working files. The Engine does
 * not enable long paths (a per-user or per-repository setting it cannot verify), so a longer path is
 * refused before anything is written. See "Windows-hosted paths" in
 * `docs/architecture/runtime/specification-documents.md`.
 */
export const WINDOWS_ABSOLUTE_PATH_MAX = 240;

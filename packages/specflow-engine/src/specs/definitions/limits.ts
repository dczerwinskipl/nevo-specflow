/**
 * Limits of the definition loader. The single authoritative table is "Limits" in
 * `docs/architecture/runtime/specification-documents.md` (row "Definition files"); these constants are its
 * only code copy. All sizes are raw bytes.
 */
import { DEFINITION_TEMPLATE_MAX_BYTES } from '@nevo/specflow-contracts/documents';

const KIB = 1024;
const MIB = 1024 * KIB;

/** One definition YAML file. */
export const DEFINITION_FILE_MAX_BYTES = 128 * KIB;
/** One template file (`contentFile`): the template text limit. */
export const DEFINITION_TEMPLATE_FILE_MAX_BYTES = DEFINITION_TEMPLATE_MAX_BYTES;
/** Total bytes read by one load (definition files and template files together). */
export const DEFINITION_LOAD_MAX_BYTES = 8 * MIB;
/** Directory entries examined per kind directory; extra entries (in name order) are rejected. */
export const DEFINITION_DIRECTORY_ENTRIES_MAX = 500;
/**
 * A directory with more entries than this is rejected as a whole (it is never listed in full, so
 * "extra files in name order" cannot be decided deterministically).
 */
export const DEFINITION_DIRECTORY_OVERFLOW = 5000;
/** Template files one definition file may refer to. */
export const DEFINITION_AUXILIARY_FILES_MAX = 64;

/** Document types that load per project. */
export const DOCUMENT_TYPES_MAX = 100;
/** Archetypes that load per project. */
export const ARCHETYPES_MAX = 50;
/** Templates of one archetype. */
export const ARCHETYPE_TEMPLATES_MAX = 64;

/** Problems returned by the catalogue (errors first, then by source). */
export { DEFINITION_PROBLEMS_MAX } from '@nevo/specflow-contracts/documents';

/** A file modified within this window is never trusted from the catalogue cache. */
export const CATALOGUE_RECENCY_WINDOW_MS = 2000;
/** A load whose stat signature changed while it ran is retried this many times in total. */
export const CATALOGUE_LOAD_ATTEMPTS = 3;
/** Loads a mutation makes in all before it refuses a catalogue that keeps changing underneath. */
export const CATALOGUE_STABLE_READ_ATTEMPTS = 3;
/** Pause between those loads. */
export const CATALOGUE_STABLE_READ_DELAY_MS = 50;
/** Project Homes whose catalogue stays memoised in one process. */
export const CATALOGUE_MEMO_MAX_HOMES = 16;
/** Directory entries walked when computing the stat signature (beyond: never trusted from the cache). */
export const SIGNATURE_ENTRIES_MAX = 5000;
export const SIGNATURE_DEPTH_MAX = 10;

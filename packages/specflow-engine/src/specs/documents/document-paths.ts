import {
  DOCUMENT_PATH_MAX_CHARACTERS,
  DOCUMENT_SEGMENT_MAX_BYTES,
  FOLDER_DEPTH_MAX,
} from './limits';

/**
 * Portable document paths (architecture "Identity, paths and the registry"): POSIX `/`, relative to
 * the Specification directory. Pure; no filesystem access. A path is accepted only when it is already
 * normalised; this module never rewrites a path to make it valid.
 */

export type DocumentPathViolation =
  | 'empty'
  | 'too-long'
  | 'segment-too-long'
  | 'absolute'
  | 'empty-segment'
  | 'traversal'
  | 'hidden-segment'
  | 'trailing-dot-or-space'
  | 'forbidden-character'
  | 'control-character'
  | 'unaddressable-character'
  | 'malformed-text'
  | 'device-name'
  | 'reserved-name'
  | 'too-deep';

export type DocumentPathResult =
  | { readonly ok: true; readonly path: string }
  | { readonly ok: false; readonly violation: DocumentPathViolation };

/** Names reserved at the Specification root, ignoring case: never documents. */
const RESERVED_ROOT_NAMES = ['specification.yaml', 'change.yaml'] as const;

const FORBIDDEN_CHARACTERS = /[\\:*?"<>|]/u;
const CONTROL_CHARACTERS = /\p{Cc}/u;
/** Control, format, line and paragraph separator characters (bidi overrides, C1, U+2028, zero width). */
const INVISIBLE_OR_CONTROL = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;
const BACKSLASH = String.fromCharCode(0x5c);
const REPLACEMENT_CHARACTER = String.fromCharCode(0xfffd);

/**
 * The single predicate for names the documents layer can neither address nor display safely: a
 * control, format or separator character (Cc, Cf, Zl, Zp), a backslash, U+FFFD (what a non-UTF-8 byte
 * decodes to) or a string that is not well formed UTF-16 (a lone surrogate, which a file system
 * would store as U+FFFD). Admission, the manifest parser and the directory reader all use it so that
 * nothing can be created that the product cannot show.
 */
export function isUnaddressable(name: string): boolean {
  return (
    !name.isWellFormed() ||
    INVISIBLE_OR_CONTROL.test(name) ||
    name.includes(BACKSLASH) ||
    name.includes(REPLACEMENT_CHARACTER)
  );
}
// Reserved device names are reserved with or without an extension on Windows; reject on every host.
const DEVICE_NAME = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/iu;

/** An empty, current-directory or parent-directory segment: it never names an entry of a directory. */
export function isNavigationSegment(segment: string): boolean {
  return segment === '' || segment === '.' || segment === '..';
}

/** Case-insensitive uniqueness key of a path. */
export function foldPathKey(path: string): string {
  return path.toLowerCase();
}

export function isReservedRootName(name: string): boolean {
  const key = foldPathKey(name);
  return RESERVED_ROOT_NAMES.some((reserved) => reserved === key);
}

/** Validate a file path. Folder depth (segments above the file) is at most {@link FOLDER_DEPTH_MAX}. */
export function validateDocumentPath(path: string): DocumentPathResult {
  return validate(path, 'file');
}

/** Validate a folder path (at most {@link FOLDER_DEPTH_MAX} segments). The root `''` is not a folder entry. */
export function validateFolderPath(path: string): DocumentPathResult {
  return validate(path, 'folder');
}

function validate(path: string, kind: 'file' | 'folder'): DocumentPathResult {
  const fail = (violation: DocumentPathViolation): DocumentPathResult => ({ ok: false, violation });
  if (path.length === 0) return fail('empty');
  if (path.length > DOCUMENT_PATH_MAX_CHARACTERS) return fail('too-long');
  if (!path.isWellFormed()) return fail('malformed-text');
  if (CONTROL_CHARACTERS.test(path)) return fail('control-character');
  if (INVISIBLE_OR_CONTROL.test(path) || path.includes(REPLACEMENT_CHARACTER)) {
    return fail('unaddressable-character');
  }
  if (path.startsWith('/')) return fail('absolute');
  if (path.includes('\\')) return fail('forbidden-character');
  const segments = path.split('/');
  for (const segment of segments) {
    if (segment.length === 0) return fail('empty-segment');
    if (Buffer.byteLength(segment, 'utf8') > DOCUMENT_SEGMENT_MAX_BYTES) {
      return fail('segment-too-long');
    }
    if (segment === '..') return fail('traversal');
    if (segment.startsWith('.')) return fail('hidden-segment');
    if (segment.endsWith('.') || segment.endsWith(' ')) return fail('trailing-dot-or-space');
    if (FORBIDDEN_CHARACTERS.test(segment)) return fail('forbidden-character');
    if (DEVICE_NAME.test(segment)) return fail('device-name');
  }
  const depth = kind === 'file' ? segments.length - 1 : segments.length;
  if (depth > FOLDER_DEPTH_MAX) return fail('too-deep');
  if (segments.length === 1 && isReservedRootName(path)) return fail('reserved-name');
  return { ok: true, path };
}

/** Parent folder of a path (`''` for a root entry). @internal Used by tests until the write operations need it. */
export function parentFolder(path: string): string {
  const index = path.lastIndexOf('/');
  return index < 0 ? '' : path.slice(0, index);
}

/** Every ancestor folder of a path, shallowest first (`a/b/c.md` gives `a`, `a/b`). */
export function ancestorFolders(path: string): string[] {
  const segments = path.split('/').slice(0, -1);
  return segments.map((_, index) => segments.slice(0, index + 1).join('/'));
}

/**
 * Folders derived from file paths plus explicit folders: every ancestor of every entry, unique by
 * exact path, sorted by case-folded key then exact path. Git cannot track an empty directory, so an
 * empty folder exists only through `explicitFolders`.
 */
export function deriveFolders(
  filePaths: readonly string[],
  explicitFolders: readonly string[] = [],
): string[] {
  const folders = new Set<string>();
  for (const path of filePaths) for (const folder of ancestorFolders(path)) folders.add(folder);
  for (const folder of explicitFolders) {
    folders.add(folder);
    for (const ancestor of ancestorFolders(folder + '/x')) folders.add(ancestor);
  }
  return [...folders].sort(compareByFoldedKey);
}

/** Groups of two or more distinct paths that are equal ignoring case (each group sorted). */
export function findCaseCollisions(paths: readonly string[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const path of paths) {
    const key = foldPathKey(path);
    const group = groups.get(key);
    if (group) {
      if (!group.includes(path)) group.push(path);
    } else groups.set(key, [path]);
  }
  return [...groups.values()].filter((group) => group.length > 1).map((group) => group.sort());
}

/** True when any of `others` equals `path` ignoring case (an exact match counts). @internal Used by tests until the write operations need it. */
export function collidesIgnoringCase(path: string, others: Iterable<string>): boolean {
  const key = foldPathKey(path);
  for (const other of others) if (foldPathKey(other) === key) return true;
  return false;
}

function compareByFoldedKey(left: string, right: string): number {
  const a = foldPathKey(left);
  const b = foldPathKey(right);
  if (a !== b) return a < b ? -1 : 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

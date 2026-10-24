import type { DocumentTree } from '@nevo/specflow-contracts/documents';
import { message, type Message } from '../../../i18n/message';

const hasControlCharacter = (value: string) =>
  [...value].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127);
/** Device names the Runtime refuses as a path segment (with or without an extension). */
const isReservedName = (name: string) => /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name);
/** A file to create or import; its display title is derived by the Engine (first H1, else stem). */
export interface PlannedDocument {
  path: string;
  content: string;
}
export function validEntryName(name: string, document = false) {
  return Boolean(
    name.trim() === name &&
    name.length &&
    name.length <= 200 &&
    !/[\\/:*?"<>|]/.test(name) &&
    !hasControlCharacter(name) &&
    name !== '.' &&
    name !== '..' &&
    !/[. ]$/.test(name) &&
    (!document || /.+\.(md|txt)$/i.test(name)),
  );
}
/**
 * Why a file name cannot be imported, mirroring the Runtime path rules (leading dot, reserved device
 * names, trailing dot or space, forbidden and control characters); `undefined` means acceptable.
 */
export function uploadNameReason(name: string): Message | undefined {
  if (name === '.' || name === '..' || name.startsWith('.'))
    return message('documents.tree.nameReason.dot');
  if (isReservedName(name)) return message('documents.tree.nameReason.reserved');
  if (!validEntryName(name)) return message('documents.tree.nameReason.invalid');
  return undefined;
}
export function joinDocumentPath(folder: string, name: string) {
  return folder ? `${folder}/${name}` : name;
}
export function allDocumentFolders(paths: readonly string[], folders: readonly string[]) {
  const result = new Map(folders.map((path) => [path.toLowerCase(), path]));
  for (const path of [...paths, ...folders]) {
    const parts = path.split('/');
    for (let index = 1; index < parts.length; index++) {
      const parent = parts.slice(0, index).join('/');
      if (!result.has(parent.toLowerCase())) result.set(parent.toLowerCase(), parent);
    }
  }
  return [...result.values()].sort((a, b) => a.localeCompare(b));
}
export function pathCollides(
  path: string,
  files: readonly string[],
  folders: readonly string[],
  asFolder = false,
) {
  const key = path.toLocaleLowerCase();
  return (
    files.some(
      (p) =>
        p.toLocaleLowerCase() === key ||
        key.startsWith(p.toLocaleLowerCase() + '/') ||
        (!asFolder && p.toLocaleLowerCase().startsWith(key + '/')),
    ) ||
    folders.some(
      (p) =>
        p.toLocaleLowerCase() === key || (!asFolder && p.toLocaleLowerCase().startsWith(key + '/')),
    )
  );
}
const collator = new Intl.Collator('pl', { numeric: true, sensitivity: 'base' });
export const compareNames = (a: string, b: string) => collator.compare(a, b);
const baseName = (path: string) => path.split('/').at(-1) ?? path;

/**
 * Presentation order of one tree level: `folders` A-Z, then `documents` A-Z (locale-aware,
 * case-insensitive, numeric-aware), at every level including the root. Importance (for example a
 * workflow-required document) never changes the order. Paths and ids are untouched.
 */
export function orderTreeLevel<F extends { path: string }, D extends { path: string }>(
  folders: readonly F[],
  documents: readonly D[],
) {
  const byName = (a: { path: string }, b: { path: string }) =>
    compareNames(baseName(a.path), baseName(b.path));
  return {
    folders: [...folders].sort(byName),
    documents: [...documents].sort(byName),
  };
}

export type EntryKind = 'document' | 'folder';
/** Client-side name check (on the trimmed name); `undefined` means acceptable. */
export function entryNameError(
  rawName: string,
  kind: EntryKind,
  /** Extensions a new text document may have (`capabilities.formats`). */
  formats: readonly string[] = ['md', 'txt'],
): Message | undefined {
  const name = rawName.trim();
  if (!name) return undefined;
  if (/[\\/:*?"<>|]/.test(name)) return message('documents.tree.nameError.characters');
  if (hasControlCharacter(name)) return message('documents.tree.nameError.control');
  if (name.length > 200) return message('documents.tree.nameError.tooLong');
  if (name === '.' || name === '..') return message('documents.tree.nameError.other');
  if (name.startsWith('.')) return message('documents.tree.nameError.dot');
  if (isReservedName(name)) return message('documents.tree.nameError.reserved');
  if (/[. ]$/.test(name)) return message('documents.tree.nameError.trailing');
  if (kind === 'document' && name.includes('.')) {
    const extension = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
    if (name.lastIndexOf('.') === 0 || !formats.map((f) => f.toLowerCase()).includes(extension))
      return message('documents.tree.nameError.format', {
        formats: formats.map((format) => `.${format}`).join(', '),
      });
  }
  return undefined;
}

/** The name sent to the Engine: create appends `.md`; rename keeps the current extension when omitted. */
export function finalEntryName(rawName: string, kind: EntryKind, currentName?: string) {
  const name = rawName.trim();
  if (kind !== 'document' || name.includes('.')) return name;
  return name + (currentName?.match(/\.(md|txt)$/i)?.[0] ?? '.md');
}

const containerOf = (path: string) => path.substring(0, path.lastIndexOf('/')).toLowerCase();

/** The minimal shape the index groups: folders and rows with a path (a row may set its level). */
export interface IndexableTree {
  folders: readonly { path: string }[];
  /** `placement`: the folder the row is shown in when it is not its path's folder. */
  documents: readonly { path: string; placement?: string }[];
}

/** A row of the tree: a document on disk, or a registry entry whose file is missing (dangling). */
export type TreeRowDocument =
  | (DocumentTree['documents'][number] & { dangling?: undefined; placement?: undefined })
  | (DocumentTree['dangling'][number] & { dangling: true; placement?: string });

export interface TreeRows {
  folders: DocumentTree['folders'];
  documents: TreeRowDocument[];
}

/**
 * The rows the explorer draws: the documents, and each dangling entry at its registered path (in
 * the main folder when its folder no longer exists). State never reorders a level.
 */
export function treeRows(tree: Pick<DocumentTree, 'folders' | 'documents' | 'dangling'>): TreeRows {
  const folders = new Set(tree.folders.map((folder) => folder.path.toLowerCase()));
  return {
    folders: tree.folders,
    documents: [
      ...tree.documents,
      ...tree.dangling.map((entry) => {
        const container = containerOf(entry.path);
        return {
          ...entry,
          dangling: true as const,
          ...(container && !folders.has(container) ? { placement: '' } : {}),
        };
      }),
    ],
  };
}

/** Every level of a tree, grouped once: a lookup never scans the folder and document lists again. */
export interface DocumentTreeIndex<Tree extends IndexableTree> {
  /** The level directly inside `parent` (case-insensitive), in presentation order; memoized. */
  level: (
    parent: string,
  ) => ReturnType<typeof orderTreeLevel<Tree['folders'][number], Tree['documents'][number]>>;
}

/**
 * Groups a tree's folders and documents by container in one pass. Build it once per tree change
 * (the explorer memoizes it) and use it for rendering and for the emptiness checks.
 */
export function createTreeIndex<Tree extends IndexableTree>(tree: Tree): DocumentTreeIndex<Tree> {
  type Folder = Tree['folders'][number];
  type Doc = Tree['documents'][number];
  const groups = new Map<string, { folders: Folder[]; documents: Doc[] }>();
  const group = (key: string) => {
    let found = groups.get(key);
    if (!found) groups.set(key, (found = { folders: [], documents: [] }));
    return found;
  };
  for (const folder of tree.folders)
    if (folder.path.length > 0) group(containerOf(folder.path)).folders.push(folder);
  for (const doc of tree.documents)
    group(doc.placement?.toLowerCase() ?? containerOf(doc.path)).documents.push(doc);
  const levels = new Map<string, ReturnType<DocumentTreeIndex<Tree>['level']>>();
  return {
    level(parent) {
      const key = parent.toLowerCase();
      let level = levels.get(key);
      if (!level) {
        const members = groups.get(key);
        level = orderTreeLevel(members?.folders ?? [], members?.documents ?? []);
        levels.set(key, level);
      }
      return level;
    },
  };
}

/** The folders and documents directly inside `parent` (one-off lookup; render paths use the index). */
export function treeLevel<Tree extends IndexableTree>(tree: Tree, parent: string) {
  return createTreeIndex(tree).level(parent);
}

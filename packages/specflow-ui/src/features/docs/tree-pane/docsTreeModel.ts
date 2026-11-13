import type { WorkspaceDocsTreeDocument } from '@nevo/specflow-contracts/docs';

export interface DocsFolderNode {
  readonly name: string;
  /** Path under `docs.root` without a trailing slash (`''` for the root). */
  readonly path: string;
  readonly folders: readonly DocsFolderNode[];
  readonly documents: readonly WorkspaceDocsTreeDocument[];
  /**
   * Every document below this folder is a proposal and its parent's are not all: the folder
   * that owns the proposal prefix, labelled once.
   */
  readonly ownsProposals: boolean;
}

/** One visible row of the tree, in reading order (the keyboard moves along these). */
export interface DocsTreeRow {
  readonly key: string;
  /** The folder row's own path, or the document's id. */
  readonly kind: 'folder' | 'document';
  readonly id: string;
  /** The key of the folder holding the row; `undefined` at the root level. */
  readonly parentKey?: string;
}

export const folderKey = (path: string) => `folder:${path}`;
export const documentKey = (documentId: string) => `document:${documentId}`;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** A folder's hub leads its documents: its `README.md` or a document of type `hub`. */
const isHub = (document: WorkspaceDocsTreeDocument) =>
  document.type === 'hub' || /(^|\/)readme\.md$/i.test(document.path);

interface MutableFolder {
  name: string;
  path: string;
  folders: Map<string, MutableFolder>;
  documents: WorkspaceDocsTreeDocument[];
}

/**
 * The folders and documents of the tree: folders first (case-insensitive, numeric-aware), then the
 * folder's hub, then the other documents by title.
 */
export function buildDocsTree(documents: readonly WorkspaceDocsTreeDocument[]): DocsFolderNode {
  const root: MutableFolder = { name: '', path: '', folders: new Map(), documents: [] };
  for (const document of documents) {
    const parts = document.path.split('/');
    let folder = root;
    for (const part of parts.slice(0, -1)) {
      const path = folder.path ? `${folder.path}/${part}` : part;
      let next = folder.folders.get(part);
      if (!next) {
        next = { name: part, path, folders: new Map(), documents: [] };
        folder.folders.set(part, next);
      }

      folder = next;
    }

    folder.documents.push(document);
  }

  const allProposals = (folder: MutableFolder): boolean =>
    folder.documents.every((document) => document.proposal) &&
    [...folder.folders.values()].every(allProposals);

  const freeze = (folder: MutableFolder, parentMarked: boolean): DocsFolderNode => {
    const marked = folder.path !== '' && allProposals(folder);

    return {
      name: folder.name,
      path: folder.path,
      ownsProposals: marked && !parentMarked,
      folders: [...folder.folders.values()]
        .sort((a, b) => collator.compare(a.name, b.name))
        .map((child) => freeze(child, marked)),
      documents: [...folder.documents].sort((a, b) =>
        isHub(a) !== isHub(b) ? (isHub(a) ? -1 : 1) : collator.compare(a.title, b.title),
      ),
    };
  };

  return freeze(root, false);
}

/** The folders that hold `path` (a document path under `docs.root`), outermost first. */
export function ancestorFolders(path: string): string[] {
  const parts = path.split('/').slice(0, -1);

  return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
}

/** The visible rows in reading order, given the expanded folders. */
export function visibleRows(root: DocsFolderNode, expanded: ReadonlySet<string>): DocsTreeRow[] {
  const rows: DocsTreeRow[] = [];
  const walk = (folder: DocsFolderNode, parentKey: string | undefined) => {
    for (const child of folder.folders) {
      const key = folderKey(child.path);
      rows.push({ key, kind: 'folder', id: child.path, parentKey });
      if (expanded.has(child.path)) {
        walk(child, key);
      }
    }

    for (const document of folder.documents) {
      rows.push({
        key: documentKey(document.documentId),
        kind: 'document',
        id: document.documentId,
        parentKey,
      });
    }
  };

  walk(root, undefined);

  return rows;
}

/**
 * Where a tree key goes (roving tabindex): Up/Down to the neighbouring visible row, Home/End to
 * the first/last, Right into an expanded folder's first child, Left to the parent folder. Expanding
 * or collapsing (Right on a collapsed folder, Left on an expanded one) is the caller's: it keeps
 * focus on the row. `undefined` when the key moves nothing.
 */
export function treeKeyTarget(
  rows: readonly DocsTreeRow[],
  currentKey: string,
  key: string,
  expanded: ReadonlySet<string>,
): { readonly focus?: string; readonly toggle?: string } | undefined {
  const index = rows.findIndex((row) => row.key === currentKey);
  const row = rows[index];
  if (!row) {
    return undefined;
  }

  const focus = (target: DocsTreeRow | undefined) => (target ? { focus: target.key } : undefined);
  switch (key) {
    case 'ArrowDown':
      return focus(rows[index + 1]);
    case 'ArrowUp':
      return focus(rows[index - 1]);
    case 'Home':
      return focus(rows[0]);
    case 'End':
      return focus(rows.at(-1));
    case 'ArrowRight':
      if (row.kind !== 'folder') {
        return undefined;
      }

      return expanded.has(row.id)
        ? focus(rows[index + 1]?.parentKey === row.key ? rows[index + 1] : undefined)
        : { toggle: row.id };
    case 'ArrowLeft':
      if (row.kind === 'folder' && expanded.has(row.id)) {
        return { toggle: row.id };
      }

      return focus(rows.find((candidate) => candidate.key === row.parentKey));
    default:
      return undefined;
  }
}

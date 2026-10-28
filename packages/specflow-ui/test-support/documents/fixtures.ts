import type {
  Action,
  DocumentContent,
  DocumentTree,
  SaveResult,
} from '@nevo/specflow-contracts/documents';

/**
 * Fixtures in the shapes of the documents contract (tests and stories). Only the fields a test
 * cares about are given; the rest are the values of an ordinary registered Markdown document.
 */

const available: Action = { available: true };

const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const stem = (path: string) => fileName(path).replace(/\.[^.]+$/u, '');

/** `GET .../documents/:documentId`: a registered Markdown document. */
export function documentContentFixture(
  fields: Partial<DocumentContent> & Pick<DocumentContent, 'id'>,
): DocumentContent {
  const path = fields.path ?? fields.id + '.md';
  const content = 'content' in fields ? fields.content : '# ' + stem(path);
  return {
    path,
    title: stem(path),
    classification: 'registered',
    type: 'note',
    kind: 'text',
    mediaType: 'text/markdown; charset=utf-8',
    size: content?.length ?? 0,
    revision: '1',
    editable: true,
    ...fields,
    ...(content !== undefined ? { content } : {}),
  };
}

export type TreeDocumentFixture = DocumentTree['documents'][number];

/**
 * One document node of the tree: registered, editable Markdown with every action available. Its
 * type defaults to the file stem, so its name says the type and the row shows no type label.
 */
export function treeDocumentFixture(
  fields: Partial<TreeDocumentFixture> & Pick<TreeDocumentFixture, 'id' | 'path'>,
): TreeDocumentFixture {
  return {
    classification: 'registered',
    type:
      stem(fields.path)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/^[^a-z]+/, '') || 'note',
    kind: 'text',
    mediaType: 'text/markdown; charset=utf-8',
    size: 0,
    revision: '1',
    protected: false,
    editable: true,
    satisfiesRequirement: false,
    actions: {
      rename: available,
      move: available,
      delete: available,
      classify: { available: false },
    },
    ...fields,
  };
}

/** The folder revision of a fixture folder: distinct from the tree revision, as in the Engine. */
export const folderRevisionFixture = (path: string) => `folder:${path}:1`;

/**
 * A whole tree; `folders` are paths (the root is added, without a revision) with every action
 * available and their own folder revision (`folderRevisionFixture`).
 */
export function documentTreeFixture(
  fields: Partial<Omit<DocumentTree, 'folders' | 'documents'>> & {
    readonly folders?: readonly string[];
    readonly documents?: readonly (Partial<TreeDocumentFixture> &
      Pick<TreeDocumentFixture, 'id' | 'path'>)[];
  } = {},
): DocumentTree {
  const { folders = [], documents = [], ...rest } = fields;
  const root = { available: false, reason: 'root' } as const;
  return {
    revision: '1',
    archetype: { id: 'minimal', version: 1, title: 'Minimal' },
    folders: [
      { path: '', actions: { rename: root, move: root, delete: root } },
      ...folders.map((path) => ({
        path,
        revision: folderRevisionFixture(path),
        actions: { rename: available, move: available, delete: available },
      })),
    ],
    documents: documents.map(treeDocumentFixture),
    dangling: [],
    completeness: { complete: true, requirements: [] },
    capabilities: {
      createFile: available,
      createFolder: available,
      import: available,
      classify: available,
      formats: ['md', 'txt'],
    },
    issues: [],
    truncated: false,
    skippedEntries: 0,
    ...rest,
  };
}

/** A save that wrote `revision` (its commit already made, as with auto-commit). */
export function saveResultFixture(revision: string, id = 'document'): SaveResult {
  return {
    operationId: '00000000-0000-4000-8000-000000000000',
    document: { id, path: `${id}.md`, revision },
    commit: { state: 'committed', sha: 'f'.repeat(40) },
  };
}

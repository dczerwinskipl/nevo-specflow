import { describe, expect, it } from 'vitest';
import { polishText } from '../../../i18n/testing';
import {
  documentTreeFixture,
  folderRevisionFixture,
} from '../../../../test-support/documents/fixtures';
import {
  allDocumentFolders,
  folderActions,
  folderOperationRevision,
  entryNameError as rawEntryNameError,
  finalEntryName,
  orderTreeLevel,
  pathCollides,
  createTreeIndex,
  treeRows,
  treeLevel,
  uploadNameReason,
  validEntryName,
} from './documentTreePolicy';
const entryNameError = (...args: Parameters<typeof rawEntryNameError>) =>
  polishText(rawEntryNameError(...args));

describe('creation document policy', () => {
  it('rejects paths and absent basenames at the entry boundary', () => {
    for (const value of ['.md', '.txt', '../spec.md', 'dir/file.md', 'bad\\name.md', 'foo.md '])
      expect(validEntryName(value, true), value).toBe(false);
    expect(validEntryName('client-notes.txt', true)).toBe(true);
  });
  it('prevents file/folder collision including parent and descendants, case-insensitively', () => {
    expect(pathCollides('Architecture', ['architecture/ADR.md'], [])).toBe(true);
    expect(pathCollides('Architecture/next.md', ['architecture'], [])).toBe(true);
    expect(pathCollides('architecture', [], ['ARCHITECTURE'])).toBe(true);
    expect(pathCollides('architecture/next.md', ['architecture/adr.md'], ['architecture'])).toBe(
      false,
    );
  });
  it('keeps nested empty folders and derives required parents', () => {
    expect(allDocumentFolders(['architecture/adr/001.md'], ['source/client'])).toEqual([
      'architecture',
      'architecture/adr',
      'source',
      'source/client',
    ]);
  });
});

it('keeps a single case-insensitive folder identity', () =>
  expect(allDocumentFolders(['architecture/adr.md'], ['Architecture'])).toEqual(['Architecture']));

describe('document tree presentation order', () => {
  const doc = (path: string, required?: boolean) => ({ path, required });
  it('puts folders A-Z before files A-Z and never reorders by the required flag', () => {
    const level = orderTreeLevel(
      [{ path: 'notatki' }, { path: 'architektura' }, { path: 'Zeszyt' }],
      [doc('zeta.md'), doc('Alfa.md'), doc('brief.md', true), doc('specification.md', true)],
    );
    expect(level.folders.map((f) => f.path)).toEqual(['architektura', 'notatki', 'Zeszyt']);
    expect(level.documents.map((d) => d.path)).toEqual([
      'Alfa.md',
      'brief.md',
      'specification.md',
      'zeta.md',
    ]);
    expect(level).not.toHaveProperty('pinned');
  });
  it('keeps the required document among its siblings by name', () => {
    expect(
      orderTreeLevel([], [doc('a.md'), doc('specification.md', true), doc('z.md')]).documents.map(
        (d) => d.path,
      ),
    ).toEqual(['a.md', 'specification.md', 'z.md']);
  });
  it('orders numerically, case-insensitively and with Polish collation', () => {
    expect(
      orderTreeLevel(
        [],
        [doc('adr-10.md'), doc('adr-2.md'), doc('łódź.md'), doc('lz.md'), doc('ADR-3.md')],
      ).documents.map((d) => d.path),
    ).toEqual(['adr-2.md', 'ADR-3.md', 'adr-10.md', 'lz.md', 'łódź.md']);
  });
});

describe('inline entry names', () => {
  it('accepts empty (cancels elsewhere) and valid names', () => {
    expect(entryNameError('  ', 'document')).toBeUndefined();
    expect(entryNameError('notes', 'document')).toBeUndefined();
    expect(entryNameError('a.txt', 'document')).toBeUndefined();
  });
  it('reports Polish messages', () => {
    expect(entryNameError('a/b', 'folder')).toContain('znaków');
    expect(entryNameError('x'.repeat(201), 'folder')).toBe(
      'Nazwa może mieć maksymalnie 200 znaków.',
    );
    expect(entryNameError('abc.', 'folder')).toBe('Nazwa nie może kończyć się kropką ani spacją.');
    expect(entryNameError('..', 'folder')).toBe('Nazwa nie może składać się z samych kropek.');
    expect(entryNameError('a.pdf', 'document')).toBe('Obsługiwane formaty: .md, .txt.');
    expect(entryNameError('a.pdf', 'folder')).toBeUndefined();
  });
  it('appends .md on create and keeps the current extension on rename', () => {
    expect(finalEntryName('notes', 'document')).toBe('notes.md');
    expect(finalEntryName('notes', 'document', 'old.txt')).toBe('notes.txt');
    expect(finalEntryName('notes.txt', 'document', 'old.md')).toBe('notes.txt');
    expect(finalEntryName(' dir ', 'folder')).toBe('dir');
  });
});

describe('upload name policy', () => {
  it('rejects the names the Runtime rejects, so one bad file never fails the batch', () => {
    for (const name of ['.hidden.md', 'CON.md', 'nul.txt', 'notes.md ', 'notes.', 'a:b.md'])
      expect(uploadNameReason(name), name).toBeTruthy();
    for (const name of ['interview.md', 'konsola.md', 'a.b.txt'])
      expect(uploadNameReason(name), name).toBeUndefined();
  });
});

describe('treeRows', () => {
  const action = { available: true };
  const tree = {
    folders: [{ path: 'docs', actions: { rename: action, move: action, delete: action } }],
    documents: [],
    dangling: [
      { id: 'backend', path: 'docs/backend.md', type: 'backend', actions: { delete: action } },
      { id: 'ux', path: 'gone/ux.md', type: 'ux', actions: { delete: action } },
    ],
  } as unknown as Parameters<typeof treeRows>[0];

  it('places a dangling entry at its registered path, or in the main folder when its folder is gone', () => {
    const index = createTreeIndex(treeRows(tree));
    expect(index.level('docs').documents.map((row) => row.id)).toEqual(['backend']);
    expect(index.level('').documents.map((row) => [row.id, row.dangling])).toEqual([['ux', true]]);
  });
});

describe('treeLevel', () => {
  const tree = {
    folders: [{ path: 'Docs' }, { path: 'docs/sub' }, { path: 'other' }],
    documents: [
      { id: '1', path: 'root.md' },
      { id: '2', path: 'docs/b.md' },
      { id: '3', path: 'DOCS/a.md' },
      { id: '4', path: 'docs/sub/c.md' },
    ],
  };

  it('lists the direct children of the root', () => {
    const level = treeLevel(tree, '');
    expect(level.folders.map((f) => f.path)).toEqual(['Docs', 'other']);
    expect(level.documents.map((d) => d.id)).toEqual(['1']);
  });

  it('matches the parent case-insensitively and orders by name', () => {
    const level = treeLevel(tree, 'docs');
    expect(level.folders.map((f) => f.path)).toEqual(['docs/sub']);
    expect(level.documents.map((d) => d.id)).toEqual(['3', '2']);
  });
});

/**
 * Contract with the Runtime `validatePath` (specflow-runtime documents/demo/addition.test.ts holds the
 * same table): the client rejects every name the server would reject, so the server stays the source
 * of truth and the client only saves a round trip.
 */
const nameContract: readonly { name: string; kind: 'document' | 'folder'; valid: boolean }[] = [
  { name: 'notes', kind: 'document', valid: true },
  { name: 'a.txt', kind: 'document', valid: true },
  { name: 'Report 2024', kind: 'folder', valid: true },
  { name: 'con-notes.md', kind: 'document', valid: true },
  { name: 'com0.md', kind: 'document', valid: true },
  { name: 'CON.md', kind: 'document', valid: false },
  { name: 'con', kind: 'document', valid: false },
  { name: 'nul.txt', kind: 'document', valid: false },
  { name: 'LPT9.md', kind: 'document', valid: false },
  { name: 'AUX', kind: 'folder', valid: false },
  { name: '.hidden.md', kind: 'document', valid: false },
  { name: '.git', kind: 'folder', valid: false },
  { name: 'a:b.md', kind: 'document', valid: false },
  { name: 'a?b', kind: 'folder', valid: false },
  { name: 'trail.', kind: 'folder', valid: false },
  { name: 'a.png', kind: 'document', valid: false },
];
describe('inline entry names match the Runtime path rules', () => {
  it.each(nameContract)('$kind "$name" is valid: $valid', ({ name, kind, valid }) => {
    expect(entryNameError(name, kind) === undefined).toBe(valid);
  });
  it('explains hidden and reserved names', () => {
    expect(rawEntryNameError('.hidden.md', 'document')).toEqual({
      key: 'documents.tree.nameError.dot',
    });
    expect(rawEntryNameError('CON.md', 'document')).toEqual({
      key: 'documents.tree.nameError.reserved',
    });
  });
});

describe('createTreeIndex', () => {
  /** Counts how often the source lists are read element by element. */
  function counted<T extends object>(items: T[]) {
    const reads = { count: 0 };
    const proxy = new Proxy(items, {
      get(target, key, receiver) {
        if (typeof key === 'string' && /^\d+$/.test(key)) reads.count++;
        return Reflect.get(target, key, receiver) as unknown;
      },
    });
    return { proxy, reads };
  }
  /** 40 top folders x 4 nested folders x 10 documents plus root files: over 2000 nodes. */
  function largeTree() {
    const folders: { path: string }[] = [];
    const documents: { id: string; path: string }[] = [];
    for (let top = 0; top < 40; top++) {
      folders.push({ path: `f${top}` });
      for (let sub = 0; sub < 4; sub++) {
        folders.push({ path: `f${top}/s${sub}` });
        for (let doc = 0; doc < 10; doc++)
          documents.push({ id: `${top}-${sub}-${doc}`, path: `f${top}/s${sub}/d${doc}.md` });
      }
      for (let doc = 0; doc < 10; doc++)
        documents.push({ id: `${top}-${doc}`, path: `f${top}/d${doc}.md` });
    }
    for (let doc = 0; doc < 100; doc++)
      documents.push({ id: `root-${doc}`, path: `root${doc}.md` });
    return { folders, documents };
  }

  it('reads the source lists once, however many levels are looked up', () => {
    const source = largeTree();
    const folders = counted(source.folders);
    const documents = counted(source.documents);
    const index = createTreeIndex({
      folders: folders.proxy,
      documents: documents.proxy,
    });
    const total = source.folders.length + source.documents.length;
    expect(total).toBeGreaterThanOrEqual(2000);
    const afterBuild = folders.reads.count + documents.reads.count;
    expect(afterBuild).toBeLessThanOrEqual(total);
    // Rendering asks for every level twice (the level itself and its parent's emptiness check).
    for (const folder of source.folders) {
      index.level(folder.path);
      index.level(folder.path);
    }
    index.level('');
    expect(folders.reads.count + documents.reads.count).toBe(afterBuild);
  });

  it('gives the same answer as treeLevel and memoizes the result per parent', () => {
    const source = largeTree() as unknown as Parameters<typeof createTreeIndex>[0];
    const index = createTreeIndex(source);
    for (const parent of ['', 'f3', 'F3/S1', 'missing']) {
      const expected = treeLevel(source, parent);
      expect(index.level(parent)).toEqual(expected);
    }
    expect(index.level('f3')).toBe(index.level('F3'));
  });
});

describe('folder operation policy', () => {
  const tree = documentTreeFixture({ revision: 'tree-1', folders: ['notes'] });

  it('uses the folder revision, never the tree revision', () => {
    expect(folderOperationRevision(tree, 'notes')).toBe(folderRevisionFixture('notes'));
    expect(folderOperationRevision(tree, '')).toBeUndefined();
    expect(folderOperationRevision(tree, 'missing')).toBeUndefined();
  });

  it('offers no rename, move or delete for a folder without a revision', () => {
    const [root, notes] = tree.folders;
    expect(folderActions(notes!)).toBe(notes!.actions);
    const { revision: _revision, ...withoutRevision } = notes!;
    expect(folderActions(withoutRevision)).toEqual({
      rename: { available: false, reason: 'root' },
      move: { available: false, reason: 'root' },
      delete: { available: false, reason: 'root' },
    });
    expect(folderActions(root!).rename.available).toBe(false);
  });
});

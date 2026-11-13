import { describe, expect, it } from 'vitest';
import type { WorkspaceDocsTreeDocument } from '@nevo/specflow-contracts/docs';
import { buildDocsTree, treeKeyTarget, visibleRows } from './docsTreeModel';

const doc = (path: string, title: string, extra: Partial<WorkspaceDocsTreeDocument> = {}) => ({
  documentId: path,
  title,
  type: 'guide',
  status: 'current',
  path,
  summary: '',
  nonAuthoritative: false,
  ...extra,
});

const documents = [
  doc('b.md', 'Beta'),
  doc('README.md', 'Zeta index'),
  doc('guide/z.md', 'Zulu'),
  doc('Guide2/a.md', 'Alpha'),
  doc('guide/README.md', 'Guide hub'),
  doc('ideas/x/one.md', 'One', { nonAuthoritative: true }),
  doc('ideas/two.md', 'Two', { nonAuthoritative: true }),
];

describe('documentation tree model', () => {
  it('orders folders first, the hub first, then titles; labels the owning non-authoritative folder once', () => {
    const root = buildDocsTree(documents);
    expect(root.folders.map((folder) => folder.name)).toEqual(['guide', 'Guide2', 'ideas']);
    expect(root.documents.map((item) => item.title)).toEqual(['Zeta index', 'Beta']);
    expect(root.folders[0]!.documents.map((item) => item.title)).toEqual(['Guide hub', 'Zulu']);
    const ideas = root.folders[2]!;
    expect(ideas.ownsNonAuthoritative).toBe(true);
    expect(ideas.folders[0]!.ownsNonAuthoritative).toBe(false);
    expect(root.folders[0]!.ownsNonAuthoritative).toBe(false);
  });

  it('moves along the visible rows: arrows, Home/End, Right into a folder, Left to its parent', () => {
    const root = buildDocsTree(documents);
    const expanded = new Set(['guide']);
    const rows = visibleRows(root, expanded);
    expect(rows.map((row) => row.key)).toEqual([
      'folder:guide',
      'document:guide/README.md',
      'document:guide/z.md',
      'folder:Guide2',
      'folder:ideas',
      'document:README.md',
      'document:b.md',
    ]);
    expect(treeKeyTarget(rows, 'folder:guide', 'ArrowRight', expanded)).toEqual({
      focus: 'document:guide/README.md',
    });
    expect(treeKeyTarget(rows, 'folder:Guide2', 'ArrowRight', expanded)).toEqual({
      toggle: 'Guide2',
    });
    expect(treeKeyTarget(rows, 'document:guide/z.md', 'ArrowLeft', expanded)).toEqual({
      focus: 'folder:guide',
    });
    expect(treeKeyTarget(rows, 'folder:guide', 'ArrowLeft', expanded)).toEqual({ toggle: 'guide' });
    expect(treeKeyTarget(rows, 'folder:guide', 'End', expanded)).toEqual({
      focus: 'document:b.md',
    });
    expect(treeKeyTarget(rows, 'document:b.md', 'Home', expanded)).toEqual({
      focus: 'folder:guide',
    });
    expect(treeKeyTarget(rows, 'document:b.md', 'ArrowDown', expanded)).toBeUndefined();
  });
});
